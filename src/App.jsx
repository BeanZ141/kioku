import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import Lenis from 'lenis'

import { buildSearchText, firebaseReady, loadArchiveMedia, lockArchive, updateMediaItem } from './firebase'
import { resolveCaptureDate } from './date'
import { newestFirst } from './helpers'

import PasscodeGate from './components/PasscodeGate'
import Header from './components/Header'
import Library from './components/Library'
import Calendar from './components/Calendar'
import Space from './components/Space'
import Viewer from './components/Viewer'

const SpaceScene = lazy(() => import('./SpaceScene'))
const AdminView = lazy(() => import('./AdminView'))

export default function App() {
  const [unlocked, setUnlocked] = useState(sessionStorage.getItem('kioku-unlocked') === 'yes')
  const [media, setMedia] = useState([])
  const [view, setView] = useState('library')
  const [query, setQuery] = useState('')
  const [tags, setTags] = useState([])
  const [selected, setSelected] = useState(null)
  const [theme, setTheme] = useState(localStorage.getItem('kioku-theme') || 'light')
  const [loadError, setLoadError] = useState(null)
  const [archiveCursor, setArchiveCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [sortOrder, setSortOrder] = useState('latest')

  const open = () => {
    sessionStorage.setItem('kioku-unlocked', 'yes')
    setUnlocked(true)
  }

  const lock = () => {
    sessionStorage.removeItem('kioku-unlocked')
    lockArchive().catch((error) => console.warn('Unable to close archive session.', error))
    setUnlocked(false)
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('kioku-theme', theme)
  }, [theme])

  useEffect(() => {
    if (view === 'calendar') {
      document.documentElement.classList.add('calendar-snap')
    } else {
      document.documentElement.classList.remove('calendar-snap')
    }
    return () => {
      document.documentElement.classList.remove('calendar-snap')
    }
  }, [view])

  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth <= 768) return undefined
    if (selected || view === 'space' || view === 'calendar') return undefined

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)

    return () => lenis.destroy()
  }, [selected, view])

  useEffect(() => {
    if (!unlocked || !firebaseReady) return undefined
    let cancelled = false
    setLoadError(null)
    loadArchiveMedia()
      .then(({ items, cursor, hasMore: more }) => {
        if (!cancelled) {
          setMedia(
            items.map((item) => {
              const resolvedDate = resolveCaptureDate(item.filename, null, item.dateTaken)
              const dateObj = resolvedDate instanceof Date ? resolvedDate : new Date(resolvedDate)
              const validDate = isNaN(dateObj.getTime()) ? new Date() : dateObj
              const normalizedDate = validDate.toISOString()
              return {
                ...item,
                dateTaken: normalizedDate,
                searchText: item.searchText || buildSearchText({ ...item, dateTaken: normalizedDate }),
              }
            })
          )
          setArchiveCursor(cursor)
          setHasMore(more)
        }
      })
      .catch((error) => {
        console.error('Unable to load archive media.', error)
        if (!cancelled) setLoadError(error.message || String(error))
      })
    return () => {
      cancelled = true
    }
  }, [unlocked])

  const loadMore = async () => {
    if (!archiveCursor || !hasMore) return
    try {
      const { items, cursor, hasMore: more } = await loadArchiveMedia(archiveCursor)
      setMedia((current) => [...current, ...items.map((item) => ({
        ...item,
        searchText: item.searchText || buildSearchText(item),
      }))])
      setArchiveCursor(cursor)
      setHasMore(more)
    } catch (error) {
      setLoadError(error.message || String(error))
    }
  }

  useEffect(() => {
    const handleContextMenu = (e) => e.preventDefault()
    window.addEventListener('contextmenu', handleContextMenu)

    const params = new URLSearchParams(window.location.search)
    const targetView = params.get('view')
    if (targetView === 'kanri') {
      setView('admin')
    }

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [])

  useEffect(() => {
    if (firebaseReady) return undefined
    let cancelled = false
    fetch('/api/media')
      .then((res) => {
        if (!res.ok) throw new Error('API not available')
        return res.json()
      })
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setMedia(data)
        }
      })
      .catch((error) => console.error('Unable to load local showcase media.', error))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selected) return
    const ordered = newestFirst(media)
    const index = ordered.findIndex((entry) => entry.id === selected.id)
      ;[-1, 1].forEach((offset) => {
        const adjacent = ordered[(index + offset + ordered.length) % ordered.length]
        if (adjacent?.src) {
          const image = new Image()
          image.src = adjacent.src
        }
      })
  }, [media, selected])

  const handleUpdateItem = async (id, updatedTags, updatedNote) => {
    await updateMediaItem(id, updatedTags, updatedNote)
    setMedia((current) =>
      current.map((item) => (item.id === id ? { ...item, tags: updatedTags, note: updatedNote } : item))
    )
    setSelected((current) =>
      current && current.id === id ? { ...current, tags: updatedTags, note: updatedNote } : current
    )
  }

  const filteredMedia = useMemo(() => {
    const sorted = [...media].sort((a, b) => new Date(a.dateTaken) - new Date(b.dateTaken))
    const ordered = sortOrder === 'latest' ? sorted.reverse() : sorted
    if (!tags.length && !query) return ordered
    const q = query.trim().toLowerCase()
    return ordered.filter((item) => {
      const matchesSearch = !q || item.searchText?.includes(q)
      const matchesTags = tags.every((tag) => {
        if (tag === 'Unsorted') {
          return (item.tags || []).includes('Unsorted') || !item.tags || item.tags.length === 0
        }
        return item.tags && item.tags.includes(tag)
      })
      return matchesSearch && matchesTags
    })
  }, [media, sortOrder, tags, query])

  const navigationList = useMemo(() => {
    if (view === 'calendar') {
      return newestFirst(media)
    }
    return filteredMedia
  }, [view, media, filteredMedia])

  const move = (direction) => {
    const index = navigationList.findIndex((entry) => entry.id === selected.id)
    if (index !== -1) {
      setSelected(navigationList[(index + direction + navigationList.length) % navigationList.length])
    }
  }

  if (!unlocked) return <PasscodeGate onUnlock={open} />

  if (view === 'admin') {
    return (
      <Suspense fallback={<main className="gate">Loading manager…</main>}>
        <AdminView
          theme={theme}
          toggleTheme={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
        />
      </Suspense>
    )
  }

  return (
    <>
      <Header
        view={view}
        setView={setView}
        onLock={lock}
        theme={theme}
        toggleTheme={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
      />
      {loadError && (
        <div
          style={{
            background: '#ef4444',
            color: '#fff',
            padding: '12px 20px',
            textAlign: 'center',
            fontWeight: '500',
            position: 'relative',
            zIndex: 9999
          }}
        >
          Error loading archive media: {loadError}
        </div>
      )}
      {view === 'library' ? (
        <Library
          media={media}
          visibleMedia={filteredMedia}
          onSelect={setSelected}
          query={query}
          setQuery={setQuery}
          selectedTags={tags}
          setSelectedTags={setTags}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          hasMore={hasMore}
          onLoadMore={loadMore}
        />
      ) : view === 'calendar' ? (
        <Calendar media={media} onSelect={setSelected} />
      ) : (
        <Space media={media} />
      )}
      {selected && (
        <Viewer
          item={selected}
          onClose={() => setSelected(null)}
          onNext={() => move(1)}
          onPrevious={() => move(-1)}
        />
      )}
      {view !== 'space' && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'instant' })}
          style={{
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            background: 'transparent',
            border: 'none',
            color: 'var(--ink)',
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            cursor: 'pointer',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: '100',
            fontFamily: 'SF Pro'
          }}
          title="Scroll to Top"
        >
          ^
        </button>
      )}
    </>
  )
}
