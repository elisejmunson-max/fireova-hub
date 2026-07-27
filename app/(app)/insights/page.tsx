'use client'

const RECOMMENDATIONS = [
  {
    title: 'Post more Team content.',
    reason: 'Team moments help the brand feel warm and human.',
  },
  {
    title: 'Wedding posts perform well.',
    reason: 'Keep event stories visible while wedding season is active.',
  },
  {
    title: "Charcuterie hasn't been featured recently.",
    reason: 'A food feature would balance the current media mix.',
  },
]

export default function InsightsPage() {
  return (
    <div className="min-h-full bg-white pb-10">
      <div className="px-5 pb-5 pt-7 sm:px-8 sm:pb-7 sm:pt-8">
        <div className="mx-auto max-w-6xl">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">Insights</p>
          <h1 className="text-[34px] font-semibold leading-none text-stone-950 sm:text-5xl">Recommendations</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-6 text-stone-500">
            Lightweight guidance for what Fireova should create next. Analytics dashboards can build from here later.
          </p>
        </div>
      </div>

      <main className="px-5 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <section className="grid gap-4 md:grid-cols-3">
            {RECOMMENDATIONS.map((recommendation) => (
              <article key={recommendation.title} className="rounded-[30px] bg-stone-50 p-5 ring-1 ring-stone-100 sm:p-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Suggested</p>
                <h2 className="mt-4 text-xl font-semibold leading-tight text-stone-950">{recommendation.title}</h2>
                <p className="mt-3 text-sm leading-6 text-stone-500">{recommendation.reason}</p>
              </article>
            ))}
          </section>
        </div>
      </main>
    </div>
  )
}
