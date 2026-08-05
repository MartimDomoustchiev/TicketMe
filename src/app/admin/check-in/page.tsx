import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ScanLine,
  ShieldCheck,
  TicketCheck,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/auth";
import { getEventById, isTestSimulationEvent } from "@/lib/event";
import { getLocale, localizeHref } from "@/lib/i18n";
import { getTicket } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string;
    secret?: string;
    status?: string;
  }>;
}) {
  const [{ id = "", secret = "", status }, locale] = await Promise.all([
    searchParams,
    getLocale(),
  ]);

  if (!(await isAdminSession())) {
    const params = new URLSearchParams();
    if (id) params.set("id", id);
    if (secret) params.set("secret", secret);
    const returnPath = params.size
      ? `/admin/check-in?${params.toString()}`
      : "/admin/check-in";
    const destination = localizeHref(locale, returnPath);
    redirect(
      `${localizeHref(locale, "/login")}?next=${encodeURIComponent(destination)}`,
    );
  }

  const ticket = id ? await getTicket(id) : null;
  const secretMatches = Boolean(ticket && ticket.qrSecret === secret);
  const event = ticket ? getEventById(ticket.eventId) : undefined;
  const testSimulation = Boolean(event && isTestSimulationEvent(event));

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-xl">
        <Link
          href={localizeHref(locale, "/admin")}
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={17} />
          Към операционния панел
        </Link>

        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
          <div className="bg-slate-950 p-6 text-white">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600">
              <ScanLine size={24} />
            </span>
            <h1 className="mt-5 text-3xl font-black">Проверка на билет</h1>
            <p className="mt-2 text-slate-300">
              Потвърди данните, преди да маркираш билета като използван.
            </p>
          </div>

          <div className="p-6">
            {status === "success" && (
              <StatusBox tone="success" icon={<CheckCircle2 size={20} />}>
                Check-in е успешен. Билетът вече е маркиран като използван.
              </StatusBox>
            )}
            {status === "already-used" && (
              <StatusBox tone="warning" icon={<AlertTriangle size={20} />}>
                Този билет вече е бил използван.
              </StatusBox>
            )}
            {(status === "test-ticket" ||
              (ticket && secretMatches && testSimulation)) && (
              <StatusBox tone="info" icon={<ShieldCheck size={20} />}>
                QR кодът потвърждава Tiketko Stripe тестова покупка. Този
                PDF не е валиден за вход в събитието и не може да бъде
                маркиран като използван.
              </StatusBox>
            )}
            {!id && (
              <StatusBox tone="info" icon={<ScanLine size={20} />}>
                Сканирай QR кода от PDF билета с камерата на служебния
                телефон. След отваряне на линка данните за посетителя ще се
                покажат тук за потвърждение.
              </StatusBox>
            )}
            {(status === "invalid" || (id && (!ticket || !secretMatches))) && (
              <StatusBox tone="danger" icon={<AlertTriangle size={20} />}>
                Билетът или кодът за проверка е невалиден.
              </StatusBox>
            )}

            {ticket && secretMatches && (
              <>
                <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-5">
                  <Detail label="Събитие" value={ticket.eventName} />
                  <Detail label="Посетител" value={ticket.buyerName} />
                  <Detail label="Място" value={ticket.seatLabel} />
                  <Detail label="Номер" value={ticket.id} />
                  <Detail
                    label="Статус"
                    value={
                      testSimulation
                        ? "Stripe тест - без право на вход"
                        : ticket.status === "checked_in"
                        ? "Вече използван"
                        : "Валиден"
                    }
                  />
                </div>

                {ticket.status === "issued" &&
                  status !== "success" &&
                  !testSimulation && (
                  <form
                    action={`/api/tickets/${ticket.id}/verify`}
                    method="post"
                    className="mt-5"
                  >
                    <input type="hidden" name="secret" value={secret} />
                    <button
                      type="submit"
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 font-black text-white transition hover:bg-emerald-700"
                    >
                      <TicketCheck size={19} />
                      Потвърди check-in
                    </button>
                  </form>
                )}

                <p className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-slate-500">
                  <ShieldCheck size={15} />
                  Действието се записва в одитния журнал
                </p>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-slate-200 pb-3 last:border-0 last:pb-0">
      <span className="text-sm font-bold text-slate-500">{label}</span>
      <span className="max-w-[65%] text-right font-black text-slate-950">
        {value}
      </span>
    </div>
  );
}

function StatusBox({
  tone,
  icon,
  children,
}: {
  tone: "success" | "warning" | "danger" | "info";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const styles = {
    success: "bg-emerald-50 text-emerald-900",
    warning: "bg-amber-50 text-amber-900",
    danger: "bg-rose-50 text-rose-900",
    info: "bg-blue-50 text-blue-900",
  };

  return (
    <p
      className={`flex items-start gap-2 rounded-2xl p-4 text-sm font-bold ${styles[tone]}`}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      {children}
    </p>
  );
}
