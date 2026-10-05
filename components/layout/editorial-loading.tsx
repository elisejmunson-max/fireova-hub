export default function EditorialLoading() {
  return (
    <section className="editorial-loading" aria-busy="true" aria-label="Loading content">
      <div className="editorial-loading-heading">
        <div className="h-3 w-28 rounded-full bg-[#deddd4] animate-pulse" />
        <div className="mt-4 h-10 w-64 max-w-full rounded bg-[#e6e4dc] animate-pulse" />
        <div className="mt-3 h-3 w-80 max-w-full rounded-full bg-[#e6e4dc] animate-pulse" />
      </div>
      <div className="editorial-loading-grid content-gallery-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="editorial-loading-card">
            <div className="content-gallery-tile bg-[#e2e0d8] animate-pulse" />
            <div className="mt-4 h-3 w-20 max-w-full rounded-full bg-[#deddd4] animate-pulse" />
            <div className="mt-3 h-5 w-4/5 rounded bg-[#e6e4dc] animate-pulse" />
            <div className="mt-2 h-3 w-3/5 rounded-full bg-[#e6e4dc] animate-pulse" />
          </div>
        ))}
      </div>
    </section>
  );
}
