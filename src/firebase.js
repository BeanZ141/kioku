import { initializeApp } from 'firebase/app'
import { getFirestore, collection, query, where, orderBy, getDocs, doc, getDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, startAfter, limit } from 'firebase/firestore'
import { getAuth, signInWithCustomToken, signOut, onAuthStateChanged } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import * as exifr from 'exifr'
import { resolveCaptureDate } from './date'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseReady = Boolean(config.apiKey && config.projectId && config.appId)
const app = firebaseReady ? initializeApp(config) : null
const db = app ? getFirestore(app) : null
const auth = app ? getAuth(app) : null
const functions = app ? getFunctions(app, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1') : null

const WORKER_URL = import.meta.env.VITE_UPLOAD_WORKER_URL || ''
let localDemoMode = false

export function isLocalDemoMode() {
  return localDemoMode
}

export function buildSearchText({ filename = '', note = '', tags = [], dateTaken = null }) {
  const date = dateTaken ? new Date(dateTaken) : null
  const dateParts = date && !Number.isNaN(date.getTime())
    ? [date.toLocaleDateString('en-US', { dateStyle: 'long' }), date.toLocaleTimeString('en-US'), date.toISOString().slice(0, 10), String(date.getFullYear()), String(date.getMonth() + 1), String(date.getDate())]
    : []
  return [filename, note, ...tags, ...dateParts].join(' ').toLocaleLowerCase()
}

function archiveIndex({ filename, note, tags, dateTaken }) {
  const date = new Date(dateTaken)
  const validDate = !Number.isNaN(date.getTime()) ? date : new Date()
  const cleanTags = [...new Set((tags || []).map((tag) => tag.trim()).filter(Boolean))]
  return {
    yearMonth: `${validDate.getFullYear()}-${String(validDate.getMonth() + 1).padStart(2, '0')}`,
    tagCount: cleanTags.length,
    searchText: buildSearchText({ filename, note, tags: cleanTags, dateTaken: validDate }),
  }
}

// Helper to resize image client-side to WebP blob
function resizeImageToBlob(file, maxDim, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let w = img.width
      let h = img.height
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h)
        w = Math.round(w * scale)
        h = Math.round(h * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob((blob) => {
        if (blob) resolve({ blob, width: w, height: h })
        else reject(new Error('WebP blob creation failed'))
      }, 'image/webp', quality)
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl)
      reject(err)
    }
    img.src = objectUrl
  })
}

// Helper to get original image dimensions
function getOriginalDimensions(file) {
  return new Promise((resolve) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({ width: img.width, height: img.height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({ width: null, height: null })
    }
    img.src = objectUrl
  })
}

export async function ensureAuth() {
  if (!firebaseReady || !auth) return null
  if (auth.currentUser) return auth.currentUser

  // 1. Wait for Firebase Auth to finish restoring session from IndexedDB on page load
  const restoredUser = await new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe()
      resolve(user)
    })
    setTimeout(() => resolve(auth.currentUser), 1500)
  })

  if (restoredUser) return restoredUser

  // 2. Auto-renew session if passcode is stored in session storage or prompt user
  let savedPasscode = sessionStorage.getItem('kioku-passcode')
  if (!savedPasscode && typeof window !== 'undefined') {
    const input = window.prompt('Enter your Archive Passcode to authorize admin changes/deletion:')
    if (input) {
      savedPasscode = input.trim()
    }
  }

  if (savedPasscode && functions) {
    try {
      const issueSession = httpsCallable(functions, 'issueArchiveSession')
      const { data } = await issueSession({ passcode: savedPasscode })
      const userCredential = await signInWithCustomToken(auth, data.token)
      sessionStorage.setItem('kioku-passcode', savedPasscode)
      return userCredential.user
    } catch (err) {
      console.warn('Auto re-authentication failed:', err)
      sessionStorage.removeItem('kioku-passcode')
      throw new Error('Invalid passcode provided for archive session.')
    }
  }

  return auth.currentUser
}

export async function unlock(passcode) {
  const demoPasscode = import.meta.env.VITE_DEMO_PASSCODE || 'memory'
  if (import.meta.env.DEV && passcode === demoPasscode) {
    localDemoMode = true
    return { demo: true }
  }
  if (!firebaseReady || !auth || !functions) throw new Error('Archive sign-in is not configured.')
  const issueSession = httpsCallable(functions, 'issueArchiveSession')
  const { data } = await issueSession({ passcode })
  await signInWithCustomToken(auth, data.token)
  sessionStorage.setItem('kioku-passcode', passcode)
  localDemoMode = false
  return { demo: false }
}

