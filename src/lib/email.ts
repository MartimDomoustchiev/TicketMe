import { mkdir, appendFile } from "fs/promises";
import path from "path";
import { Resend } from "resend";

type EmailInput = {
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
  attachment?: {
    filename: string;
    content: Uint8Array;
    contentType?: string;
  };
};

export type EmailDelivery = "provider" | "local-outbox";

type ProviderError = {
  name?: string;
  message?: string;
  statusCode?: number | null;
};

const EMAIL_ADDRESS_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function normalizeMailFrom(
  configuredFrom: string | undefined,
): string | null {
  const raw = configuredFrom?.trim();
  if (!raw || /[\r\n]/.test(raw)) {
    return null;
  }

  const usesAngleAddress = raw.includes("<") || raw.includes(">");
  const angleMatch = raw.match(/^[^<>]*<\s*([^<>\s]+)\s*>$/);
  const address = usesAngleAddress ? angleMatch?.[1] : raw;

  if (
    !address ||
    address.length > 254 ||
    !EMAIL_ADDRESS_PATTERN.test(address)
  ) {
    return null;
  }

  return `TicketMe <${address}>`;
}

function usesResendTestingDomain(
  from: string | null | undefined,
): boolean {
  return /@resend\.dev(?:>|$)/i.test(from?.trim() ?? "");
}

export function isEmailReadyForArbitraryRecipients(): boolean {
  const from = normalizeMailFrom(process.env.MAIL_FROM);
  return Boolean(
    process.env.RESEND_API_KEY?.trim() &&
      from &&
      !usesResendTestingDomain(from),
  );
}

function getOutboxPath(): string {
  return (
    process.env.EMAIL_OUTBOX_PATH?.trim() ||
    path.join(process.cwd(), ".data", "outbox.log")
  );
}

function canUseDevelopmentOutboxForResendRestriction(
  error: ProviderError,
  from: string,
): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    usesResendTestingDomain(from) &&
    error.statusCode === 403 &&
    error.name === "validation_error" &&
    /only send testing emails to your own email address/i.test(
      error.message ?? "",
    )
  );
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      (
        {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        } as const
      )[character as "&" | "<" | ">" | '"' | "'"],
  );
}

function safeSubjectValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 160);
}

function emailDocument(input: {
  locale: "bg" | "en";
  preheader: string;
  eyebrow: string;
  title: string;
  introduction: string;
  actionLabel: string;
  actionUrl: string;
  secondaryText: string;
  footerText: string;
}): string {
  const lang = input.locale === "en" ? "en" : "bg";
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${input.title}</title>
  </head>
  <body style="margin:0;background:#f3f6fb;color:#10172a;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${input.preheader}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f6fb;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #dbe3f0;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="background:#10172a;padding:24px 32px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="background:#2457ff;border-radius:7px;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.4px;padding:8px 9px;">TM</td>
                    <td style="padding-left:12px;color:#ffffff;font-size:20px;font-weight:700;">TicketMe</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 16px;">
                <p style="margin:0 0 12px;color:#2457ff;font-size:12px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;">${input.eyebrow}</p>
                <h1 style="margin:0 0 16px;color:#10172a;font-size:30px;line-height:1.2;">${input.title}</h1>
                <p style="margin:0;color:#4f5d73;font-size:16px;line-height:1.7;">${input.introduction}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 8px;">
                <a href="${input.actionUrl}" style="display:inline-block;background:#2457ff;border-radius:12px;color:#ffffff;font-size:16px;font-weight:700;padding:15px 22px;text-decoration:none;">${input.actionLabel}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 32px;">
                <p style="margin:0 0 12px;color:#4f5d73;font-size:14px;line-height:1.6;">${input.secondaryText}</p>
                <p style="margin:0;color:#718096;font-size:12px;line-height:1.6;word-break:break-all;">
                  <a href="${input.actionUrl}" style="color:#2457ff;text-decoration:underline;">${input.actionUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e7edf6;padding:20px 32px 24px;color:#718096;font-size:12px;line-height:1.6;">
                ${input.footerText}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function writeToOutbox(input: EmailInput): Promise<void> {
  const outboxPath = getOutboxPath();
  await mkdir(path.dirname(outboxPath), { recursive: true });
  await appendFile(
    outboxPath,
    `${new Date().toISOString()} TO ${input.to} SUBJECT ${input.subject}\n${input.html}\n\n`,
  );
}

export async function sendEmail(
  input: EmailInput,
): Promise<EmailDelivery> {
  const apiKey = process.env.RESEND_API_KEY;
  const configuredFrom = process.env.MAIL_FROM;

  if (!apiKey || !configuredFrom) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Transactional email is not configured. Set RESEND_API_KEY and MAIL_FROM.",
      );
    }

    await writeToOutbox(input);
    return "local-outbox";
  }

  const from = normalizeMailFrom(configuredFrom);
  if (!from) {
    throw new Error(
      "Transactional email is not configured correctly. MAIL_FROM must contain one valid sender email address.",
    );
  }

  if (
    process.env.NODE_ENV === "production" &&
    usesResendTestingDomain(from)
  ) {
    throw new Error(
      "Transactional email is not production-ready. MAIL_FROM must use a custom domain verified in Resend.",
    );
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send(
    {
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachment
        ? [
            {
              filename: input.attachment.filename,
              content: Buffer.from(input.attachment.content).toString("base64"),
              contentType: input.attachment.contentType,
            },
          ]
        : undefined,
    },
    input.idempotencyKey
      ? { idempotencyKey: input.idempotencyKey }
      : undefined,
  );

  if (error) {
    if (canUseDevelopmentOutboxForResendRestriction(error, from)) {
      await writeToOutbox(input);
      return "local-outbox";
    }

    throw new Error(`Email delivery failed: ${error.message}`);
  }

  return "provider";
}

