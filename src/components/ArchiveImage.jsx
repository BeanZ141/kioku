import { useEffect, useState, useRef, memo } from 'react'
import { getThumbnail, saveThumbnail } from '../thumbnailCache'
import { resizeImage } from '../thumbnailWorkerClient'

const memoryCache = new Map()
const inFlight = new Map()
const MAX_MEMORY_CACHE_ENTRIES = 120

function cacheBlob(key, blob) {
  memoryCache.delete(key)
  memoryCache.set(key, blob)
  while (memoryCache.size > MAX_MEMORY_CACHE_ENTRIES) {
    const [oldestKey] = memoryCache.entries().next().value
    memoryCache.delete(oldestKey)
  }
}

const ArchiveImage = memo(function ArchiveImage({ item, alt, size = 800, quality = 0.85, aspectRatio, showLoader = false }) {
  const ratio = aspectRatio || (Number(item.width) > 0 && Number(item.height) > 0 ? `${item.width}/${item.height}` : '4/3')
  const fallbackSrc = item.thumbSrc || item.src
  const idKey = item.id || item.filename || fallbackSrc
  const cacheKey = `${idKey}-${size}-${quality}`

  const [displaySrc, setDisplaySrc] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    let active = true
    let objectUrl = null

    const showBlob = (blob) => {
      objectUrl = URL.createObjectURL(blob)
      if (active) setDisplaySrc(objectUrl)
    }

    const handleThumbnailLoad = async () => {
      const cachedBlob = memoryCache.get(cacheKey) || await getThumbnail(cacheKey)
      if (!active) return

      if (cachedBlob) {
        cacheBlob(cacheKey, cachedBlob)
        showBlob(cachedBlob)
      } else {
        if (active) {
          setDisplaySrc(fallbackSrc)
        }

        try {
          let resizePromise = inFlight.get(cacheKey)
          if (!resizePromise) {
            resizePromise = resizeImage(fallbackSrc, size, quality)
            inFlight.set(cacheKey, resizePromise)
          }
          const resizedBlob = await resizePromise
          if (!active) return

          await saveThumbnail(cacheKey, resizedBlob)
          if (!active) return
          cacheBlob(cacheKey, resizedBlob)

          if (!loadedRef.current) {
            if (objectUrl) URL.revokeObjectURL(objectUrl)
            showBlob(resizedBlob)
          }
        } catch (err) {
          console.warn('Downscaling worker failed, keeping full-res fallback:', err)
        } finally {
          inFlight.delete(cacheKey)
        }
      }
    }

    handleThumbnailLoad()

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [cacheKey, fallbackSrc, size, quality])

  return (
    <span className={`archive-image${showLoader && !loaded ? ' loading' : ''}`} style={{ '--ratio': ratio }} tabIndex="-1">
      {displaySrc && (
        <img
          src={displaySrc}
          alt={alt}
          decoding="async"
          loading="lazy"
          onLoad={() => {
            setLoaded(true)
            loadedRef.current = true
          }}
          className={loaded ? 'loaded' : ''}
          tabIndex="-1"
        />
      )}
    </span>
  )
})

export default ArchiveImage
