export default function Header({ view, setView, onLock, theme, toggleTheme }) {
  return (
    <header className="site-header">
      <button className="wordmark" onClick={() => setView('library')} aria-label="Return to archive">
        kioku<span>Archive</span>
      </button>
      <nav aria-label="Archive views">
        {[
          ['library', 'library'],
          ['space', 'Kūkan'],
          ['calendar', 'calendar']
        ].map(([item, label]) => (
          <button
            key={item}
            className={view === item ? 'active' : ''}
            onClick={() => setView(item)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="header-actions">
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
        <button className="quiet-button" onClick={onLock}>
          Lock
        </button>
      </div>
    </header>
  )
}
