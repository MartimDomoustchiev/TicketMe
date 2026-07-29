export default function EventDetailsLoading() {
  return (
    <main
      className="min-h-screen animate-pulse bg-[#f6f8fc]"
      aria-label="Зареждане на събитието"
    >
      <div className="h-8 bg-[#10172a]" />
      <div className="h-[116px] border-b border-slate-200 bg-white" />
      <div className="h-11 border-b border-slate-200 bg-white" />
      <section className="bg-[#10172a] px-4 py-14">
        <div className="mx-auto grid min-h-[470px] max-w-7xl items-end gap-10 lg:grid-cols-[1fr_360px]">
          <div>
            <div className="h-5 w-36 rounded bg-white/10" />
            <div className="mt-8 h-12 max-w-2xl rounded-xl bg-white/15" />
            <div className="mt-4 h-12 max-w-xl rounded-xl bg-white/10" />
            <div className="mt-8 h-11 max-w-lg rounded-xl bg-white/10" />
          </div>
          <div className="h-64 rounded-2xl bg-white/15" />
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-14 lg:grid-cols-[1fr_340px]">
        <div className="h-80 rounded-2xl bg-white shadow-sm" />
        <div className="h-80 rounded-2xl bg-white shadow-sm" />
      </section>
    </main>
  );
}
