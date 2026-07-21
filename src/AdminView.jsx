import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import JSZip from 'jszip'
import * as exifr from 'exifr'
import { Virtuoso } from 'react-virtuoso'
import ArchiveImage from './components/ArchiveImage'
import { uploadOriginal, firebaseReady, loadArchiveMedia, updateMediaItems, updateMediaMetadata, removeTagFromArchive, backfillArchiveVariants, deleteMediaItem, setTagCover } from './firebase'
import { resolveCaptureDate } from './date'

/* ─── Fast WebP conversion using createImageBitmap + OffscreenCanvas ─── */
function convertToWebp(file, quality) {
  return new Promise(async (resolve, reject) => {
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()

      const blob = await canvas.convertToBlob({ type: 'image/webp', quality: quality / 100 })
      resolve(blob)
    } catch {
      // Fallback for browsers without OffscreenCanvas
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        c.getContext('2d').drawImage(img, 0, 0)
        c.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Conversion failed'))),
          'image/webp',
          quality / 100
        )
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Load failed')) }
      img.src = url
    }
  })
}

/* ─── Parallel pool: run N tasks concurrently ─── */
async function parallelPool(items, concurrency, fn, onProgress) {
  let idx = 0
  let done = 0
  const results = new Array(items.length)

  const next = async () => {
    while (idx < items.length) {
      const i = idx++
      results[i] = await fn(items[i], i)
      done++
      onProgress?.(done)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => next())
  await Promise.all(workers)
  return results
}

const fmt = (bytes) => {
  if (!bytes) return '0 B'
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

const fmtTime = (seconds) => {
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.ceil(seconds % 60)
  return `${m}m ${s}s`
}

function getLogStyle(log) {
  if (log.includes('[ERROR]') || log.includes('Failed:') || log.includes('Error:')) {
    return { color: '#ef4444', fontWeight: 500 }
  }
  if (log.includes('[WARNING]') || log.includes('Warning:') || log.includes('errors')) {
    return { color: '#f59e0b', fontWeight: 500 }
  }
  if (log.includes('[SUCCESS]') || log.includes('Success:') || log.includes('successfully')) {
    return { color: '#2ecc71', fontWeight: 500 }
  }
  return { color: 'var(--ink)' }
}

function AccordionSection({ id, num, title, children }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={`admin-accordion-section ${open ? 'is-open' : ''}`} id={id}>
      <button
        type="button"
        className="admin-accordion-header"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="q">{num}</span>
        <h2>{title}</h2>
        <span className="accordion-icon">+</span>
      </button>
      <div className="admin-accordion-collapse">
        <div className="admin-accordion-inner">
          {children}
        </div>
      </div>
    </div>
  )
}

function MetadataEditorSection({ media, setMedia, loading, refreshMedia }) {
  const [selectedId, setSelectedId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [dateTakenInput, setDateTakenInput] = useState('')
  const [cameraInput, setCameraInput] = useState('')
  const [lensInput, setLensInput] = useState('')
  const [exposureInput, setExposureInput] = useState('')
  const [locationInput, setLocationInput] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [tagsInput, setTagsInput] = useState([])
  const [newTagText, setNewTagText] = useState('')

  const selectedItem = useMemo(() => media.find((m) => m.id === selectedId), [media, selectedId])

  const availableTags = useMemo(() => {
    const defaultTags = ['Animals', 'Architecture', 'Food', 'Nature', 'Objects', 'People', 'Travel', 'Unsorted']
    const dbTags = media.flatMap((item) => item.tags || [])
    return [...new Set([...defaultTags, ...dbTags])].sort()
  }, [media])

  useEffect(() => {
    if (selectedItem) {
      if (selectedItem.dateTaken) {
        const d = new Date(selectedItem.dateTaken)
        if (!isNaN(d.getTime())) {
          const YYYY = d.getFullYear()
          const MM = String(d.getMonth() + 1).padStart(2, '0')
          const DD = String(d.getDate()).padStart(2, '0')
          const hh = String(d.getHours()).padStart(2, '0')
          const mm = String(d.getMinutes()).padStart(2, '0')
          setDateTakenInput(`${YYYY}-${MM}-${DD}T${hh}:${mm}`)
        } else {
          setDateTakenInput('')
        }
      } else {
        setDateTakenInput('')
      }
      setCameraInput(selectedItem.camera || '')
      setLensInput(selectedItem.lens || '')
      setExposureInput(selectedItem.exposure || '')
      setLocationInput(selectedItem.location || '')
      setNoteInput(selectedItem.note || '')
      setTagsInput(selectedItem.tags || [])
      setMessage('')
    }
  }, [selectedItem])

  const handleSave = async () => {
    if (!selectedId) return
    setSaving(true)
    setMessage('')
    try {
      const parsedDate = dateTakenInput ? new Date(dateTakenInput).toISOString() : new Date().toISOString()
      const fieldsToUpdate = {
        dateTaken: parsedDate,
        camera: cameraInput,
        lens: lensInput,
        exposure: exposureInput,
        location: locationInput,
        note: noteInput,
        tags: tagsInput,
      }

      await updateMediaMetadata(selectedId, fieldsToUpdate)

      setMedia((current) => current.map((item) => item.id === selectedId ? {
        ...item,
        ...fieldsToUpdate,
      } : item))

      setMessage(`Successfully updated metadata for ${selectedItem.filename}.`)
      refreshMedia()
    } catch (err) {
      setMessage(err.message || 'Failed to update metadata.')
    } finally {
      setSaving(false)
    }
  }

  const toggleTag = (tag) => {
    setTagsInput((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  }

  const addCustomTag = () => {
    const t = newTagText.trim()
    if (t && !tagsInput.includes(t)) {
      setTagsInput((prev) => [...prev, t])
    }
    setNewTagText('')
  }

  return (
    <div>
      <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '15px' }}>
        Select an image from the grid to edit its capture date, camera parameters, location, note, and tags directly.
      </p>

      {!firebaseReady ? (
        <p className="form-error">Connect Firebase to edit media metadata.</p>
      ) : loading ? (
        <p>Loading archive images...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '24px', alignItems: 'start' }}>
          {/* Image Selection Grid */}
          <div className="tag-manager-grid" style={{ maxHeight: '720px', overflowY: 'auto', overscrollBehavior: 'contain', border: '1px solid var(--border)', background: 'var(--paper-deep)', padding: '6px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '6px' }}>
              {media.map((item) => {
                const isSelected = item.id === selectedId
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`tag-image${isSelected ? ' selected' : ''}`}
                    onClick={() => setSelectedId(item.id)}
                    style={{ width: '100%', borderColor: isSelected ? '#2ecc71' : 'transparent' }}
                  >
                    <ArchiveImage
                      item={item}
                      alt={item.filename}
                      size={100}
                      quality={0.7}
                      aspectRatio="1/1"
                    />
                    <span>{item.filename}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Edit Form Sidebar */}
          <div style={{ background: 'var(--paper-deep)', border: '1px solid var(--border)', padding: '16px' }}>
            {selectedItem ? (
              <>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: 'var(--ink)' }}>
                  Editing Metadata: <span style={{ fontWeight: 'normal', color: 'var(--muted)' }}>{selectedItem.filename}</span>
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                      Date &amp; Time Taken:
                    </label>
                    <input
                      type="datetime-local"
                      value={dateTakenInput}
                      onChange={(e) => setDateTakenInput(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                      Camera Model:
                    </label>
                    <input
                      type="text"
                      value={cameraInput}
                      onChange={(e) => setCameraInput(e.target.value)}
                      placeholder="e.g. Google Pixel 8 Pro"
                      style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                      Lens Model:
                    </label>
                    <input
                      type="text"
                      value={lensInput}
                      onChange={(e) => setLensInput(e.target.value)}
                      placeholder="e.g. 6.9mm f/1.68"
                      style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                      Exposure:
                    </label>
                    <input
                      type="text"
                      value={exposureInput}
                      onChange={(e) => setExposureInput(e.target.value)}
                      placeholder="e.g. 1/120s f/1.7 ISO 50"
                      style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                      Location (lat, lng):
                    </label>
                    <input
                      type="text"
                      value={locationInput}
                      onChange={(e) => setLocationInput(e.target.value)}
                      placeholder="e.g. 35.6762, 139.6503"
                      style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                      Note / Description:
                    </label>
                    <input
                      type="text"
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder="Add image note..."
                      style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                      Tags:
                    </label>
                    <div className="tag-row" style={{ marginBottom: '8px', maxHeight: '90px', overflowY: 'auto' }}>
                      {availableTags.map((tag) => (
                        <button
                          type="button"
                          key={tag}
                          className={tagsInput.includes(tag) ? 'tag selected' : 'tag'}
                          onClick={() => toggleTag(tag)}
                          style={{ fontSize: '11px', padding: '3px 8px' }}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="text"
                        value={newTagText}
                        onChange={(e) => setNewTagText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag() } }}
                        placeholder="Add custom tag"
                        style={{ flex: 1, padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink)' }}
                      />
                      <button type="button" className="quiet-button" onClick={addCustomTag} style={{ fontSize: '12px' }}>
                        Add
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="ink-button"
                    onClick={handleSave}
                    disabled={saving}
                    style={{ marginTop: '8px' }}
                  >
                    {saving ? 'Saving Changes...' : 'Save Metadata Updates'}
                  </button>

                  {message && <p style={{ margin: 0, fontSize: '12px', fontWeight: '500', color: '#2ecc71' }}>{message}</p>}
                </div>
              </>
            ) : (
              <p style={{ fontStyle: 'italic', color: 'var(--muted)', margin: 0, fontSize: '13px' }}>
                Click an image thumbnail from the grid on the left to select it for metadata editing.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TagManager({ media, setMedia, loading, refreshMedia }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [tagsToApply, setTagsToApply] = useState([])
  const [newTag, setNewTag] = useState('')
  const [tagToDelete, setTagToDelete] = useState('')
  const [deletingTag, setDeletingTag] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [message, setMessage] = useState('')

  const availableTags = useMemo(() => {
    const defaultTags = ['Animals', 'Architecture', 'Food', 'Nature', 'Objects', 'People', 'Travel', 'Unsorted']
    const dbTags = media.flatMap((item) => item.tags || [])
    return [...new Set([...defaultTags, ...dbTags])].sort()
  }, [media])
  const selectedItems = useMemo(() => media.filter((item) => selectedIds.has(item.id)), [media, selectedIds])
  const hasExistingTags = selectedItems.some((item) => item.tags?.length)

  const toggleImage = (id) => setSelectedIds((current) => {
    const next = new Set(current)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleTag = (tag) => setTagsToApply((current) => current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag])
  const addNewTag = () => {
    const tag = newTag.trim()
    if (tag && !tagsToApply.includes(tag)) setTagsToApply((current) => [...current, tag])
    setNewTag('')
  }
  const handleDeleteTag = async () => {
    if (!tagToDelete) return
    setDeletingTag(true)
    setMessage('')
    try {
      await removeTagFromArchive(tagToDelete)
      setMedia((current) => current.map((item) => ({
        ...item,
        tags: (item.tags || []).filter((t) => t !== tagToDelete)
      })))
      setMessage(`Deleted tag "${tagToDelete}" from all media items.`)
      setTagToDelete('')
    } catch (err) {
      setMessage(err.message || 'Failed to delete tag.')
    } finally {
      setDeletingTag(false)
    }
  }

  const save = () => {
    if (!selectedItems.length || !tagsToApply.length) return
    if (hasExistingTags) setConfirming(true)
    else apply('add')
  }
  const apply = async (mode) => {
    setSaving(true); setMessage('')
    try {
      await updateMediaItems(selectedItems, tagsToApply, mode)
      setMedia((current) => current.map((item) => !selectedIds.has(item.id) ? item : {
        ...item,
        tags: mode === 'replace' ? tagsToApply : [...new Set([...(item.tags || []), ...tagsToApply])],
      }))
      setMessage(`Updated ${selectedItems.length} image${selectedItems.length === 1 ? '' : 's'}.`)
      setSelectedIds(new Set()); setTagsToApply([]); setConfirming(false)
    } catch (error) { setMessage(error.message || 'Tag update failed.') } finally { setSaving(false) }
  }
  const optimizeExistingImages = async () => {
    setOptimizing(true); setMessage('Preparing compact Kūkan and Tag Manager previews…')
    try {
      const count = await backfillArchiveVariants((total) => setMessage(`Optimized ${total} legacy image${total === 1 ? '' : 's'}…`))
      setMessage(count ? `Optimized ${count} images. Refresh Kūkan to use the new previews.` : 'All archive previews are already optimized.')
      refreshMedia()
    } catch (error) { setMessage(error.message || 'Preview optimization failed.') } finally { setOptimizing(false) }
  }

  return <section className="tag-manager" style={{ margin: 0, padding: 0, border: 'none', background: 'transparent' }}>
    <header className="tag-manager-header" style={{ marginBottom: '15px' }}><div><p>Choose images, then safely add or replace tags in one save.</p></div><div><button type="button" className="quiet-button" onClick={optimizeExistingImages} disabled={optimizing}>{optimizing ? 'Optimizing previews…' : 'Optimize existing previews'}</button><span>{selectedIds.size} selected</span></div></header>
    {!firebaseReady ? <p className="form-error">Connect Firebase to manage archive tags.</p> : loading ? <p>Loading archive thumbnails…</p> : <>
      <div className="tag-manager-options">
        <div className="tag-row">{availableTags.map((tag) => <button type="button" className={tagsToApply.includes(tag) ? 'tag selected' : 'tag'} onClick={() => toggleTag(tag)} key={tag}>{tag}</button>)}</div>
        <div className="tag-manager-new" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input value={newTag} onChange={(event) => setNewTag(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addNewTag() } }} placeholder="Create tag" style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink)' }} />
            <button type="button" className="quiet-button" onClick={addNewTag}>Add tag</button>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: 'auto' }}>
            <select
              value={tagToDelete}
              onChange={(e) => setTagToDelete(e.target.value)}
              style={{ border: '1px solid var(--border)', background: 'var(--paper-deep)', color: 'var(--ink)', padding: '6px 10px', fontSize: '13px' }}
            >
              <option value="">Select tag to delete</option>
              {availableTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button
              type="button"
              className="quiet-button"
              disabled={!tagToDelete || deletingTag}
              onClick={handleDeleteTag}
              style={{ color: '#ef4444' }}
            >
              {deletingTag ? 'Deleting tag…' : 'Delete tag'}
            </button>
          </div>
        </div>
        {tagsToApply.length > 0 && <p className="result-count">Will apply: {tagsToApply.join(', ')}</p>}
      </div>

      <div className="tag-manager-grid" style={{ maxHeight: '720px', overflowY: 'auto', overscrollBehavior: 'contain', border: '1px solid var(--border)', background: 'var(--paper-deep)', padding: '6px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '6px' }}>
          {media.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`tag-image${selectedIds.has(item.id) ? ' selected' : ''}`}
              onClick={() => toggleImage(item.id)}
              style={{ width: '100%' }}
            >
              <ArchiveImage
                item={item}
                alt={item.filename}
                size={100}
                quality={0.7}
                aspectRatio="1/1"
              />
              <span>{item.tags?.join(', ') || 'Untagged'}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="tag-manager-actions"><button type="button" className="ink-button" disabled={saving || !selectedIds.size || !tagsToApply.length} onClick={save}>{saving ? 'Saving…' : `Save tags to ${selectedIds.size} image${selectedIds.size === 1 ? '' : 's'}`}</button>{message && <p>{message}</p>}</div>
      {confirming && <div className="tag-manager-confirm"><p>Some selected images already have tags. How should this update work?</p><div><button type="button" className="ink-button" onClick={() => apply('add')} disabled={saving}>Add and keep existing</button><button type="button" className="quiet-button" onClick={() => apply('replace')} disabled={saving}>Replace existing</button><button type="button" className="quiet-button" onClick={() => setConfirming(false)} disabled={saving}>Cancel</button></div></div>}
    </>}
  </section>
}

function DeletionSection({ media, setMedia, loading }) {
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const toggleImage = (id) => setSelectedIds((current) => {
    const next = new Set(current)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleDelete = async () => {
    setDeleting(true)
    setMessage('')
    try {
      const itemsToDelete = media.filter(item => selectedIds.has(item.id))
      for (const item of itemsToDelete) {
        await deleteMediaItem(item)
      }
      setMedia(current => current.filter(item => !selectedIds.has(item.id)))
      setMessage(`Successfully deleted ${selectedIds.size} image(s).`)
      setSelectedIds(new Set())
      setConfirmOpen(false)
    } catch (error) {
      setMessage(error.message || 'Deletion failed.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '15px' }}>
        Select one or more images from the archive grid to permanently delete them from Cloudflare R2 storage and Firestore.
      </p>

      {!firebaseReady ? (
        <p className="form-error">Connect Firebase to delete archive items.</p>
      ) : loading ? (
        <p>Loading archive images...</p>
      ) : (
        <>
          <div className="tag-manager-grid" style={{ maxHeight: '780px', overflowY: 'auto', overscrollBehavior: 'contain', border: '1px solid var(--border)', background: 'var(--paper-deep)', padding: '6px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '6px' }}>
              {media.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`tag-image${selectedIds.has(item.id) ? ' selected' : ''}`}
                  onClick={() => toggleImage(item.id)}
                  style={{ width: '100%', borderColor: selectedIds.has(item.id) ? '#ef4444' : 'transparent' }}
                >
                  <ArchiveImage
                    item={item}
                    alt={item.filename}
                    size={100}
                    quality={0.7}
                    aspectRatio="1/1"
                  />
                  <span>{item.tags?.join(', ') || 'Untagged'}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="tag-manager-actions" style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              type="button"
              className="ink-button"
              disabled={deleting || !selectedIds.size}
              onClick={() => setConfirmOpen(true)}
              style={{ background: '#b0554a' }}
            >
              {deleting ? 'Deleting...' : `Delete ${selectedIds.size} Selected Image(s) Permanently`}
            </button>
            {message && <p style={{ margin: 0, fontSize: '13px' }}>{message}</p>}
          </div>

          {confirmOpen && (
            <div className="tag-manager-confirm" style={{ border: '1px solid #ef4444', background: 'rgba(239, 68, 68, 0.05)', marginTop: '15px', padding: '15px' }}>
              <p style={{ fontWeight: '600', color: '#ef4444', margin: '0 0 10px 0' }}>
                WARNING: Are you absolutely sure you want to permanently delete these {selectedIds.size} image(s) from both Cloudflare R2 and Firestore? This action is irreversible.
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" className="ink-button" onClick={handleDelete} disabled={deleting} style={{ background: '#ef4444' }}>
                  Yes, Delete Permanently
                </button>
                <button type="button" className="quiet-button" onClick={() => setConfirmOpen(false)} disabled={deleting}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TagCoverSelection({ media, setMedia, loading }) {
  const [selectedTag, setSelectedTag] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const tags = useMemo(() => {
    const defaultTags = ['Animals', 'Architecture', 'Food', 'Nature', 'Objects', 'People', 'Travel', 'Unsorted']
    const dbTags = media.flatMap((item) => item.tags || [])
    return [...new Set([...defaultTags, ...dbTags])].sort()
  }, [media])

  const filteredMedia = useMemo(() => {
    if (!selectedTag) return []
    return media.filter((item) => {
      if (selectedTag === 'Unsorted') {
        return !item.tags || item.tags.length === 0 || item.tags.includes('Unsorted')
      }
      return item.tags?.includes(selectedTag)
    })
  }, [media, selectedTag])

  const currentCover = useMemo(() => {
    if (!selectedTag) return null
    return media.find((item) => item.coverForTags?.includes(selectedTag))
  }, [media, selectedTag])

  const handleSelectCover = async (item) => {
    setSaving(true)
    setMessage('')
    try {
      await setTagCover(selectedTag, item.id, media)

      setMedia((current) => current.map((m) => {
        let newCovers = m.coverForTags ? m.coverForTags.filter(t => t !== selectedTag) : []
        if (m.id === item.id) {
          newCovers = [...new Set([...newCovers, selectedTag])]
        }
        return {
          ...m,
          coverForTags: newCovers
        }
      }))

      setMessage(`Successfully set cover image for tag "${selectedTag}".`)
    } catch (error) {
      setMessage(error.message || 'Failed to update tag cover.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '15px' }}>
        Select a tag category, then select an image to be displayed on the tag item card in the main Library view.
      </p>

      {!firebaseReady ? (
        <p className="form-error">Connect Firebase to select tag covers.</p>
      ) : loading ? (
        <p>Loading archive images...</p>
      ) : (
        <>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '8px' }}>
              Select Tag Category:
            </label>
            <div className="tag-row">
              {tags.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  className={selectedTag === tag ? 'tag selected' : 'tag'}
                  onClick={() => { setSelectedTag(tag); setMessage('') }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {selectedTag && (
            <div>
              <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '10px' }}>
                Current cover for <strong>{selectedTag}</strong>:{' '}
                {currentCover ? (
                  <span style={{ color: '#2ecc71' }}>{currentCover.filename}</span>
                ) : (
                  <span style={{ fontStyle: 'italic' }}>Default (first matching image)</span>
                )}
              </p>

              {filteredMedia.length === 0 ? (
                <p style={{ fontStyle: 'italic', margin: '20px 0' }}>No images match this tag.</p>
              ) : (
                <div className="tag-manager-grid" style={{ maxHeight: '780px', overflowY: 'auto', overscrollBehavior: 'contain', border: '1px solid var(--border)', background: 'var(--paper-deep)', padding: '6px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '6px' }}>
                    {filteredMedia.map((item) => {
                      const isCover = item.coverForTags?.includes(selectedTag)
                      return (
                        <button
                          type="button"
                          key={item.id}
                          className={`tag-image${isCover ? ' selected' : ''}`}
                          onClick={() => handleSelectCover(item)}
                          disabled={saving}
                          style={{ width: '100%', borderColor: isCover ? '#2ecc71' : 'transparent' }}
                        >
                          <ArchiveImage
                            item={item}
                            alt={item.filename}
                            size={100}
                            quality={0.7}
                            aspectRatio="1/1"
                          />
                          <span style={{ color: isCover ? '#2ecc71' : 'inherit', fontWeight: isCover ? 'bold' : 'normal' }}>
                            {isCover ? 'Current Cover' : item.filename}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {message && <p style={{ marginTop: '15px', fontSize: '13px', fontWeight: '500' }}>{message}</p>}
        </>
      )}
    </div>
  )
}

export default function AdminView({ theme: propTheme, toggleTheme: propToggleTheme }) {
  const [localTheme, setLocalTheme] = useState(() => localStorage.getItem('kioku-theme') || 'light')

  const currentTheme = propTheme || localTheme
  const handleToggleTheme = propToggleTheme || (() => {
    const next = currentTheme === 'light' ? 'dark' : 'light'
    setLocalTheme(next)
    localStorage.setItem('kioku-theme', next)
    document.documentElement.dataset.theme = next
  })

  useEffect(() => {
    document.documentElement.dataset.theme = currentTheme
  }, [currentTheme])

  const [media, setMedia] = useState([])
  const [mediaLoading, setMediaLoading] = useState(firebaseReady)
  const [mediaMessage, setMediaMessage] = useState('')

  const availableTags = useMemo(() => {
    const defaultTags = ['Animals', 'Architecture', 'Food', 'Nature', 'Objects', 'People', 'Travel', 'Unsorted']
    const dbTags = media.flatMap((item) => item.tags || [])
    return [...new Set([...defaultTags, ...dbTags])].sort()
  }, [media])

  const refreshMedia = useCallback(async () => {
    if (!firebaseReady) { setMediaLoading(false); return }
    setMediaLoading(true)
    try {
      const { items } = await loadArchiveMedia(null, 500)
      setMedia(
        items.map((item) => {
          const resolvedDate = resolveCaptureDate(item.filename, null, item.dateTaken)
          const dateObj = resolvedDate instanceof Date ? resolvedDate : new Date(resolvedDate)
          const validDate = isNaN(dateObj.getTime()) ? new Date() : dateObj
          return { ...item, dateTaken: validDate.toISOString() }
        })
      )
    } catch (error) {
      setMediaMessage(error.message || 'Could not load archive images.')
    } finally {
      setMediaLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshMedia()
  }, [refreshMedia])

  /* ── Single image comparator ── */
  const [selectedFile, setSelectedFile] = useState(null)
  const [origUrl, setOrigUrl] = useState('')
  const [webpUrl, setWebpUrl] = useState('')
  const [origSize, setOrigSize] = useState(0)
  const [webpSize, setWebpSize] = useState(0)
  const [quality, setQuality] = useState(80)
  const [showOriginal, setShowOriginal] = useState(false)
  const [isZoomed, setIsZoomed] = useState(false)
  const [panX, setPanX] = useState(50)
  const [panY, setPanY] = useState(50)

  /* ── Bulk converter ── */
  const [bulkFiles, setBulkFiles] = useState([])
  const [bulkQuality, setBulkQuality] = useState(80)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkProgress, setBulkProgress] = useState(0)
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkEta, setBulkEta] = useState('')
  const bulkStartTime = useRef(0)

  /* ── Bulk Uploader State ── */
  const [uploadFiles, setUploadFiles] = useState([])
  const [uploadTags, setUploadTags] = useState('')
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadEta, setUploadEta] = useState('')
  const [uploadSpeed, setUploadSpeed] = useState('')
  const [uploadLogs, setUploadLogs] = useState([])
  const [failedUploads, setFailedUploads] = useState([]) // Array of { file, error }
  const [uploadDone, setUploadDone] = useState(false)
  const [uploadReport, setUploadReport] = useState(null)
  const uploadStartTime = useRef(0)
  const totalUploadedBytes = useRef(0)

  /* ── General ── */
  const [sandbox, setSandbox] = useState(localStorage.getItem('kioku-sandbox') === 'yes')
  const containerRef = useRef(null)
  const prevOrigUrl = useRef('')
  const prevWebpUrl = useRef('')

  const handleSandboxToggle = () => {
    const next = !sandbox
    setSandbox(next)
    localStorage.setItem('kioku-sandbox', next ? 'yes' : 'no')
  }

  // ── Convert preview on file/quality change ──
  useEffect(() => {
    if (!selectedFile) {
      setOrigUrl(''); setWebpUrl(''); setOrigSize(0); setWebpSize(0)
      return
    }
    if (prevOrigUrl.current) URL.revokeObjectURL(prevOrigUrl.current)
    if (prevWebpUrl.current) URL.revokeObjectURL(prevWebpUrl.current)

    setOrigSize(selectedFile.size)
    const oUrl = URL.createObjectURL(selectedFile)
    setOrigUrl(oUrl)
    prevOrigUrl.current = oUrl

    let cancelled = false
    convertToWebp(selectedFile, quality).then((blob) => {
      if (cancelled) return
      setWebpSize(blob.size)
      const wUrl = URL.createObjectURL(blob)
      setWebpUrl(wUrl)
      prevWebpUrl.current = wUrl
    }).catch(console.error)

    return () => { cancelled = true; if (oUrl) URL.revokeObjectURL(oUrl) }
  }, [selectedFile, quality])

  useEffect(() => () => {
    if (prevOrigUrl.current) URL.revokeObjectURL(prevOrigUrl.current)
    if (prevWebpUrl.current) URL.revokeObjectURL(prevWebpUrl.current)
  }, [])

  // ── File selection ──
  const handleFileDrop = (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f?.type.startsWith('image/')) setSelectedFile(f)
  }

  const handleFileSelect = (e) => {
    if (e.target.files[0]) setSelectedFile(e.target.files[0])
  }

  // ── Zoom pan ──
  const handleMouseMove = useCallback((e) => {
    if (!containerRef.current) return
    const r = containerRef.current.getBoundingClientRect()
    setPanX(((e.clientX - r.left) / r.width) * 100)
    setPanY(((e.clientY - r.top) / r.height) * 100)
  }, [])

  // ── Bulk Folder: Select folder ──
  const handleBulkSelect = (e) => {
    const files = [...e.target.files].filter((f) => f.type.startsWith('image/'))
    setBulkFiles(files)
    setBulkStatus('')
    setBulkEta('')
  }

  // ── Bulk convert + ZIP download (STORE mode = zero compression, no quality loss) ──
  const saveBulkWebpFiles = async () => {
    if (!bulkFiles.length) return

    setBulkSaving(true)
    setBulkProgress(0)
    setBulkStatus('Starting conversion...')
    setBulkEta('')
    bulkStartTime.current = performance.now()

    const zip = new JSZip()
    const CONCURRENCY = Math.min(4, navigator.hardwareConcurrency || 4)

    try {
      await parallelPool(bulkFiles, CONCURRENCY, async (file) => {
        const blob = await convertToWebp(file, bulkQuality)
        const name = `${file.name.replace(/\.[^/.]+$/, '')}.webp`
        zip.file(name, blob)
        return blob
      }, (done) => {
        setBulkProgress(done)
        const elapsed = (performance.now() - bulkStartTime.current) / 1000
        const avg = elapsed / done
        const remaining = avg * (bulkFiles.length - done)
        setBulkEta(fmtTime(remaining))
        setBulkStatus(`Converting ${done}/${bulkFiles.length}...`)
      })

      setBulkStatus('Packaging ZIP (no compression, lossless)...')
      setBulkEta('')
      const content = await zip.generateAsync({ type: 'blob', compression: 'STORE' })

      const a = document.createElement('a')
      a.href = URL.createObjectURL(content)
      a.download = `webp_q${bulkQuality}_${bulkFiles.length}imgs.zip`
      a.click()
      URL.revokeObjectURL(a.href)

      const elapsed = ((performance.now() - bulkStartTime.current) / 1000).toFixed(1)
      setBulkStatus(`Done! ${bulkFiles.length} images converted in ${elapsed}s. ZIP downloaded.`)
    } catch (err) {
      console.error(err)
      setBulkStatus(`Error: ${err.message}`)
    } finally {
      setBulkSaving(false)
      setBulkEta('')
    }
  }

  // ── Bulk Uploader: Select folder ──
  const handleUploadSelect = (e) => {
    const files = [...e.target.files].filter((f) => f.type.startsWith('image/'))
    setUploadFiles(files)
    setUploadStatus('')
    setUploadEta('')
    setFailedUploads([])
    setUploadLogs([])
    setUploadSpeed('')
    setUploadDone(false)
    setUploadReport(null)
  }

  // ── Helper to write live logger statement ──
  const logEvent = (msg) => {
    const timestamp = new Date().toLocaleTimeString()
    setUploadLogs((prev) => [`[${timestamp}] ${msg}`, ...prev.slice(0, 49)])
  }

  // Helper to reset the entire bulk uploader
  const resetBulkUploader = () => {
    setUploadFiles([])
    setUploadStatus('')
    setUploadEta('')
    setFailedUploads([])
    setUploadLogs([])
    setUploadSpeed('')
    setUploadDone(false)
    setUploadReport(null)
  }

  // ── Bulk Uploader: Start batch upload ──
  const startBulkUpload = async () => {
    const filesToUpload = failedUploads.length > 0 ? failedUploads.map(x => x.file) : uploadFiles
    if (!filesToUpload.length) return

    setUploadBusy(true)
    setUploadProgress(0)
    setUploadStatus(failedUploads.length > 0 ? 'Retrying failed uploads...' : 'Starting batch upload...')
    setUploadEta('')
    setUploadSpeed('')
    setUploadDone(false)
    setUploadReport(null)

    // Reset lists/accumulators if starting a fresh run (not retry)
    if (failedUploads.length === 0) {
      setUploadLogs([])
      setFailedUploads([])
    }

    uploadStartTime.current = performance.now()
    totalUploadedBytes.current = 0

    const CONCURRENCY = 4
    const currentFailed = []

    try {
      const isSandboxActive = sandbox || !firebaseReady
      if (isSandboxActive) {
        logEvent('[SANDBOX] Sandbox Mode active: Simulating cloud upload locally.')
      } else {
        logEvent('[INFO] Live cloud upload active: Sending files to Cloudflare R2 and Firestore.')
      }

      logEvent(`Batch process started: processing ${filesToUpload.length} files...`)

      await parallelPool(filesToUpload, CONCURRENCY, async (file) => {
        logEvent(`Starting upload: ${file.name} (${fmt(file.size)})`)

        try {
          await uploadOriginal(file, [], '', null)

          totalUploadedBytes.current += file.size
          const elapsed = Math.max(0.1, (performance.now() - uploadStartTime.current) / 1000)
          const bytesPerSec = totalUploadedBytes.current / elapsed
          const speedString = bytesPerSec >= 1024 * 1024
            ? `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
            : `${(bytesPerSec / 1024).toFixed(0)} KB/s`
          setUploadSpeed(speedString)

          logEvent(`[SUCCESS] File uploaded: ${file.name}`)
        } catch (err) {
          logEvent(`[ERROR] Failed: ${file.name} - ${err.message}`)
          currentFailed.push({ file, error: err.message })
        }
      }, (done) => {
        setUploadProgress(done)
        const elapsed = (performance.now() - uploadStartTime.current) / 1000
        const avg = elapsed / done
        const remaining = avg * (filesToUpload.length - done)
        setUploadEta(fmtTime(remaining))
        setUploadStatus(`Processed ${done}/${filesToUpload.length} images...`)
      })

      const elapsed = ((performance.now() - uploadStartTime.current) / 1000).toFixed(1)

      if (currentFailed.length > 0) {
        setFailedUploads(currentFailed)
        setUploadStatus(`Upload completed with errors. ${currentFailed.length} files failed.`)
        logEvent(`[WARNING] Upload completed. ${currentFailed.length} files failed to upload.`)
      } else {
        setFailedUploads([])
        setUploadStatus(`Successfully uploaded all ${filesToUpload.length} images!`)
        logEvent(`[SUCCESS] Finished! All ${filesToUpload.length} files uploaded successfully.`)
        setUploadDone(true)

        const overallSpeed = totalUploadedBytes.current / (elapsed || 0.1)
        const overallSpeedString = overallSpeed >= 1024 * 1024
          ? `${(overallSpeed / (1024 * 1024)).toFixed(1)} MB/s`
          : `${(overallSpeed / 1024).toFixed(0)} KB/s`

        setUploadReport({
          total: filesToUpload.length,
          size: fmt(totalUploadedBytes.current),
          time: fmtTime(elapsed),
          speed: overallSpeedString
        })
      }
    } catch (err) {
      console.error(err)
      setUploadStatus(`Batch execution error: ${err.message}`)
      logEvent(`[ERROR] Critical error: ${err.message}`)
    } finally {
      setUploadBusy(false)
      setUploadSpeed('')
      setUploadEta('')
    }
  }

  /* ── Direct Image Uploader State ── */
  const [directFiles, setDirectFiles] = useState([])
  const [directTags, setDirectTags] = useState([])
  const [directTagInput, setDirectTagInput] = useState('')
  const [directQuality, setDirectQuality] = useState(80)
  const [directConvertWebp, setDirectConvertWebp] = useState(true)
  const [directExporting, setDirectExporting] = useState(false)
  const [directBusy, setDirectBusy] = useState(false)
  const [directProgress, setDirectProgress] = useState(0)
  const [directStatus, setDirectStatus] = useState('')
  const [directEta, setDirectEta] = useState('')
  const [directSpeed, setDirectSpeed] = useState('')
  const [directLogs, setDirectLogs] = useState([])
  const [directFailed, setDirectFailed] = useState([])
  const [directDone, setDirectDone] = useState(false)
  const [directReport, setDirectReport] = useState(null)
  const directStartTime = useRef(0)
  const directUploadedBytes = useRef(0)

  const handleDirectSelect = (e) => {
    const files = [...e.target.files].filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    setDirectFiles((prev) => [...prev, ...files])
    setDirectStatus('')
    setDirectEta('')
    setDirectFailed([])
    setDirectLogs([])
    setDirectSpeed('')
    setDirectDone(false)
    setDirectReport(null)
  }

  const handleDirectDrop = (e) => {
    e.preventDefault()
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    setDirectFiles((prev) => [...prev, ...files])
    setDirectStatus('')
    setDirectEta('')
    setDirectFailed([])
    setDirectLogs([])
    setDirectSpeed('')
    setDirectDone(false)
    setDirectReport(null)
  }

  const removeDirectFile = (index) => {
    setDirectFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const addDirectTag = (tag) => {
    const t = tag.trim()
    if (t && !directTags.includes(t)) {
      setDirectTags((prev) => [...prev, t])
    }
    setDirectTagInput('')
  }

  const removeDirectTag = (tag) => {
    setDirectTags((prev) => prev.filter((t) => t !== tag))
  }

  const logDirectEvent = (msg) => {
    const timestamp = new Date().toLocaleTimeString()
    setDirectLogs((prev) => [`[${timestamp}] ${msg}`, ...prev.slice(0, 49)])
  }

  const resetDirectUploader = () => {
    setDirectFiles([])
    setDirectTags([])
    setDirectTagInput('')
    setDirectStatus('')
    setDirectEta('')
    setDirectFailed([])
    setDirectLogs([])
    setDirectSpeed('')
    setDirectDone(false)
    setDirectReport(null)
  }

  const convertAndDownloadDirectZip = async () => {
    if (!directFiles.length) return
    setDirectExporting(true)
    logDirectEvent(`Starting WebP conversion (${directQuality}%) for ${directFiles.length} file(s)...`)

    const zip = new JSZip()
    const CONCURRENCY = Math.min(4, navigator.hardwareConcurrency || 4)
    const startTime = performance.now()

    try {
      await parallelPool(directFiles, CONCURRENCY, async (file) => {
        const blob = await convertToWebp(file, directQuality)
        const name = `${file.name.replace(/\.[^/.]+$/, '')}.webp`
        zip.file(name, blob)
        return blob
      }, (done) => {
        logDirectEvent(`Converted ${done}/${directFiles.length} file(s)...`)
      })

      logDirectEvent('Packaging WebP files into ZIP...')
      const content = await zip.generateAsync({ type: 'blob', compression: 'STORE' })

      const a = document.createElement('a')
      a.href = URL.createObjectURL(content)
      a.download = directFiles.length === 1
        ? `${directFiles[0].name.replace(/\.[^/.]+$/, '')}_q${directQuality}.webp`
        : `webp_q${directQuality}_${directFiles.length}imgs.zip`
      a.click()
      URL.revokeObjectURL(a.href)

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
      logDirectEvent(`[SUCCESS] Exported ${directFiles.length} WebP image(s) to Downloads folder in ${elapsed}s.`)
    } catch (err) {
      console.error(err)
      logDirectEvent(`[ERROR] Export failed: ${err.message}`)
    } finally {
      setDirectExporting(false)
    }
  }

  const startDirectUpload = async () => {
    const filesToUpload = directFailed.length > 0 ? directFailed.map((x) => x.file) : directFiles
    if (!filesToUpload.length) return

    setDirectBusy(true)
    setDirectProgress(0)
    setDirectStatus(directFailed.length > 0 ? 'Retrying failed uploads...' : 'Starting batch upload...')
    setDirectEta('')
    setDirectSpeed('')
    setDirectDone(false)
    setDirectReport(null)

    if (directFailed.length === 0) {
      setDirectLogs([])
      setDirectFailed([])
    }

    directStartTime.current = performance.now()
    directUploadedBytes.current = 0

    const CONCURRENCY = 4
    const currentFailed = []

    try {
      const isSandboxActive = sandbox || !firebaseReady
      if (isSandboxActive) {
        logDirectEvent('[SANDBOX] Sandbox Mode active: Simulating upload locally.')
      } else {
        logDirectEvent('[INFO] Live cloud upload active: Sending images to R2 and Firestore.')
      }

      logDirectEvent(`Starting upload of ${filesToUpload.length} image(s)...`)

      await parallelPool(filesToUpload, CONCURRENCY, async (file) => {
        // Extract EXIF date from the original file BEFORE WebP conversion strips it
        let capturedAt = null
        try {
          const meta = await exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate'] }).catch(() => null)
          if (meta?.DateTimeOriginal) capturedAt = new Date(meta.DateTimeOriginal)
          else if (meta?.CreateDate) capturedAt = new Date(meta.CreateDate)
        } catch { /* no EXIF available */ }

        let uploadFileObj = file
        if (directConvertWebp) {
          logDirectEvent(`Converting to WebP (${directQuality}%): ${file.name}...`)
          const webpBlob = await convertToWebp(file, directQuality)
          const webpName = `${file.name.replace(/\.[^/.]+$/, '')}.webp`
          uploadFileObj = new File([webpBlob], webpName, { type: 'image/webp' })
        }

        logDirectEvent(`Uploading: ${uploadFileObj.name} (${fmt(uploadFileObj.size)})`)
        try {
          await uploadOriginal(uploadFileObj, directTags, '', capturedAt)
          directUploadedBytes.current += uploadFileObj.size
          const elapsed = Math.max(0.1, (performance.now() - directStartTime.current) / 1000)
          const bytesPerSec = directUploadedBytes.current / elapsed
          const speedString = bytesPerSec >= 1024 * 1024
            ? `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
            : `${(bytesPerSec / 1024).toFixed(0)} KB/s`
          setDirectSpeed(speedString)
          logDirectEvent(`[SUCCESS] File uploaded: ${uploadFileObj.name}`)
        } catch (err) {
          logDirectEvent(`[ERROR] Failed: ${file.name} - ${err.message}`)
          currentFailed.push({ file, error: err.message })
        }
      }, (done) => {
        setDirectProgress(done)
        const elapsed = (performance.now() - directStartTime.current) / 1000
        const avg = elapsed / done
        const remaining = avg * (filesToUpload.length - done)
        setDirectEta(fmtTime(remaining))
        setDirectStatus(`Uploaded ${done}/${filesToUpload.length} images...`)
      })

      const elapsed = ((performance.now() - directStartTime.current) / 1000).toFixed(1)

      if (currentFailed.length > 0) {
        setDirectFailed(currentFailed)
        setDirectStatus(`Upload completed with ${currentFailed.length} failure(s).`)
        logDirectEvent(`[WARNING] Upload finished with ${currentFailed.length} errors.`)
      } else {
        setDirectFailed([])
        setDirectStatus(`Successfully uploaded all ${filesToUpload.length} image(s)!`)
        logDirectEvent(`[SUCCESS] All ${filesToUpload.length} image(s) uploaded successfully.`)
        setDirectDone(true)

        const overallSpeed = directUploadedBytes.current / (elapsed || 0.1)
        const overallSpeedString = overallSpeed >= 1024 * 1024
          ? `${(overallSpeed / (1024 * 1024)).toFixed(1)} MB/s`
          : `${(overallSpeed / 1024).toFixed(0)} KB/s`

        setDirectReport({
          total: filesToUpload.length,
          size: fmt(directUploadedBytes.current),
          time: fmtTime(elapsed),
          speed: overallSpeedString
        })
        refreshMedia()
      }
    } catch (err) {
      console.error(err)
      setDirectStatus(`Upload error: ${err.message}`)
      logDirectEvent(`[ERROR] Error: ${err.message}`)
    } finally {
      setDirectBusy(false)
      setDirectSpeed('')
      setDirectEta('')
    }
  }

  const savingPercent = origSize ? Math.round(((origSize - webpSize) / origSize) * 100) : 0
  const bulkPercent = bulkFiles.length ? Math.round((bulkProgress / bulkFiles.length) * 100) : 0

  return (
    <main className="admin-view">
      <header className="admin-header">
        <h1>kanri</h1>
        <div className="admin-options">
          <button
            type="button"
            className="theme-toggle"
            onClick={handleToggleTheme}
            aria-label={`Switch to ${currentTheme === 'light' ? 'dark' : 'light'} mode`}
          >
            {currentTheme === 'light' ? 'Dark' : 'Light'}
          </button>
          <label className="sandbox-toggle">
            <input type="checkbox" checked={sandbox} onChange={handleSandboxToggle} />
            <span>Sandbox Mode</span>
          </label>
          <a href="/" className="exit-btn">Exit Manager</a>
        </div>
      </header>

      {mediaMessage && <p className="form-error" style={{ padding: '0 10px' }}>{mediaMessage}</p>}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* ── Section 01: Single Image Upload & Quality Comparator ── */}
        <AccordionSection id="sec-comparator" num="01" title="Quality Comparator">
          <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '40px', alignItems: 'start' }}>
            <div>
              <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '15px' }}>
                Upload a single photo to see file size savings and inspect WebP quality.
              </p>
              <div
                className="drop-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => document.getElementById('admin-file-input').click()}
              >
                <input id="admin-file-input" type="file" accept="image/*" hidden onChange={handleFileSelect} />
                <span>+</span>
                <strong>Drop image here</strong>
                <small>JPEG, PNG, HEIC</small>
              </div>

              {selectedFile && (
                <div className="file-info-badge">
                  <span className="file-name">{selectedFile.name}</span>
                </div>
              )}
            </div>

            <div>
              <div className="comparator-header" style={{ margin: 0, paddingBottom: '10px' }}>
                {selectedFile && (
                  <div className="comparator-slider-wrap">
                    <span className="slider-val">Quality: {quality}%</span>
                    <input type="range" min="10" max="100" value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
                  </div>
                )}
              </div>

              {!selectedFile ? (
                <div className="comparator-placeholder" style={{ height: '300px' }}>
                  <p>Upload a photo on the left to see live WebP quality comparisons and inspect detail differences.</p>
                </div>
              ) : (
                <div className="comparator-work-area">
                  {/* Toolbar */}
                  <div className="comparator-toolbar">
                    <button
                      className={`ink-button${showOriginal ? ' active-compare' : ''}`}
                      onClick={() => setShowOriginal(!showOriginal)}
                      style={{ flex: 1 }}
                    >
                      {showOriginal ? '● Original' : '● WebP — click to compare'}
                    </button>
                    <button
                      className={`ink-button${isZoomed ? ' active-compare' : ''}`}
                      onClick={() => setIsZoomed(!isZoomed)}
                      style={{ width: '110px' }}
                    >
                      {isZoomed ? 'Zoom Out' : 'Zoom 2×'}
                    </button>
                  </div>

                  {/* Viewport */}
                  <div
                    className="comparison-viewport"
                    ref={containerRef}
                    onMouseMove={isZoomed ? handleMouseMove : undefined}
                    style={{ height: '360px' }}
                  >
                    <img
                      src={showOriginal ? origUrl : webpUrl}
                      alt={showOriginal ? 'Original' : 'WebP'}
                      style={{
                        objectFit: isZoomed ? 'none' : 'contain',
                        transform: isZoomed ? 'scale(2.5)' : 'none',
                        transformOrigin: `${panX}% ${panY}%`,
                      }}
                      draggable={false}
                    />
                    <span className="viewport-badge">
                      {showOriginal ? 'Original' : `WebP ${quality}%`}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="comparator-stats">
                    <div className="stat-card">
                      <span className="stat-title">Original</span>
                      <span className="stat-value">{fmt(origSize)}</span>
                    </div>
                    <div className="stat-card">
                      <span className="stat-title">WebP</span>
                      <span className="stat-value">{fmt(webpSize)}</span>
                    </div>
                    <div className="stat-card savings">
                      <span className="stat-title">Saved</span>
                      <span className="stat-value">-{savingPercent}%</span>
                    </div>
                  </div>

                  <a
                    href={webpUrl}
                    download={`${selectedFile.name.replace(/\.[^/.]+$/, '')}_q${quality}.webp`}
                    className="ink-button"
                    style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: '10px' }}
                  >
                    Download Converted WebP
                  </a>
                </div>
              )}
            </div>
          </div>
        </AccordionSection>

        {/* ── Section 02: Bulk Folder Converter ── */}
        <AccordionSection id="sec-bulk-converter" num="02" title="Bulk Folder Converter">
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '15px' }}>
            Select a folder → convert all images to WebP → download as ZIP.
            <br />
            <span style={{ opacity: 0.7 }}>ZIP uses STORE mode (zero compression) so image quality is untouched.</span>
          </p>

          <label className="ink-button" style={{ display: 'inline-block', minWidth: '200px', textAlign: 'center', cursor: 'pointer', marginBottom: '15px' }}>
            Choose Folder
            {/* @ts-ignore */}
            <input type="file" accept="image/*" multiple webkitdirectory="" hidden onChange={handleBulkSelect} />
          </label>

          {bulkFiles.length > 0 && (
            <div className="bulk-panel" style={{ maxWidth: '600px' }}>
              <p className="bulk-count">{bulkFiles.length} images selected</p>

              <div className="comparator-slider-wrap" style={{ marginBottom: '15px' }}>
                <span className="slider-val">Quality: {bulkQuality}%</span>
                <input type="range" min="10" max="100" value={bulkQuality} onChange={(e) => setBulkQuality(Number(e.target.value))} />
              </div>

              <button className="ink-button" onClick={saveBulkWebpFiles} disabled={bulkSaving} style={{ width: '100%' }}>
                {bulkSaving ? `Converting ${bulkProgress}/${bulkFiles.length}...` : 'Convert & Download ZIP'}
              </button>

              {/* Progress bar */}
              {bulkSaving && (
                <div className="bulk-progress-wrap">
                  <div className="bulk-progress-bar" style={{ width: `${bulkPercent}%` }} />
                </div>
              )}

              {/* Status + ETA */}
              {bulkStatus && (
                <p className="bulk-status-text">
                  {bulkStatus}
                  {bulkEta && <span className="bulk-eta"> — ~{bulkEta} remaining</span>}
                </p>
              )}
            </div>
          )}
        </AccordionSection>

        {/* ── Section 03: Bulk Folder Uploader ── */}
        <AccordionSection id="sec-bulk-uploader" num="03" title="Bulk Folder Uploader">
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '15px' }}>
            Upload a folder of converted WebP images directly to the cloud storage archive.
          </p>

          <label className="ink-button" style={{ display: 'inline-block', minWidth: '200px', textAlign: 'center', cursor: 'pointer', marginBottom: '15px' }}>
            Select WebP Folder
            {/* @ts-ignore */}
            <input type="file" accept="image/*" multiple webkitdirectory="" hidden onChange={handleUploadSelect} />
          </label>

          {(uploadFiles.length > 0 || uploadLogs.length > 0 || uploadDone) && (
            <div className="bulk-panel" style={{ maxWidth: '700px' }}>
              {uploadDone && uploadReport ? (
                <div style={{ background: 'rgba(46, 204, 113, 0.05)', border: '1px solid rgba(46, 204, 113, 0.2)', padding: '15px', marginBottom: '15px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#2ecc71', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>Upload Batch Finished Successfully.</h4>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>Total Images Uploaded: <strong style={{ color: 'var(--ink)' }}>{uploadReport.total}</strong></li>
                    <li>Total Volume Sent: <strong style={{ color: 'var(--ink)' }}>{uploadReport.size}</strong></li>
                    <li>Elapsed Time: <strong style={{ color: 'var(--ink)' }}>{uploadReport.time}</strong></li>
                    <li>Average Throughput: <strong style={{ color: '#2ecc71' }}>{uploadReport.speed}</strong></li>
                  </ul>
                  <button
                    className="ink-button"
                    onClick={resetBulkUploader}
                    style={{ width: '100%', marginTop: '12px', padding: '6px', fontSize: '12px' }}
                  >
                    Clear &amp; Select New Folder
                  </button>
                </div>
              ) : (
                <>
                  <p className="bulk-count">
                    {failedUploads.length > 0
                      ? `${failedUploads.length} failed images ready to retry`
                      : `${uploadFiles.length} images ready to upload`}
                  </p>

                  {sandbox && (
                    <div style={{ background: 'rgba(241, 196, 15, 0.08)', border: '1px solid rgba(241, 196, 15, 0.2)', padding: '10px 12px', fontSize: '12px', color: '#f1c40f', marginBottom: '12px', lineHeight: '1.4' }}>
                      ⚠️ <strong>Sandbox Mode is ON</strong>. Uploads will be simulated locally. To push files to Cloudflare R2, turn Sandbox Mode OFF in the header.
                    </div>
                  )}

                  <button
                    className="ink-button"
                    onClick={startBulkUpload}
                    disabled={uploadBusy}
                    style={{ width: '100%', marginTop: '10px' }}
                  >
                    {uploadBusy
                      ? `Uploading...`
                      : failedUploads.length > 0
                        ? `Retry Failed Uploads (${failedUploads.length})`
                        : 'Start Cloud Upload'}
                  </button>

                  {/* Progress bar */}
                  {uploadBusy && (
                    <div className="bulk-progress-wrap">
                      <div className="bulk-progress-bar" style={{ width: `${Math.round((uploadProgress / (failedUploads.length > 0 ? failedUploads.length : uploadFiles.length)) * 100)}%` }} />
                    </div>
                  )}

                  {/* Status, ETA & Upload Speed */}
                  {uploadStatus && (
                    <div className="bulk-status-text" style={{ marginTop: '12px' }}>
                      <p style={{ margin: 0, fontWeight: '600', color: 'var(--ink)' }}>{uploadStatus}</p>
                      <div style={{ display: 'flex', gap: '15px', marginTop: '4px', fontSize: '12px', color: 'var(--muted)' }}>
                        {uploadSpeed && <span>Speed: <strong style={{ color: '#2ecc71' }}>{uploadSpeed}</strong></span>}
                        {uploadEta && <span>ETA: <strong className="bulk-eta">{uploadEta}</strong></span>}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Live console terminal */}
              {uploadLogs.length > 0 && (
                <div style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.05em', marginBottom: '5px' }}>
                    Activity Logs
                  </label>
                  <div className="upload-console-log">
                    {uploadLogs.map((log, index) => (
                      <div key={index} className="log-line">{log}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Failed uploads retry section */}
              {!uploadBusy && failedUploads.length > 0 && (
                <div className="failed-uploads-card">
                  <h4>⚠️ Failed Uploads Detail</h4>
                  <div className="failed-uploads-list">
                    {failedUploads.map((item, index) => (
                      <div key={index} className="failed-item">
                        <span className="failed-name">{item.file.name}</span>
                        <span className="failed-reason">{item.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </AccordionSection>

        {/* ── Section 04: Direct Image Uploader ── */}
        <AccordionSection id="sec-direct-uploader" num="04" title="Direct Image Uploader">
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '15px' }}>
            Upload individual images (single or multiple) directly to the cloud archive without needing a whole folder.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', alignItems: 'start' }}>
            <div>
              <div
                className="drop-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDirectDrop}
                onClick={() => document.getElementById('admin-direct-file-input').click()}
                style={{ marginBottom: '15px' }}
              >
                <input
                  id="admin-direct-file-input"
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={handleDirectSelect}
                />
                <span>+</span>
                <strong>Choose Image Files or Drop Them Here</strong>
                <small>Select single or multiple photos (JPEG, PNG, WebP, HEIC)</small>
              </div>

              {directFiles.length > 0 && (
                <div className="direct-files-preview">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span className="bulk-count" style={{ margin: 0 }}>
                      {directFiles.length} file{directFiles.length === 1 ? '' : 's'} selected ({fmt(directFiles.reduce((acc, f) => acc + f.size, 0))})
                    </span>
                    <button
                      type="button"
                      className="quiet-button"
                      onClick={() => setDirectFiles([])}
                      disabled={directBusy}
                      style={{ fontSize: '12px', padding: '2px 8px' }}
                    >
                      Clear files
                    </button>
                  </div>

                  <div className="direct-file-list" style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '15px' }}>
                    {directFiles.map((file, i) => (
                      <div key={i} className="file-info-badge" style={{ margin: 0, padding: '6px 10px', alignItems: 'center' }}>
                        <span className="file-name" style={{ fontSize: '12px' }}>{file.name} ({fmt(file.size)})</span>
                        {!directBusy && (
                          <button
                            type="button"
                            onClick={() => removeDirectFile(i)}
                            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Options Sidebar (Tags & WebP Settings) */}
            <div style={{ background: 'var(--paper-deep)', border: '1px solid var(--border)', padding: '16px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: 'var(--ink)' }}>
                Metadata Options (Optional)
              </h4>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>
                  Select existing tags:
                </label>
                <div className="tag-row" style={{ marginBottom: '8px', maxHeight: '100px', overflowY: 'auto' }}>
                  {availableTags.map((tag) => (
                    <button
                      type="button"
                      key={tag}
                      className={directTags.includes(tag) ? 'tag selected' : 'tag'}
                      onClick={() => directTags.includes(tag) ? removeDirectTag(tag) : addDirectTag(tag)}
                      style={{ fontSize: '11px', padding: '3px 8px' }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    value={directTagInput}
                    onChange={(e) => setDirectTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDirectTag(directTagInput) } }}
                    placeholder="Or type custom tag"
                    style={{ flex: 1, padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink)' }}
                  />
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={() => addDirectTag(directTagInput)}
                    style={{ fontSize: '12px' }}
                  >
                    Add
                  </button>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--ink)', cursor: 'pointer', marginBottom: '8px' }}>
                  <input
                    type="checkbox"
                    checked={directConvertWebp}
                    onChange={(e) => setDirectConvertWebp(e.target.checked)}
                    style={{ accentColor: 'var(--ink)' }}
                  />
                  <span>Convert to WebP before cloud upload</span>
                </label>

                <div className="comparator-slider-wrap" style={{ marginTop: '4px' }}>
                  <span className="slider-val" style={{ fontSize: '12px', minWidth: '90px' }}>Quality: <strong>{directQuality}%</strong></span>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={directQuality}
                    onChange={(e) => setDirectQuality(Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons, upload status, report, and logs */}
          {(directFiles.length > 0 || directLogs.length > 0 || directDone) && (
            <div className="bulk-panel" style={{ maxWidth: '100%', marginTop: '15px' }}>
              {directDone && directReport ? (
                <div style={{ background: 'rgba(46, 204, 113, 0.08)', border: '1px solid rgba(46, 204, 113, 0.2)', padding: '15px', marginBottom: '15px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#2ecc71', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                    Upload Finished Successfully.
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--ink)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>Total Images Uploaded: <strong style={{ color: 'var(--ink)' }}>{directReport.total}</strong></li>
                    <li>Total Volume Sent: <strong style={{ color: 'var(--ink)' }}>{directReport.size}</strong></li>
                    <li>Elapsed Time: <strong style={{ color: 'var(--ink)' }}>{directReport.time}</strong></li>
                    <li>Average Throughput: <strong style={{ color: '#2ecc71' }}>{directReport.speed}</strong></li>
                  </ul>
                  <button
                    type="button"
                    className="ink-button"
                    onClick={resetDirectUploader}
                    style={{ width: '100%', marginTop: '12px', padding: '6px', fontSize: '12px' }}
                  >
                    Clear &amp; Select More Images
                  </button>
                </div>
              ) : (
                <>
                  <p className="bulk-count">
                    {directFailed.length > 0
                      ? `${directFailed.length} failed image(s) ready to retry`
                      : `${directFiles.length} image(s) ready to process`}
                  </p>

                  {sandbox && (
                    <div style={{ background: 'rgba(241, 196, 15, 0.08)', border: '1px solid rgba(241, 196, 15, 0.2)', padding: '10px 12px', fontSize: '12px', color: '#f1c40f', marginBottom: '12px', lineHeight: '1.4' }}>
                      Sandbox Mode is ON. Cloud uploads will be simulated locally.
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                    <button
                      type="button"
                      className="ink-button"
                      onClick={convertAndDownloadDirectZip}
                      disabled={directExporting || directBusy || !directFiles.length}
                      style={{ background: 'var(--paper-deep)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                    >
                      {directExporting ? `Exporting WebP (${directQuality}%)...` : `Convert & Download WebP (${directQuality}%)`}
                    </button>

                    <button
                      type="button"
                      className="ink-button"
                      onClick={startDirectUpload}
                      disabled={directBusy || directExporting || !directFiles.length}
                    >
                      {directBusy
                        ? `Uploading...`
                        : directFailed.length > 0
                          ? `Retry Failed Uploads (${directFailed.length})`
                          : `Start Cloud Upload ${directConvertWebp ? `(WebP ${directQuality}%)` : '(Original)'}`}
                    </button>
                  </div>

                  {directBusy && (
                    <div className="bulk-progress-wrap">
                      <div className="bulk-progress-bar" style={{ width: `${Math.round((directProgress / (directFailed.length > 0 ? directFailed.length : directFiles.length)) * 100)}%` }} />
                    </div>
                  )}

                  {directStatus && (
                    <div className="bulk-status-text" style={{ marginTop: '12px' }}>
                      <p style={{ margin: 0, fontWeight: '600', color: 'var(--ink)' }}>{directStatus}</p>
                      <div style={{ display: 'flex', gap: '15px', marginTop: '4px', fontSize: '12px', color: 'var(--muted)' }}>
                        {directSpeed && <span>Speed: <strong style={{ color: '#2ecc71' }}>{directSpeed}</strong></span>}
                        {directEta && <span>ETA: <strong className="bulk-eta">{directEta}</strong></span>}
                      </div>
                    </div>
                  )}
                </>
              )}

              {directLogs.length > 0 && (
                <div style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.05em', marginBottom: '5px' }}>
                    Activity Logs
                  </label>
                  <div className="upload-console-log">
                    {directLogs.map((log, index) => (
                      <div key={index} className="log-line" style={getLogStyle(log)}>{log}</div>
                    ))}
                  </div>
                </div>
              )}

              {!directBusy && directFailed.length > 0 && (
                <div className="failed-uploads-card">
                  <h4 style={{ color: '#ef4444' }}>Failed Uploads Detail</h4>
                  <div className="failed-uploads-list">
                    {directFailed.map((item, index) => (
                      <div key={index} className="failed-item">
                        <span className="failed-name">{item.file.name}</span>
                        <span className="failed-reason">{item.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </AccordionSection>

        {/* ── Section 05: Tag Manager ── */}
        <AccordionSection id="sec-tag-manager" num="05" title="Tag Manager">
          <TagManager media={media} setMedia={setMedia} loading={mediaLoading} refreshMedia={refreshMedia} />
        </AccordionSection>

        {/* ── Section 06: Delete Images ── */}
        <AccordionSection id="sec-delete-images" num="06" title="Delete Images">
          <DeletionSection media={media} setMedia={setMedia} loading={mediaLoading} />
        </AccordionSection>

        {/* ── Section 07: Tag Cover Selection ── */}
        <AccordionSection id="sec-tag-covers" num="07" title="Tag Cover Selection">
          <TagCoverSelection media={media} setMedia={setMedia} loading={mediaLoading} />
        </AccordionSection>

        {/* ── Section 08: Metadata & EXIF Editor ── */}
        <AccordionSection id="sec-metadata-editor" num="08" title="Metadata & EXIF Editor">
          <MetadataEditorSection media={media} setMedia={setMedia} loading={mediaLoading} refreshMedia={refreshMedia} />
        </AccordionSection>
      </div>
    </main>
  )
}
