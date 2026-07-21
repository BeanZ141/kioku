import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import * as exifr from 'exifr'
import sharp from 'sharp'
import crypto from 'node:crypto'

initializeApp()

const R2_BUCKET = 'kioku-media'

function safeFilename(filename) {
  return String(filename || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180)
}

function createUploadTicket(payload) {
  const secret = process.env.ARCHIVE_UPLOAD_SECRET
  if (!secret) throw new HttpsError('failed-precondition', 'Upload signing is not configured.')
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
}

async function makeR2Variant(r2, buffer, publicBase, id, folder, width, quality = 65) {
  const out = await sharp(buffer)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .avif({ quality })
    .toBuffer()
  const key = `${folder}/${id}.avif`
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: out, ContentType: 'image/avif',
    CacheControl: 'public, max-age=31536000, immutable',
  }))
  return `${publicBase}/${key}`
}

function filenameDate(filename) {
  const name = filename || ''
  const picsart = name.match(/(?:picsart[_-])?(\\d{2})-(\\d{2})-(\\d{2})[_-](\\d{2})-(\\d{2})-(\\d{2})/i)
  if (picsart) return new Date(Date.UTC(2000 + Number(picsart[1]), Number(picsart[2]) - 1, Number(picsart[3]), Number(picsart[4]), Number(picsart[5]), Number(picsart[6])))
  const pixel = name.match(/(?:PXL|IMG|Screenshot)[_-]?(20\\d{2})[._-]?(\\d{2})[._-]?(\\d{2})[_ -]?(\\d{2})[._-]?(\\d{2})[._-]?(\\d{2})/i)
  if (pixel) return new Date(Date.UTC(Number(pixel[1]), Number(pixel[2]) - 1, Number(pixel[3]), Number(pixel[4]), Number(pixel[5]), Number(pixel[6])))
  return null
}

function mediaIndex({ filename, note, tags, dateTaken }) {
  const date = dateTaken instanceof Date && !Number.isNaN(date.getTime()) ? dateTaken : new Date()
  const cleanTags = [...new Set((tags || []).map((tag) => String(tag).trim()).filter(Boolean))]
  return {
    yearMonth: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
    tagCount: cleanTags.length,
    searchText: [filename, note || '', ...cleanTags, date.toISOString(), String(date.getUTCFullYear())].join(' ').toLocaleLowerCase(),
  }
}

/* ─── Auth: issue session token ─── */
export const issueArchiveSession = onCall(async (request) => {
  const passphrase = process.env.ARCHIVE_PASSPHRASE || 'memory'
  if (!request.data?.passcode || request.data.passcode !== passphrase) {
    throw new HttpsError('permission-denied', 'The archive passcode was not recognised.')
  }
  return { token: await getAuth().createCustomToken('archive-v1') }
})

/* Creates a single-path, 15-minute R2 upload ticket. The signing secret never reaches the browser. */
export const createArchiveUpload = onCall(async (request) => {
  if (request.auth?.uid !== 'archive-v1') {
    throw new HttpsError('unauthenticated', 'Unlock the archive first.')
  }
  const filename = safeFilename(request.data?.filename)
  const contentType = request.data?.contentType || 'application/octet-stream'
  const size = Number(request.data?.size || 0)
  if (!filename || !contentType.startsWith('image/') || !Number.isFinite(size) || size <= 0 || size > 50 * 1024 * 1024) {
    throw new HttpsError('invalid-argument', 'Use an image smaller than 50 MB.')
  }
  const id = crypto.randomUUID()
  const key = `originals/${id}-${filename}`
  const expiresAt = Date.now() + 15 * 60 * 1000
  return { id, key, ticket: createUploadTicket({ key, exp: expiresAt }), expiresAt }
})

