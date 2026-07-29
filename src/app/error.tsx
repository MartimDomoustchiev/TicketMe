"use client";

import { RefreshCw } from "lucide-react";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      id="main-content"
      className="flex min-h-[70vh] items-center justify-center bg-slate-50 px-4"
    >
      <section className="max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/60">
        <h1 className="text-3xl font-black text-slate-950">
          Something went wrong / Нещо не се получи
        </h1>
        <p className="mt-3 leading-7 text-slate-600">
          A temporary problem interrupted the request. Please try again in a
          moment. / Временен проблем прекъсна заявката. Опитай отново след
          момент.
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 font-black text-white transition hover:bg-slate-800"
        >
          <RefreshCw size={18} />
          Try again / Опитай отново
        </button>
      </section>
    </main>
  );
}
