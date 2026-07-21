import { useEffect, useState, useRef } from 'react'

export default function Viewer({ item, onClose, onNext, onPrevious }) {
  const [zoomed, setZoomed] = useState(false)
  const wheelLock = useRef(false)
  const viewerRoot = useRef(null)

  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const keydown = (event) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') onNext()
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') onPrevious()
    }

    const handleWheel = (event) => {
      event.preventDefault()
      if (wheelLock.current || Math.abs(event.deltaY) < 10) return
      wheelLock.current = true
      event.deltaY > 0 ? onNext() : onPrevious()
      setTimeout(() => {
        wheelLock.current = false
      }, 360)
    }

    const container = viewerRoot.current
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false })
    }
    addEventListener('keydown', keydown)

    return () => {
      document.body.style.overflow = originalOverflow
      removeEventListener('keydown', keydown)
      if (container) {
        container.removeEventListener('wheel', handleWheel)
      }
    }
  }, [onClose, onNext, onPrevious])

  useEffect(() => setZoomed(false), [item.id])

  const panZoom = (event) => {
    if (!zoomed) return
    const bounds = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--zoom-x', `${((event.clientX - bounds.left) / bounds.width) * 100}%`)
    event.currentTarget.style.setProperty('--zoom-y', `${((event.clientY - bounds.top) / bounds.height) * 100}%`)
  }

  const handleBackgroundClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="viewer" ref={viewerRoot} role="dialog" aria-modal="true" aria-label="Photograph viewer">
      <div className="viewer-blur" onClick={onClose} />
      <button className="viewer-close" onClick={onClose}>Close</button>
      <button className="viewer-nav previous" onClick={onPrevious} aria-label="Previous image">Previous</button>

      <section className={`viewer-image${zoomed ? ' zoomed' : ''}`} onMouseMove={panZoom} onClick={handleBackgroundClick}>
        <img
          src={item.src}
          alt={item.filename}
          decoding="async"
          fetchPriority="high"
          onClick={(e) => {
            if (!zoomed) {
              setZoomed(true)
            } else {
              setZoomed(false)
            }
            e.stopPropagation()
          }}
        />
      </section>

      <button className="viewer-nav next" onClick={onNext} aria-label="Next image">Next</button>
    </div>
  )
}