export async function lockArchive() {
  localDemoMode = false
  sessionStorage.removeItem('kioku-passcode')
  if (auth) await signOut(auth)
}

/**
 * Uploads with a short-lived, single-object ticket. Permanent credentials never reach the browser.
 */
export async function uploadOriginal(file, tags, note, capturedAt) {
  const isSandbox = localStorage.getItem('kioku-sandbox') === 'yes'

  // If firebase configs or worker URL aren't available, force sandbox mode
  const forceSandbox = !firebaseReady || !WORKER_URL || !functions || !auth?.currentUser
  const activeSandbox = isSandbox || forceSandbox

  const id = crypto.randomUUID()
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')

  const origDims = await getOriginalDimensions(file)

  // Extract EXIF & resolve capture date
  const metadata = await exifr.parse(file, { gps: true }).catch(() => null)
  const exifDate = metadata?.DateTimeOriginal || metadata?.CreateDate || null
  const dateTaken = resolveCaptureDate(file.name, exifDate, capturedAt)

  if (activeSandbox) {
    // Sandbox Mode: Simulate upload delays, construct blob URLs, and write nothing to servers
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const previewUrl = URL.createObjectURL(file)
    const mockDoc = {
      id,
      filename: safeFilename,
      note: note || '',
      tags: (tags || []).filter(Boolean),
      dateTaken: dateTaken.toISOString(),
      width: origDims.width || '—',
      height: origDims.height || '—',
      megapixels: origDims.width && origDims.height
        ? `${((origDims.width * origDims.height) / 1e6).toFixed(1)} MP`
        : '—',
      fileSize: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      type: file.type || 'Image',
      location: metadata?.latitude ? `${metadata.latitude.toFixed(4)}, ${metadata.longitude.toFixed(4)}` : null,
      camera: [metadata?.Make, metadata?.Model].filter(Boolean).join(' ') || null,
      lens: metadata?.LensModel || null,
      exposure: metadata?.ExposureTime || null,
      src: previewUrl,
      thumbSrc: previewUrl,
      originalSrc: previewUrl,
      imported: true, // Tagged so app knows this is a mock sandbox upload
    }

    // Append to local media state in memory (handled at application level)
    return mockDoc
  }

  const createUpload = httpsCallable(functions, 'createArchiveUpload')
  const processUpload = httpsCallable(functions, 'processR2Upload')
  const { data: ticket } = await createUpload({ filename: file.name, contentType: file.type, size: file.size })
  const response = await fetch(`${WORKER_URL}/upload/${encodeURIComponent(ticket.key)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${ticket.ticket}`, 'Content-Type': file.type || 'image/webp' },
    body: file,
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || `Upload for ${file.name} failed`)
  }
  const { data: processed } = await processUpload({
    id: ticket.id,
    filename: file.name,
    tags: (tags || []).filter(Boolean),
    note: note || '',
    capturedAt: dateTaken.toISOString(),
    contentType: file.type || 'image/webp',
  })

  return {
    id,
    filename: file.name,
    dateTaken: dateTaken.toISOString(),
    tags: (tags || []).filter(Boolean),
    note: note || '',
    width: origDims.width || '—',
    height: origDims.height || '—',
    megapixels: origDims.width && origDims.height ? `${((origDims.width * origDims.height) / 1e6).toFixed(1)} MP` : '—',
    fileSize: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
    type: file.type || 'Image',
    location: metadata?.latitude ? `${metadata.latitude.toFixed(4)}, ${metadata.longitude.toFixed(4)}` : null,
    camera: [metadata?.Make, metadata?.Model].filter(Boolean).join(' ') || null,
    lens: metadata?.LensModel || null,
    exposure: metadata?.exposure || null,
    src: processed.displayUrl,
    thumbSrc: processed.thumbUrl,
    spaceSrc: processed.spaceUrl,
    tagSrc: processed.tagUrl,
    originalSrc: '',
  }
}

/**
 * Load all archive media by querying Firestore directly.
 */
