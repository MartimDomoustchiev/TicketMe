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
  const copy = CHECK_IN_COPY[locale];
  const secretMatches = Boolean(ticket && ticket.qrSecret === secret);
  const testSimulation =
    ticket?.purchaseSnapshot?.offerKind === "test-simulation";
  const admissionTicket =
    ticket?.purchaseSnapshot?.offerKind === "admission";
  const successfulCheckIn =
    status === "success" && ticket?.status === "checked_in";
  const alreadyUsed =
    status === "already-used" && ticket?.status === "checked_in";
  const verifiedTestTicket =
    status === "test-ticket" &&
    ticket?.purchaseSnapshot?.offerKind === "test-simulation";
  const hasTrustedStatus =
    successfulCheckIn ||
    alreadyUsed ||
    verifiedTestTicket ||
    status === "invalid";

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-xl">
        <Link
          href={localizeHref(locale, "/admin")}
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={17} aria-hidden="true" />
          {copy.back}
        </Link>

        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
          <div className="bg-slate-950 p-6 text-white">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600">
              <ScanLine size={24} aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-3xl font-black">{copy.title}</h1>
            <p className="mt-2 text-slate-300">
              {copy.description}
            </p>
          </div>

          <div className="p-6">
            {successfulCheckIn && (
              <StatusBox tone="success" icon={<CheckCircle2 size={20} />}>
                {copy.success}
              </StatusBox>
            )}
            {alreadyUsed && (
              <StatusBox tone="warning" icon={<AlertTriangle size={20} />}>
                {copy.alreadyUsed}
              </StatusBox>
            )}
            {(verifiedTestTicket ||
              (ticket && secretMatches && testSimulation)) && (
              <StatusBox tone="info" icon={<ShieldCheck size={20} />}>
                {copy.testTicket}
              </StatusBox>
            )}
            {ticket && secretMatches && !ticket.purchaseSnapshot && (
              <StatusBox tone="danger" icon={<AlertTriangle size={20} />}>
                {copy.legacyTicket}
              </StatusBox>
            )}
            {!id && (
              <StatusBox tone="info" icon={<ScanLine size={20} />}>
                {copy.scanInstructions}
              </StatusBox>
            )}
            {(status === "invalid" ||
              (id && !hasTrustedStatus && (!ticket || !secretMatches))) && (
              <StatusBox tone="danger" icon={<AlertTriangle size={20} />}>
                {copy.invalid}
              </StatusBox>
            )}

            {ticket && secretMatches && (
              <>
                <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-5">
                  <Detail
                    label={copy.event}
                    value={
                      ticket.purchaseSnapshot?.eventName ?? ticket.eventName
                    }
                  />
                  <Detail label={copy.visitor} value={ticket.buyerName} />
                  <Detail label={copy.seat} value={ticket.seatLabel} />
                  <Detail label={copy.number} value={ticket.id} />
                  <Detail
                    label={copy.status}
                    value={
                      testSimulation
                        ? copy.testStatus
                        : !admissionTicket
                        ? copy.legacyStatus
                        : ticket.status === "checked_in"
                        ? copy.usedStatus
                        : copy.validStatus
                    }
                  />
                </div>

                {ticket.status === "issued" &&
                  status !== "success" &&
                  admissionTicket && (
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
                      <TicketCheck size={19} aria-hidden="true" />
                      {copy.confirm}
                    </button>
                  </form>
                )}

                <p className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-slate-500">
                  <ShieldCheck size={15} aria-hidden="true" />
                  {copy.audit}
                </p>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

const CHECK_IN_COPY = {
  bg: {
    back: "Към организаторския панел",
    title: "Проверка на билет",
    description:
      "Потвърди данните, преди да маркираш билета като използван.",
    success:
      "Проверката е успешна. Билетът вече е маркиран като използван.",
    alreadyUsed: "Този билет вече е бил използван.",
    testTicket:
      "QR кодът потвърждава Tiketko Stripe тестова покупка. PDF файлът не е валиден за вход и не може да бъде маркиран като използван.",
    legacyTicket:
      "Този стар билет няма надеждни данни за покупката и не може да бъде допуснат за проверка на входа.",
    scanInstructions:
      "Сканирай QR кода от PDF билета с камерата на служебния телефон. Данните за посетителя ще се покажат тук за потвърждение.",
    invalid: "Билетът или кодът за проверка е невалиден.",
    event: "Събитие",
    visitor: "Посетител",
    seat: "Място",
    number: "Номер",
    status: "Статус",
    testStatus: "Stripe тест - без право на вход",
    legacyStatus: "Непотвърден стар билет",
    usedStatus: "Вече използван",
    validStatus: "Валиден билет за вход",
    confirm: "Потвърди влизането",
    audit: "Действието се записва в одитния журнал",
  },
  en: {
    back: "Back to organizer dashboard",
    title: "Ticket check-in",
    description: "Confirm the details before marking the ticket as used.",
    success: "Check-in succeeded. The ticket is now marked as used.",
    alreadyUsed: "This ticket has already been used.",
    testTicket:
      "The QR code confirms a Tiketko Stripe test purchase. The PDF is not valid for admission and cannot be marked as used.",
    legacyTicket:
      "This legacy ticket has no trusted purchase snapshot and cannot be admitted.",
    scanInstructions:
      "Scan the PDF ticket QR code with the staff phone. The visitor details will appear here for confirmation.",
    invalid: "The ticket or verification code is invalid.",
    event: "Event",
    visitor: "Visitor",
    seat: "Seat",
    number: "Number",
    status: "Status",
    testStatus: "Stripe test - no admission rights",
    legacyStatus: "Unverified legacy ticket",
    usedStatus: "Already used",
    validStatus: "Valid admission ticket",
    confirm: "Confirm check-in",
    audit: "This action is recorded in the audit log",
  },
} as const;

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
