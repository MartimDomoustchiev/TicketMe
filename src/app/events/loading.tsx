export default function EventsLoading() {
  return (
    <main
      className="min-h-screen animate-pulse bg-[#f6f8fc]"
      aria-label="Зареждане на събитията"
    >
      <div className="h-8 bg-[#10172a]" />
      <div className="h-[116px] border-b border-slate-200 bg-white" />
      <div className="h-72 bg-[#10172a]" />
      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="h-24 rounded-2xl bg-white shadow-sm" />
        <div className="mt-8 h-8 w-72 rounded-lg bg-slate-200" />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
            >
              <div className="aspect-[16/10] bg-slate-200" />
              <div className="space-y-3 p-4">
                <div className="h-5 rounded bg-slate-200" />
                <div className="h-4 w-3/4 rounded bg-slate-100" />
                <div className="h-6 w-1/3 rounded bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