// Keep the complete personal archive available to Calendar and Kūkan. The Library
// still lazy-loads image elements as they approach the viewport.
export async function loadArchiveMedia(cursor = null, pageSize = 500) {
  if (localDemoMode) {
    const response = await fetch('/api/media')
    if (!response.ok) throw new Error('Local showcase media is not available.')
    const items = await response.json()
    return { items, cursor: null, hasMore: false }
  }
  if (!firebaseReady || !db) return []

  const constraints = [orderBy('dateTaken', 'desc'), limit(pageSize)]
  if (cursor) constraints.push(startAfter(cursor))
  const q = query(collection(db, 'media'), ...constraints)
  const snapshot = await getDocs(q)

  return {
    items: snapshot.docs.map((doc) => {
      const item = doc.data()
      return {
        id: doc.id,
        filename: item.originalFilename || item.filename,
        note: item.note || '',
        tags: item.tags || [],
        coverForTags: item.coverForTags || [],
        dateTaken: item.dateTaken?.toDate?.()?.toISOString?.() || new Date().toISOString(),
        width: item.width || '—',
        height: item.height || '—',
        megapixels: item.megapixels ? `${item.megapixels} MP` : '—',
        fileSize: item.fileSize ? `${(item.fileSize / 1024 / 1024).toFixed(1)} MB` : '—',
        type: item.mimeType || 'Image',
        location: item.location ? `${item.location.latitude.toFixed(4)}, ${item.location.longitude.toFixed(4)}` : null,
        camera: item.camera || null,
        lens: item.lens || null,
        exposure: item.exposure || null,
        src: item.displayUrl || item.originalUrl || '',
        thumbSrc: item.thumbUrl || item.displayUrl || '',
        spaceSrc: item.spaceUrl || item.thumbUrl || item.displayUrl || '',
        tagSrc: item.tagUrl || item.thumbUrl || item.displayUrl || '',
        originalSrc: item.originalUrl || '',
        imported: false,
        searchText: item.searchText || buildSearchText({
          filename: item.originalFilename || item.filename,
          note: item.note,
          tags: item.tags,
          dateTaken: item.dateTaken?.toDate?.(),
        }),
      }
    }), cursor: snapshot.docs.at(-1) || null, hasMore: snapshot.docs.length === pageSize
  }
}

/**
 * Update tags and notes for an archive item directly in Firestore.
 */
export async function updateMediaItem(id, tags, note) {
  if (!firebaseReady || !db) return
  const mediaRef = doc(db, 'media', id)
  const current = await getDoc(mediaRef)
  const data = current.data() || {}
  const cleanTags = (tags || []).filter(Boolean)
  await updateDoc(mediaRef, {
    tags: cleanTags,
    note: note || '',
    ...archiveIndex({
      filename: data.originalFilename || data.filename,
      note: note || '',
      tags: cleanTags,
      dateTaken: data.dateTaken?.toDate?.(),
    }),
    updatedAt: serverTimestamp(),
  })
}

export async function updateMediaMetadata(id, fields) {
  if (!firebaseReady || !db || !id) return
  const mediaRef = doc(db, 'media', id)
  const current = await getDoc(mediaRef)
  const currentData = current.data() || {}
  const updates = { updatedAt: serverTimestamp() }

  if (fields.dateTaken !== undefined) {
    const d = new Date(fields.dateTaken)
    updates.dateTaken = !isNaN(d.getTime()) ? d : serverTimestamp()
  }
  if (fields.camera !== undefined) updates.camera = fields.camera || null
  if (fields.lens !== undefined) updates.lens = fields.lens || null
  if (fields.exposure !== undefined) updates.exposure = fields.exposure || null
  if (fields.location !== undefined) {
    if (typeof fields.location === 'string') {
      const parts = fields.location.split(',').map((s) => parseFloat(s.trim()))
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        updates.location = { latitude: parts[0], longitude: parts[1] }
      } else {
        updates.location = null
      }
    } else {
      updates.location = fields.location
    }
  }
  if (fields.note !== undefined) updates.note = fields.note || ''
  if (fields.tags !== undefined) updates.tags = (fields.tags || []).filter(Boolean)

  const indexedDate = fields.dateTaken !== undefined ? new Date(fields.dateTaken) : currentData.dateTaken?.toDate?.()
  updates.yearMonth = archiveIndex({
    filename: currentData.originalFilename || currentData.filename,
    note: fields.note !== undefined ? fields.note || '' : currentData.note || '',
    tags: fields.tags !== undefined ? updates.tags : currentData.tags || [],
    dateTaken: indexedDate,
  }).yearMonth
  updates.tagCount = archiveIndex({
    filename: currentData.originalFilename || currentData.filename,
    note: fields.note !== undefined ? fields.note || '' : currentData.note || '',
    tags: fields.tags !== undefined ? updates.tags : currentData.tags || [],
    dateTaken: indexedDate,
  }).tagCount
  updates.searchText = buildSearchText({
    filename: currentData.originalFilename || currentData.filename,
    note: fields.note !== undefined ? fields.note || '' : currentData.note || '',
    tags: fields.tags !== undefined ? updates.tags : currentData.tags || [],
    dateTaken: indexedDate,
  })

  await updateDoc(mediaRef, updates)
}