export async function sendVerificationEmail(input: {
  to: string;
  name: string;
  verificationUrl: string;
  locale?: "bg" | "en";
}): Promise<EmailDelivery> {
  const safeName = escapeHtml(input.name);
  const safeUrl = escapeHtml(input.verificationUrl);
  const isEnglish = input.locale === "en";
  const locale = isEnglish ? "en" : "bg";
  return sendEmail({
    to: input.to,
    subject: isEnglish
      ? "Verify your email | TicketMe"
      : "Потвърди имейла си | TicketMe",
    html: emailDocument({
      locale,
      preheader: isEnglish
        ? "Verify your email to activate your TicketMe account."
        : "Потвърди имейла си, за да активираш профила си в TicketMe.",
      eyebrow: isEnglish ? "Secure account activation" : "Сигурно активиране",
      title: isEnglish ? `Welcome, ${safeName}` : `Добре дошъл, ${safeName}`,
      introduction: isEnglish
        ? "Confirm that this email belongs to you and finish creating your TicketMe account."
        : "Потвърди, че този имейл е твой, и завърши създаването на профила си в TicketMe.",
      actionLabel: isEnglish
        ? "Verify email and activate account"
        : "Потвърди имейла и активирай профила",
      actionUrl: safeUrl,
      secondaryText: isEnglish
        ? "This secure link is valid for 30 minutes. If the button does not open, use the link below."
        : "Сигурният линк важи 30 минути. Ако бутонът не се отвори, използвай адреса по-долу.",
      footerText: isEnglish
        ? "If you did not create this account, you can safely ignore this message. TicketMe will never ask for your password by email."
        : "Ако не си създавал този профил, можеш спокойно да игнорираш съобщението. TicketMe никога няма да поиска паролата ти по имейл.",
    }),
  });
}

export async function sendTicketEmail(input: {
  to: string;
  name: string;
  ticketId: string;
  eventName: string;
  downloadUrl: string;
  pdf: Uint8Array;
  locale?: "bg" | "en";
}): Promise<void> {
  const safeName = escapeHtml(input.name);
  const safeUrl = escapeHtml(input.downloadUrl);
  const safeEventName = escapeHtml(input.eventName);
  const isEnglish = input.locale === "en";
  const locale = isEnglish ? "en" : "bg";
  const subjectEventName = safeSubjectValue(input.eventName);
  const subjectTicketId = safeSubjectValue(input.ticketId);
  await sendEmail({
    to: input.to,
    idempotencyKey: `ticket-delivery/${input.ticketId}`,
    subject: isEnglish
      ? `Ticket ${subjectTicketId} for ${subjectEventName}`
      : `Билет ${subjectTicketId} за ${subjectEventName}`,
    html: emailDocument({
      locale,
      preheader: isEnglish
        ? `Your PDF ticket for ${safeEventName} is ready.`
        : `PDF билетът ти за ${safeEventName} е готов.`,
      eyebrow: isEnglish ? "Purchase confirmed" : "Успешно издаден билет",
      title: isEnglish ? `Your ticket is ready, ${safeName}` : `Готово, ${safeName}`,
      introduction: isEnglish
        ? `Your official ticket for <strong style="color:#10172a;">${safeEventName}</strong> is attached as a PDF. Keep its QR code private and present it at the entrance.`
        : `Официалният ти билет за <strong style="color:#10172a;">${safeEventName}</strong> е прикачен като PDF. Пази QR кода личен и го представи на входа.`,
      actionLabel: isEnglish ? "Open my ticket" : "Отвори моя билет",
      actionUrl: safeUrl,
      secondaryText: isEnglish
        ? "The same ticket is stored securely in your TicketMe account. If the button does not open, use the link below."
        : "Същият билет е съхранен сигурно в TicketMe профила ти. Ако бутонът не се отвори, използвай адреса по-долу.",
      footerText: isEnglish
        ? `Ticket ID: ${escapeHtml(input.ticketId)} · One-time admission · Do not forward this email or share the QR code.`
        : `Номер на билет: ${escapeHtml(input.ticketId)} · Еднократен вход · Не препращай този имейл и не споделяй QR кода.`,
    }),
    attachment: {
      filename: `${input.ticketId}.pdf`,
      content: input.pdf,
      contentType: "application/pdf",
    },
  });
}
