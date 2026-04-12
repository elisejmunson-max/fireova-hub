export default function DashboardLoading() {
  return (
    <div>
      <div className="page-header">
        <div className="h-7 w-56 bg-stone-200 rounded animate-pulse mb-2" />
        <div className="h-4 w-64 bg-stone-100 rounded animate-pulse" />
      </div>
      <div className="page-content space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card">
              <div className="h-3 w-20 bg-stone-200 rounded animate-pulse mb-3" />
              <div className="h-8 w-12 bg-stone-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-stone-100 animate-pulse flex-shrink-0" />
              <div className="flex-1">
                <div className="h-4 w-24 bg-stone-200 rounded animate-pulse mb-2" />
                <div className="h-3 w-32 bg-stone-100 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
        <div className="card divide-y divide-stone-100 overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1">
                <div className="h-4 w-3/4 bg-stone-200 rounded animate-pulse mb-1.5" />
                <div className="h-3 w-24 bg-stone-100 rounded animate-pulse" />
              </div>
              <div className="h-5 w-16 bg-stone-100 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
