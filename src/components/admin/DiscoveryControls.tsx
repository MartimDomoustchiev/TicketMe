"use client";

import { Check, LoaderCircle, Play, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Locale } from "@/lib/i18n-config";

type DiscoveryControlsProps =
  | {
      kind: "run";
      locale: Locale;
    }
  | {
      eventId: string;
      kind: "review";
      locale: Locale;
    };

export function DiscoveryControls(props: DiscoveryControlsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const copy =
    props.locale === "en"
      ? {
          approve: "Publish",
          reject: "Reject",
          run: "Run discovery",
          working: "Working…",
          failed: "The operation failed. Check the server logs.",
          completed: "Completed successfully.",
        }
      : {
          approve: "Публикувай",
          reject: "Отхвърли",
          run: "Стартирай откриване",
          working: "Обработва се…",
          failed: "Операцията не успя. Провери server logs.",
          completed: "Операцията приключи успешно.",
        };

  function submit(action?: "publish" | "reject") {
    setMessage("");
    startTransition(async () => {
      try {
        const response =
          props.kind === "run"
            ? await fetch("/api/admin/event-discovery", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              })
            : await fetch("/api/admin/event-discovery/review", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action,
                  eventId: props.eventId,
                }),
              });

        setMessage(response.ok ? copy.completed : copy.failed);
        if (response.ok) {
          router.refresh();
        }
      } catch {
        setMessage(copy.failed);
      }
    });
  }

  if (props.kind === "run") {
    return (
      <div className="grid justify-items-end gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => submit()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2457ff] px-5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? (
            <LoaderCircle
              size={18}
              className="animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Play size={18} aria-hidden="true" />
          )}
          {pending ? copy.working : copy.run}
        </button>
        <StatusMessage message={message} />
      </div>
    );
  }

  return (
    <div className="grid justify-items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("reject")}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-wait disabled:opacity-60"
        >
          <X size={17} aria-hidden="true" />
          {copy.reject}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("publish")}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? (
            <LoaderCircle
              size={17}
              className="animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Check size={17} aria-hidden="true" />
          )}
          {copy.approve}
        </button>
      </div>
      <StatusMessage message={message} />
    </div>
  );
}

function StatusMessage({ message }: { message: string }) {
  return message ? (
    <p aria-live="polite" className="max-w-xs text-right text-xs text-slate-500">
      {message}
    </p>
  ) : null;
}
