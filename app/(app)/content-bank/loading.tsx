export default function ContentBankLoading() {
  return (
    <div>
      <div className="page-header">
        <div className="h-7 w-40 bg-stone-200 rounded animate-pulse mb-2" />
        <div className="h-4 w-24 bg-stone-100 rounded animate-pulse" />
      </div>
      <div className="page-content space-y-4">
        <div className="flex gap-2">
          <div className="h-9 w-48 bg-white border border-stone-200 rounded-lg animate-pulse" />
          <div className="h-9 w-36 bg-white border border-stone-200 rounded-lg animate-pulse" />
        </div>
        <div className="card divide-y divide-stone-100 overflow-hidden">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-start gap-4 px-5 py-4">
              <div className="flex-1">
                <div className="flex gap-2 mb-2">
                  <div className="h-5 w-20 bg-stone-100 rounded-full animate-pulse" />
                  <div className="h-5 w-12 bg-stone-100 rounded animate-pulse" />
                </div>
                <div className="h-4 w-3/4 bg-stone-200 rounded animate-pulse" />
              </div>
              <div className="flex gap-2">
                <div className="h-5 w-16 bg-stone-100 rounded-full animate-pulse" />
                <div className="h-4 w-20 bg-stone-100 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
