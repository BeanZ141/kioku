import { lazy, Suspense } from 'react'

const SpaceScene = lazy(() => import('../SpaceScene'))

export default function Space({ media }) {
  return (
    <main className="space-page">
      <header className="space-header">
        <p className="eyebrow">空間</p>
        <p className="note">
          Kūkan (空間) is the Japanese concept of "space" or "dimension". It describes not only
          physical, measurable space but also the meaningful "emptiness" between objects or people.
        </p>
      </header>
      <Suspense fallback={<p className="empty-state">Loading space…</p>}>
        <SpaceScene media={media} />
      </Suspense>
    </main>
  )
}
