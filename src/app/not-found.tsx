import { ArrowRight, SearchX } from "lucide-react";
import Link from "next/link";
import { getLocale, localizeHref } from "@/lib/i18n";

export default async function NotFound() {
  const locale = await getLocale();
  const english = locale === "en";

  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-slate-50 px-4"
    >
      <section className="max-w-lg text-center">
        <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-100 text-blue-700">
          <SearchX size={30} />
        </span>
        <p className="mt-6 text-sm font-black uppercase tracking-[0.2em] text-blue-700">
          {english ? "Error 404" : "Грешка 404"}
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950">
          {english ? "This page is not on stage." : "Тази страница не е на сцената."}
        </h1>
        <p className="mt-4 leading-7 text-slate-600">
          {english
            ? "The event may have moved, or the address may be incorrect."
            : "Възможно е събитието да е преместено или адресът да не е правилен."}
        </p>
        <Link
          href={localizeHref(locale, "/events")}
          className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 font-black text-white transition hover:bg-blue-700"
        >
          {english ? "Browse events" : "Разгледай събитията"}
          <ArrowRight size={18} />
        </Link>
      </section>
    </main>
  );
}
