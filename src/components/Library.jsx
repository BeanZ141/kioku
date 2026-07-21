import { useState, useEffect, useMemo } from 'react'
import { Virtuoso } from 'react-virtuoso'
import logo from '../assets/logo.png'
import FilterBar from './FilterBar'
import ArchiveImage from './ArchiveImage'
import { fileCaption } from '../helpers'

export default function Library({
  media,
  visibleMedia,
  onSelect,
  query,
  setQuery,
  selectedTags,
  setSelectedTags,
  sortOrder,
  setSortOrder,
  hasMore,
  onLoadMore
}) {
  const [layoutMode, setLayoutModeState] = useState(() => localStorage.getItem('kioku-layout-mode') || 'grid')

  const setLayoutMode = (mode) => {
    setLayoutModeState(mode)
    localStorage.setItem('kioku-layout-mode', mode)
  }

  const [numColumns, setNumColumns] = useState(() => {
    if (typeof window === 'undefined') return 3
    if (window.innerWidth <= 550) return 1
    if (window.innerWidth <= 900) return 2
    return 3
  })

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 550) setNumColumns(1)
      else if (window.innerWidth <= 900) setNumColumns(2)
      else setNumColumns(3)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  const tags = useMemo(() => {
    const dbTags = media.flatMap((item) => item.tags || [])
    const defaultCategories = [
      'Nature',
      'Travel',
      'People',
      'Animals',
      'Architecture',
      'Food',
      'Objects',
      'Unsorted'
    ]
    const allTags = [...new Set([...defaultCategories, ...dbTags])].sort()
    return allTags.filter((tag) => {
      return media.some((m) => {
        if (tag === 'Unsorted') return !m.tags || m.tags.length === 0 || m.tags.includes('Unsorted')
        return m.tags?.includes(tag)
      })
    })
  }, [media])

  const visible = visibleMedia

  const toggleTag = (tag) => {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((x) => x !== tag) : [...current, tag]
    )
  }

  const tagItems = useMemo(() => {
    const map = {}
    for (const tag of tags) {
      let item = media.find((m) => m.coverForTags?.includes(tag))
      if (!item) {
        item = media.find((m) => {
          if (tag === 'Unsorted') return !m.tags || m.tags.length === 0 || m.tags.includes('Unsorted')
          return m.tags?.includes(tag)
        })
      }
      if (item) {
        map[tag] = item
      }
    }
    return map
  }, [media, tags])

  const cosmosColumns = useMemo(() => {
    const cols = Array.from({ length: numColumns }, () => [])
    visible.forEach((item, index) => {
      cols[index % numColumns].push({ item, originalIndex: index })
    })
    return cols
  }, [visible, numColumns])

  const rows = useMemo(() => {
    const chunked = []
    for (let i = 0; i < visible.length; i += 3) {
      chunked.push({
        startIndex: i,
        items: visible.slice(i, i + 3)
      })
    }
    return chunked
  }, [visible])

  return (
    <main>
      <section className="archive-title">
        <img src={logo} className="archive-logo" alt="logo" />
        <div className="archive-tag-row">
          {tags.map((tag) => {
            const tagItem = tagItems[tag]
            const isSelected = selectedTags.includes(tag)
            return (
              <button
                key={tag}
                className={`archive-tag-item${isSelected ? ' selected' : ''}`}
                onClick={() => toggleTag(tag)}
                title={tag}
                aria-label={`Filter by ${tag}`}
              >
                {tagItem && (
                  <ArchiveImage
                    item={tagItem}
                    alt={tag}
                    size={300}
                    aspectRatio="1/4"
                  />
                )}
                <span className="archive-tag-label">{tag}</span>
              </button>
            )
          })}
        </div>
      </section>
      <FilterBar
        {...{
          query,
          setQuery,
          sortOrder,
          setSortOrder,
          layoutMode,
          setLayoutMode
        }}
        total={visible.length}
      />
      {visible.length === 0 ? (
        <p className="empty-state">No archive items match this search.</p>
      ) : layoutMode === 'cosmos' ? (
        <div className="cosmos-grid">
          {cosmosColumns.map((col, colIdx) => (
            <div className="cosmos-column" key={colIdx}>
              {col.map(({ item, originalIndex }) => (
                <article className="cosmos-item" key={item.id}>
                  <button className="image-button" onClick={() => onSelect(item)}>
                    <ArchiveImage item={item} alt={item.filename} />
                  </button>
                  <div className="memory-caption">
                    <span>{String(originalIndex + 1).padStart(2, '0')}</span>
                    <div>
                      <small>{fileCaption(item)}</small>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <Virtuoso
          useWindowScroll
          data={rows}
          computeItemKey={(index) => rows[index].items.map((item) => item.id).join('-')}
          style={{ paddingTop: '72px', paddingBottom: '120px' }}
          itemContent={(rowIndex, row) => (
            <div
              className="editorial-grid"
              aria-label="Photograph library"
              style={{
                paddingTop: 0,
                paddingBottom: rowIndex === rows.length - 1 ? 0 : '42px',
                marginTop: 0,
                marginBottom: 0
              }}
            >
              {row.items.map((item, indexInRow) => {
                const globalIndex = row.startIndex + indexInRow
                return (
                  <article className={`memory layout-${globalIndex % 16}`} key={item.id}>
                    <button className="image-button" onClick={() => onSelect(item)}>
                      <ArchiveImage item={item} alt={item.filename} />
                    </button>
                    <div className="memory-caption">
                      <span>{String(globalIndex + 1).padStart(2, '0')}</span>
                      <div>
                        <small>{fileCaption(item)}</small>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        />
      )}
      {hasMore && (
        <button className="ink-button load-more" onClick={onLoadMore}>
          Load more
        </button>
      )}
    </main>
  )
}
