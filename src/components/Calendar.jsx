import { useMemo } from 'react'
import ArchiveImage from './ArchiveImage'
import { newestFirst, months } from '../helpers'

export default function Calendar({ media, onSelect }) {
  const grouped = useMemo(() => {
    return newestFirst(media).reduce((groups, item) => {
      const key = item.dateTaken.slice(0, 7)
        ; (groups[key] ||= []).push(item)
      return groups
    }, {})
  }, [media])

  const monthsArray = useMemo(() => Object.entries(grouped).sort().reverse(), [grouped])

  return (
    <main className="calendar-page">
      <section className="calendar-heading">
        <p className="eyebrow">Archive index</p>
        <h1>Calendar</h1>
      </section>
      <div className="calendar-line" />
      <div className="calendar-months-list">
        {monthsArray.map(([key, items], index) => {
          const [year, month] = key.split('-')
          const isFirst = index === 0
          return (
            <section className={`month-block${isFirst ? ' no-snap' : ''}`} key={key}>
              <header style={{ position: 'sticky', top: '94px', height: 'min-content' }}>
                <p className="eyebrow">{year}</p>
                <h2>{months[Number(month) - 1]}</h2>
                <span>{items.length} items</span>
              </header>
              <div className="calendar-strip">
                {items.map((item) => (
                  <button
                    className="calendar-item"
                    key={item.id}
                    onClick={() => onSelect(item)}
                  >
                    <ArchiveImage item={item} alt={item.filename} size={150} quality={0.7} aspectRatio="1/1" showLoader={true} />
                    <span>{String(new Date(item.dateTaken).getDate()).padStart(2, '0')}</span>
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
