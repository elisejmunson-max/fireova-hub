'use client'

const FUTURE_INTEGRATIONS = ['Instagram', 'Facebook', 'TikTok', 'Google Business Profile']

export default function PublishPage() {
  return (
    <div className="min-h-full bg-white pb-10">
      <div className="px-5 pb-5 pt-7 sm:px-8 sm:pb-7 sm:pt-8">
        <div className="mx-auto max-w-6xl">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">Publish</p>
          <h1 className="text-[34px] font-semibold leading-none text-stone-950 sm:text-5xl">Publishing Connections</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-6 text-stone-500">
            Connectors will live here when Fireova is ready to publish approved content directly.
          </p>
        </div>
      </div>

      <main className="px-5 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1fr_0.8fr]">
          <section className="rounded-[30px] bg-stone-50 p-5 ring-1 ring-stone-100 sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Status</p>
            <h2 className="mt-3 text-2xl font-semibold text-stone-950">No publishing providers connected yet</h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Approved and scheduled drafts stay local until publishing integrations are added.
            </p>
          </section>

          <section className="rounded-[30px] bg-white p-5 ring-1 ring-stone-200 sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Future Integrations</p>
            <div className="mt-4 space-y-2">
              {FUTURE_INTEGRATIONS.map((integration) => (
                <div key={integration} className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-3">
                  <span className="text-sm font-semibold text-stone-900">{integration}</span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-500 ring-1 ring-stone-200">Planned</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
