import Link from 'next/link'

export default function WeeklyPlan() {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400">This Week</h2>
          <p className="text-sm text-stone-500 mt-1">Your goal: 3 strong posts, balanced for the brand.</p>
        </div>
        <span className="badge bg-ember-50 text-ember-700">AI Marketing Manager</span>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100 bg-stone-50/60">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-stone-900">Weekly plan is being built for you</p>
              <p className="text-xs text-stone-500 mt-1 max-w-2xl">
                Fireova Content will choose the strongest three posts from your full library, balance the mix, and prepare the media, caption, tags, and recommended posting time for approval.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-stone-500 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Strategy engine ready
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-stone-100">
          {['Post 1', 'Post 2', 'Post 3'].map((label, index) => (
            <div key={label} className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-stone-700">{label}</span>
                <span className="text-[11px] text-stone-400">{index === 0 ? 'Next up' : 'Planned'}</span>
              </div>
              <div className="aspect-[4/3] rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center mb-3">
                <span className="text-xs text-stone-400">Best media will appear here</span>
              </div>
              <div className="h-2 rounded bg-stone-100 w-full mb-2" />
              <div className="h-2 rounded bg-stone-100 w-3/4" />
            </div>
          ))}
        </div>

        <div className="px-5 py-3.5 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-stone-500">
            Approve should be the main job. Rejections will teach the system what not to repeat.
          </p>
          <Link href="/content-bank" className="text-xs font-semibold text-ember-600 hover:text-ember-700">
            View content library
          </Link>
        </div>
      </div>
    </section>
  )
}