/* ─── Process: download from R2, resize, upload derivatives, write Firestore ─── */
export const processR2Upload = onCall(
  {
    memory: '1GiB',
    timeoutSeconds: 300,
  },
  async (request) => {
    if (request.auth?.uid !== 'archive-v1') {
      throw new HttpsError('unauthenticated', 'Unlock the archive first.')
    }

    const { id, filename, tags, note, capturedAt, contentType } = request.data || {}
    if (!id || !filename) {
      throw new HttpsError('invalid-argument', 'Missing id or filename.')
    }

    const r2 = getR2Client()
    const originalKey = `originals/${id}-${safeFilename(filename)}`
    const publicBase = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')

    // 1. Download original from R2
    const getCmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: originalKey })
    const response = await r2.send(getCmd)
    const chunks = []
    for await (const chunk of response.Body) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)

    // 2. Parse EXIF + image metadata
    const [metadata, imageInfo] = await Promise.all([
      exifr.parse(buffer, { gps: true }).catch(() => null),
      sharp(buffer, { animated: false }).metadata(),
    ])

    // 3. Generate AVIF derivatives
    const [thumbUrl, displayUrl, spaceUrl, tagUrl] = await Promise.all([
      makeR2Variant(r2, buffer, publicBase, id, 'thumbs', 720),
      makeR2Variant(r2, buffer, publicBase, id, 'display', 1800),
      makeR2Variant(r2, buffer, publicBase, id, 'space', 160, 50),
      makeR2Variant(r2, buffer, publicBase, id, 'tags', 320, 50),
    ])

    // 4. Write metadata to Firestore
    const requestedDate = capturedAt
      ? new Date(capturedAt)
      : metadata?.DateTimeOriginal || metadata?.CreateDate || filenameDate(filename) || new Date()
    const dateTaken = requestedDate instanceof Date && !Number.isNaN(requestedDate.getTime()) ? requestedDate : new Date()
    const cleanTags = [...new Set((tags || []).map((tag) => String(tag).trim()).filter(Boolean))]

    await getFirestore().collection('media').doc(id).set({
      originalPath: originalKey,
      originalUrl: `${publicBase}/${originalKey}`,
      thumbUrl,
      displayUrl,
      spaceUrl,
      tagUrl,
      filename,
      mimeType: contentType || 'image/jpeg',
      fileSize: buffer.length,
      width: imageInfo.width || null,
      height: imageInfo.height || null,
      megapixels: imageInfo.width && imageInfo.height
        ? Number(((imageInfo.width * imageInfo.height) / 1e6).toFixed(1))
        : null,
      dateTaken,
      location: metadata?.latitude
        ? { latitude: metadata.latitude, longitude: metadata.longitude }
        : null,
      camera: [metadata?.Make, metadata?.Model].filter(Boolean).join(' ') || null,
      lens: metadata?.LensModel || null,
      exposure: metadata?.ExposureTime || null,
      tags: cleanTags,
      note: note || '',
      ...mediaIndex({ filename, note, tags: cleanTags, dateTaken }),
      originalFilename: filename,
      source: 'upload',
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    return { ok: true, thumbUrl, displayUrl, spaceUrl, tagUrl }
  }
  )

export const deleteArchiveMedia = onCall(async (request) => {
  if (request.auth?.uid !== 'archive-v1') {
    throw new HttpsError('unauthenticated', 'Unlock the archive first.')
  }
  const id = String(request.data?.id || '')
  if (!id) throw new HttpsError('invalid-argument', 'Missing media id.')

  const store = getFirestore()
  const reference = store.collection('media').doc(id)
  const snapshot = await reference.get()
  if (!snapshot.exists) return { ok: true }

  const originalPath = snapshot.data().originalPath
  const keys = [originalPath, `thumbs/${id}.avif`, `display/${id}.avif`, `space/${id}.avif`, `tags/${id}.avif`].filter(Boolean)
  await getR2Client().send(new DeleteObjectsCommand({
    Bucket: R2_BUCKET,
    Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
  }))
  await reference.delete()
  return { ok: true }
})

/* Backfills eight legacy records at a time; call repeatedly from the manager. */
export const backfillArchiveVariants = onCall({ memory: '1GiB', timeoutSeconds: 300 }, async (request) => {
  if (request.auth?.uid !== 'archive-v1') throw new HttpsError('unauthenticated', 'Unlock the archive first.')
  const store = getFirestore()
  const pending = (await store.collection('media').limit(500).get()).docs
    .filter((snapshot) => (!snapshot.data().spaceUrl || !snapshot.data().tagUrl) && !snapshot.data().variantBackfillFailed)
    .slice(0, 8)
  if (!pending.length) return { processed: 0, remaining: 0 }
  const r2 = getR2Client()
  const publicBase = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')
  let processed = 0
  for (const snapshot of pending) {
    const item = snapshot.data()
    if (!item.originalPath) continue
    try {
      const response = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: item.originalPath }))
      const chunks = []
      for await (const chunk of response.Body) chunks.push(chunk)
      const buffer = Buffer.concat(chunks)
      const [spaceUrl, tagUrl] = await Promise.all([
        makeR2Variant(r2, buffer, publicBase, snapshot.id, 'space', 160, 50),
        makeR2Variant(r2, buffer, publicBase, snapshot.id, 'tags', 320, 50),
      ])
      await snapshot.ref.update({ spaceUrl, tagUrl })
      processed++
    } catch (error) {
      console.error(`Could not backfill ${snapshot.id}`, error)
      await snapshot.ref.update({ variantBackfillFailed: true })
    }
  }
  return { processed, remaining: Math.max(0, pending.length - processed) }
})
