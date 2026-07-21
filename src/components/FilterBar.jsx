export default function FilterBar({
  query,
  setQuery,
  sortOrder,
  setSortOrder,
  layoutMode = 'grid',
  setLayoutMode,
  total
}) {
  return (
    <section className="filter-bar">
      <div
        className="filter-controls-row"
        style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}
      >
        <div className="search-wrap" style={{ flex: 1, minWidth: '200px' }}>
          <span>Search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search archive"
            aria-label="Search archive"
          />
        </div>

        {setLayoutMode && (
          <div
            className="layout-toggle-wrap"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '4px'
            }}
          >
            <button
              type="button"
              className={`layout-toggle-btn ${layoutMode === 'grid' ? 'active' : ''}`}
              onClick={() => setLayoutMode('grid')}
              title="Grid A (Editorial Random Layout)"
              aria-label="Grid A"
            >
              <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="5" height="6" rx="0" />
                <rect x="10" y="2" width="6" height="4" rx="0" />
                <rect x="2" y="12" width="5" height="4" rx="0" />
                <rect x="10" y="8" width="6" height="8" rx="0" />
              </svg>
            </button>

            <button
              type="button"
              className={`layout-toggle-btn ${layoutMode === 'cosmos' ? 'active' : ''}`}
              onClick={() => setLayoutMode('cosmos')}
              title="Grid B (Cosmos Staggered Layout)"
              aria-label="Grid B"
            >
              <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="6" height="7" rx="0" />
                <rect x="2" y="11" width="6" height="5" rx="0" />
                <rect x="10" y="2" width="6" height="5" rx="0" />
                <rect x="10" y="8" width="6" height="7" rx="0" />
              </svg>
            </button>
          </div>
        )}

        <div
          className="sort-wrap"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '8px 12px'
          }}
        >
          <span
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              letterSpacing: '0.05em',
              fontWeight: '600'
            }}
          >
            Sort
          </span>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink)',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
              fontWeight: '300',
              fontFamily: 'SF Pro'
            }}
          >
            <option value="latest" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
              Latest First
            </option>
            <option value="oldest" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
              Oldest First
            </option>
          </select>
        </div>
      </div>
      <p className="result-count">{total} items</p>
    </section>
  )
}