export async function updateMediaItems(items, selectedTags, mode) {
  if (!firebaseReady || !db || !items.length) return
  const cleanTags = [...new Set(selectedTags.map((tag) => tag.trim()).filter(Boolean))]
  for (let start = 0; start < items.length; start += 400) {
    const batch = writeBatch(db)
    for (const item of items.slice(start, start + 400)) {
      const tags = mode === 'replace'
        ? cleanTags
        : [...new Set([...(item.tags || []), ...cleanTags])]
      batch.update(doc(db, 'media', item.id), {
        tags,
        ...archiveIndex({ filename: item.filename, note: item.note, tags, dateTaken: item.dateTaken }),
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
  }
}

export async function removeTagFromArchive(tagToRemove) {
  if (!firebaseReady || !db || !tagToRemove) return
  const q = query(collection(db, 'media'), where('tags', 'array-contains', tagToRemove))
  const snapshot = await getDocs(q)
  if (snapshot.empty) return
  const batch = writeBatch(db)
  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data()
    const updatedTags = (data.tags || []).filter((t) => t !== tagToRemove)
    batch.update(docSnap.ref, {
      tags: updatedTags,
      ...archiveIndex({
        filename: data.originalFilename || data.filename,
        note: data.note,
        tags: updatedTags,
        dateTaken: data.dateTaken?.toDate?.(),
      }),
      updatedAt: serverTimestamp(),
    })
  })
  await batch.commit()
}

export async function backfillArchiveVariants(onProgress) {
  onProgress?.(0)
  return 0
}

export async function deleteMediaItem(item) {
  if (!item || !item.id) return

  const isSandbox = localStorage.getItem('kioku-sandbox') === 'yes'
  if (isSandbox) {
    await new Promise((resolve) => setTimeout(resolve, 300))
    return
  }

  if (!firebaseReady) {
    throw new Error('Firebase is not configured or connected.')
  }

  // Ensure active Firebase authentication (restores session from IndexedDB or re-authenticates)
  const currentUser = await ensureAuth()
  if (!currentUser) {
    throw new Error('Archive session unauthenticated. Please re-enter your passcode.')
  }

  let deleted = false
  let lastError = null

  // 1. Attempt Cloud Function to delete R2 storage files and Firestore record
  if (functions) {
    try {
      const remove = httpsCallable(functions, 'deleteArchiveMedia')
      const result = await remove({ id: item.id })
      if (result?.data?.ok) {
        deleted = true
      }
    } catch (err) {
      console.warn('R2 storage delete function notice:', err)
      lastError = err
    }
  }

  // 2. Direct Firestore deletion (guarantees removal from database)
  if (db) {
    try {
      const mediaRef = doc(db, 'media', item.id)
      await deleteDoc(mediaRef)
      deleted = true
    } catch (err) {
      console.warn('Firestore direct delete notice:', err)
      if (!lastError) lastError = err
    }
  }

  if (!deleted) {
    throw new Error(lastError?.message || 'Failed to delete image. Permission denied.')
  }
}

export async function setTagCover(tag, mediaId, mediaItems) {
  if (!firebaseReady || !db) return

  const batch = writeBatch(db)

  // Remove tag cover from any existing media items
  for (const item of mediaItems) {
    if (item.coverForTags?.includes(tag)) {
      const newCovers = item.coverForTags.filter((t) => t !== tag)
      batch.update(doc(db, 'media', item.id), {
        coverForTags: newCovers,
        updatedAt: serverTimestamp(),
      })
    }
  }

  // Set new tag cover
  if (mediaId) {
    const targetItem = mediaItems.find((m) => m.id === mediaId)
    const currentCovers = targetItem?.coverForTags || []
    const newCovers = [...new Set([...currentCovers, tag])]
    batch.update(doc(db, 'media', mediaId), {
      coverForTags: newCovers,
      updatedAt: serverTimestamp(),
    })
  }

  await batch.commit()
}

/**
 * Check if a file with the given originalFilename has already been uploaded.
 */
