"use client";

import {
  AlertCircle,
  ArrowRight,
  AtSign,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  MailCheck,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { useEffect, useRef, useState } from "react";

export type AuthMode = "login" | "signup";
type Locale = "bg" | "en";
type Account = {
  role: "buyer" | "admin";
  email: string;
  name: string;
};

type AuthPortalProps = {
  locale: Locale;
  mode: AuthMode;
  next: string;
  email: string;
  error?: string;
  sent?: string;
  loginHref: string;
  signupHref: string;
  account: Account | null;
  localEmailFallback: boolean;
};

const FIELD_BASE =
  "h-12 w-full rounded-xl border bg-white text-[15px] font-semibold text-slate-950 outline-none transition placeholder:font-medium placeholder:text-slate-400 hover:border-slate-400 focus:border-[#2864ff] focus:ring-4 focus:ring-blue-100";

export function AuthPortal({
  locale,
  mode,
  next,
  email,
  error,
  sent,
  loginHref,
  signupHref,
  account,
  localEmailFallback,
}: AuthPortalProps) {
  const copy = AUTH_COPY[locale];
  const errorMessage =
    error === "unverified" && localEmailFallback
      ? copy.localUnverified
      : error &&
        (copy.errors[error as keyof typeof copy.errors] ??
          copy.errors.generic);
  const errorField = error ? ERROR_FIELDS[error] : undefined;
  const statePanelRef = useRef<HTMLDivElement>(null);
  const serviceUnavailable = error === "service-unavailable";
  const verificationDeliveryFailed =
    error === "email-delivery" && Boolean(email);
  const verificationSent =
    !error && sent === "verification" && Boolean(email);

  useEffect(() => {
    if (error || sent === "verification") {
      statePanelRef.current?.focus();
    }
  }, [error, sent]);

  if (account) {
    return (
      <SignedInPanel
        account={account}
        locale={locale}
        next={next}
      />
    );
  }

  return (
    <div>
      <nav
        aria-label={copy.authChoice}
        className="grid grid-cols-2 rounded-xl bg-slate-100 p-1"
      >
        <ModeLink
          href={loginHref}
          active={mode === "login"}
          label={copy.loginTab}
        />
        <ModeLink
          href={signupHref}
          active={mode === "signup"}
          label={copy.signupTab}
        />
      </nav>

      {serviceUnavailable ? (
        <ServiceUnavailablePanel
          panelRef={statePanelRef}
          locale={locale}
          mode={mode}
          retryHref={mode === "login" ? loginHref : signupHref}
          copy={copy}
        />
      ) : verificationDeliveryFailed || verificationSent ? (
        <VerificationStatePanel
          panelRef={statePanelRef}
          locale={locale}
          email={email}
          next={next}
          failed={verificationDeliveryFailed}
          loginHref={loginHref}
          localEmailFallback={localEmailFallback}
          copy={copy}
        />
      ) : (
        <>
          {errorMessage && (
            <div
              ref={statePanelRef}
              id="auth-error"
              role="alert"
              tabIndex={-1}
              className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-950 outline-none focus-visible:ring-4 focus-visible:ring-rose-100"
            >
              <div className="flex items-start gap-3">
                <AlertCircle
                  size={20}
                  className="mt-0.5 shrink-0 text-rose-600"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-sm font-extrabold">
                    {copy.problemTitle}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-rose-800">
                    {errorMessage}
                  </p>
                  {error === "unverified" && email && (
                    <ResendForm
                      locale={locale}
                      email={email}
                      next={next}
                      label={
                        localEmailFallback
                          ? copy.continueVerification
                          : copy.resend
                      }
                      variant="secondary"
                    />
                  )}
                  {error === "account-exists" && (
                    <Link
                      href={loginHref}
                      className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-900 px-4 text-sm font-extrabold text-white transition hover:bg-rose-800 focus-visible:ring-4 focus-visible:ring-rose-200"
                    >
                      {copy.goToLogin}
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}

          {mode === "login" ? (
            <LoginForm
              locale={locale}
              next={next}
              email={email}
              errorField={errorField}
              hasError={Boolean(errorField)}
              copy={copy}
            />
          ) : (
            <SignupForm
              locale={locale}
              next={next}
              email={email}
              errorField={errorField}
              hasError={Boolean(errorField)}
              copy={copy}
              localEmailFallback={localEmailFallback}
            />
          )}
        </>
      )}
    </div>
  );
}

function ServiceUnavailablePanel({
  panelRef,
  locale,
  mode,
  retryHref,
  copy,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  locale: Locale;
  mode: AuthMode;
  retryHref: string;
  copy: (typeof AUTH_COPY)[Locale];
}) {
  return (
    <div
      ref={panelRef}
      id="auth-error"
      role="alert"
      tabIndex={-1}
      className="mt-5 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 text-amber-950 outline-none focus-visible:ring-4 focus-visible:ring-amber-100"
    >
      <div className="border-b border-amber-200/80 p-5">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700 ring-1 ring-amber-200">
          <AlertCircle size={22} aria-hidden="true" />
        </span>
        <p className="mt-4 text-lg font-black tracking-[-0.025em]">
          {copy.serviceUnavailableTitle}
        </p>
        <p className="mt-2 text-sm leading-6 text-amber-900">
          {mode === "signup"
            ? copy.serviceUnavailableSignup
            : copy.serviceUnavailableLogin}
        </p>
      </div>
      <div className="grid gap-2.5 bg-white/70 p-4 sm:grid-cols-2">
        <Link
          href={retryHref}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#111a30] px-4 text-sm font-black text-white transition hover:bg-[#2864ff] focus-visible:ring-4 focus-visible:ring-blue-200"
        >
          {copy.tryAgain}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <Link
          href={`/${locale}/events`}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-800 transition hover:border-blue-300 hover:text-[#1f55e5] focus-visible:ring-4 focus-visible:ring-blue-100"
        >
          {copy.browseEvents}
        </Link>
      </div>
    </div>
  );
}

function VerificationStatePanel({
  panelRef,
  locale,
  email,
  next,
  failed,
  loginHref,
  localEmailFallback,
  copy,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  locale: Locale;
  email: string;
  next: string;
  failed: boolean;
  loginHref: string;
  localEmailFallback: boolean;
  copy: (typeof AUTH_COPY)[Locale];
}) {
  return (
    <div
      ref={panelRef}
      role={failed ? "alert" : "status"}
      tabIndex={-1}
      className={`mt-5 overflow-hidden rounded-2xl border outline-none focus-visible:ring-4 ${
        failed
          ? "border-amber-200 bg-amber-50 text-amber-950 focus-visible:ring-amber-100"
          : "border-emerald-200 bg-emerald-50 text-emerald-950 focus-visible:ring-emerald-100"
      }`}
    >
      <div
        className={`h-1.5 ${
          failed
            ? "bg-gradient-to-r from-amber-500 to-orange-400"
            : "bg-gradient-to-r from-emerald-500 to-cyan-400"
        }`}
      />
      <div className="p-5">
        <span
          className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ring-1 ${
            failed
              ? "bg-amber-100 text-amber-700 ring-amber-200"
              : "bg-emerald-100 text-emerald-700 ring-emerald-200"
          }`}
        >
          <MailCheck size={22} aria-hidden="true" />
        </span>
        <p className="mt-4 text-lg font-black tracking-[-0.025em]">
          {failed
            ? copy.verificationDelayedTitle
            : copy.verificationSentTitle}
        </p>
        <p
          className={`mt-2 break-words text-sm leading-6 ${
            failed ? "text-amber-900" : "text-emerald-900"
          }`}
        >
          {failed
            ? copy.verificationDelayedText
            : copy.verificationSentText}{" "}
          <strong>{email}</strong>
        </p>
        {failed && (
          <p className="mt-2 text-sm font-extrabold text-amber-950">
            {copy.noNeedToRegister}
          </p>
        )}
        <ResendForm
          locale={locale}
          email={email}
          next={next}
          label={
            localEmailFallback
              ? copy.continueVerification
              : copy.resend
          }
          variant="primary"
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Link
            href={loginHref}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-800 transition hover:border-blue-300 hover:text-[#1f55e5]"
          >
            {copy.goToLogin}
          </Link>
          <Link
            href={`/${locale}/events`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-extrabold text-slate-600 transition hover:bg-white/80 hover:text-[#1f55e5]"
          >
            {copy.browseEvents}
          </Link>
        </div>
      </div>
    </div>
  );
}

function LoginForm({
  locale,
  next,
  email,
  errorField,
  hasError,
  copy,
}: {
  locale: Locale;
  next: string;
  email: string;
  errorField?: string;
  hasError: boolean;
  copy: (typeof AUTH_COPY)[Locale];
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form
      action="/api/session"
      method="post"
      className="mt-5 grid gap-3.5"
    >
      <input type="hidden" name="intent" value="login" />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="mode" value="login" />

      <FieldLabel htmlFor="login-email" label={copy.email}>
        <span className="relative block">
          <AtSign
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="login-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="username"
            inputMode="email"
            defaultValue={email}
            placeholder="you@example.com"
            aria-invalid={
              errorField === "email" || errorField === "credentials"
            }
            aria-describedby={hasError ? "auth-error" : undefined}
            className={`${FIELD_BASE} pl-11 pr-3 ${
              errorField === "email" || errorField === "credentials"
                ? "border-rose-400"
                : "border-slate-300"
            }`}
          />
        </span>
      </FieldLabel>

      <FieldLabel htmlFor="login-password" label={copy.password}>
        <span className="relative block">
          <LockKeyhole
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="login-password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            maxLength={128}
            autoComplete="current-password"
            placeholder={copy.passwordPlaceholder}
            aria-invalid={
              errorField === "password" || errorField === "credentials"
            }
            aria-describedby={hasError ? "auth-error" : undefined}
            className={`${FIELD_BASE} pl-11 pr-12 ${
              errorField === "password" || errorField === "credentials"
                ? "border-rose-400"
                : "border-slate-300"
            }`}
          />
          <VisibilityButton
            visible={showPassword}
            setVisible={setShowPassword}
            showLabel={copy.showPassword}
            hideLabel={copy.hidePassword}
          />
        </span>
      </FieldLabel>

      <p className="flex items-start gap-2 rounded-xl bg-blue-50 px-3.5 py-3 text-xs font-semibold leading-5 text-blue-900">
        <ShieldCheck
          size={16}
          className="mt-0.5 shrink-0 text-[#2864ff]"
          aria-hidden="true"
        />
        {copy.sameLogin}
      </p>

      <SubmitButton label={copy.loginButton} />
    </form>
  );
}

function SignupForm({
  locale,
  next,
  email,
  errorField,
  hasError,
  copy,
  localEmailFallback,
}: {
  locale: Locale;
  next: string;
  email: string;
  errorField?: string;
  hasError: boolean;
  copy: (typeof AUTH_COPY)[Locale];
  localEmailFallback: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [password, setPassword] = useState("");
  const strength = getPasswordStrength(password);
  const errorDescription = hasError ? "auth-error" : undefined;

  return (
    <form
      action="/api/session"
      method="post"
      className="mt-5 grid gap-3.5"
    >
      <input type="hidden" name="intent" value="signup" />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="mode" value="signup" />

      <FieldLabel htmlFor="signup-name" label={copy.name}>
        <span className="relative block">
          <UserRound
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="signup-name"
            name="name"
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
            placeholder={copy.namePlaceholder}
            aria-invalid={errorField === "name"}
            aria-describedby={errorDescription}
            className={`${FIELD_BASE} pl-11 pr-3 ${
              errorField === "name"
                ? "border-rose-400"
                : "border-slate-300"
            }`}
          />
        </span>
      </FieldLabel>

      <FieldLabel htmlFor="signup-email" label={copy.email}>
        <span className="relative block">
          <AtSign
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="signup-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            inputMode="email"
            defaultValue={email}
            placeholder="you@example.com"
            aria-invalid={errorField === "email"}
            aria-describedby={errorDescription}
            className={`${FIELD_BASE} pl-11 pr-3 ${
              errorField === "email"
                ? "border-rose-400"
                : "border-slate-300"
            }`}
          />
        </span>
      </FieldLabel>

      <FieldLabel htmlFor="signup-password" label={copy.password}>
        <span className="relative block">
          <LockKeyhole
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="signup-password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            placeholder={copy.createPasswordPlaceholder}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={errorField === "password"}
            aria-describedby={`password-guidance${
              errorDescription ? ` ${errorDescription}` : ""
            }`}
            className={`${FIELD_BASE} pl-11 pr-12 ${
              errorField === "password"
                ? "border-rose-400"
                : "border-slate-300"
            }`}
          />
          <VisibilityButton
            visible={showPassword}
            setVisible={setShowPassword}
            showLabel={copy.showPassword}
            hideLabel={copy.hidePassword}
          />
        </span>
      </FieldLabel>

      <PasswordStrength
        strength={strength}
        copy={copy}
      />

      <FieldLabel
        htmlFor="signup-password-confirmation"
        label={copy.confirmPassword}
      >
        <span className="relative block">
          <LockKeyhole
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="signup-password-confirmation"
            name="confirmPassword"
            type={showConfirmation ? "text" : "password"}
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            placeholder={copy.confirmPasswordPlaceholder}
            aria-invalid={errorField === "confirmPassword"}
            aria-describedby={errorDescription}
            className={`${FIELD_BASE} pl-11 pr-12 ${
              errorField === "confirmPassword"
                ? "border-rose-400"
                : "border-slate-300"
            }`}
          />
          <VisibilityButton
            visible={showConfirmation}
            setVisible={setShowConfirmation}
            showLabel={copy.showPassword}
            hideLabel={copy.hidePassword}
          />
        </span>
      </FieldLabel>

      <div
        className={`flex items-start gap-3 rounded-xl border p-3.5 transition hover:bg-slate-50 ${
          errorField === "terms"
            ? "border-rose-300 bg-rose-50"
            : "border-slate-200 bg-white"
        }`}
      >
        <input
          id="signup-terms"
          name="terms"
          type="checkbox"
          value="accepted"
          required
          aria-invalid={errorField === "terms"}
          aria-describedby={errorDescription}
          aria-labelledby="signup-terms-label"
          className="mt-0.5 h-5 w-5 shrink-0 accent-[#2864ff]"
        />
        <span
          id="signup-terms-label"
          className="text-xs font-semibold leading-5 text-slate-600"
        >
          <label htmlFor="signup-terms" className="cursor-pointer">
            {copy.termsPrefix}
          </label>{" "}
          <Link
            href={`/${locale}/terms`}
            target="_blank"
            className="font-extrabold text-[#1f55e5] underline decoration-blue-200 underline-offset-2 hover:text-blue-800"
          >
            {copy.terms}
          </Link>{" "}
          {copy.and}{" "}
          <Link
            href={`/${locale}/privacy`}
            target="_blank"
            className="font-extrabold text-[#1f55e5] underline decoration-blue-200 underline-offset-2 hover:text-blue-800"
          >
            {copy.privacy}
          </Link>
          .
        </span>
      </div>

      <SubmitButton label={copy.signupButton} />

      <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
        <MailCheck
          size={15}
          className="mt-0.5 shrink-0 text-emerald-600"
          aria-hidden="true"
        />
        {localEmailFallback
          ? copy.localVerificationNote
          : copy.verificationNote}
      </p>
    </form>
  );
}

function PasswordStrength({
  strength,
  copy,
}: {
  strength: number;
  copy: (typeof AUTH_COPY)[Locale];
}) {
  const labels = [
    copy.strengthEmpty,
    copy.strengthWeak,
    copy.strengthFair,
    copy.strengthGood,
    copy.strengthStrong,
  ];

  return (
    <div id="password-guidance" className="-mt-1">
      <div className="flex gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((bar) => (
          <span
            key={bar}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              bar <= strength
                ? strength < 2
                  ? "bg-rose-500"
                  : strength < 4
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <div className="mt-2 flex items-start justify-between gap-4 text-xs leading-4">
        <span className="text-slate-500">{copy.passwordGuidance}</span>
        <span
          aria-live="polite"
          className="shrink-0 font-extrabold text-slate-700"
        >
          {labels[strength]}
        </span>
      </div>
    </div>
  );
}

function getPasswordStrength(password: string): number {
  if (!password) return 0;

  const checks = [
    password.length >= 8,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password) || password.length >= 12,
  ];
  return checks.filter(Boolean).length;
}

function FieldLabel({
  htmlFor,
  label,
  children,
}: {
  htmlFor: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="grid gap-1.5 text-sm font-extrabold text-slate-800"
    >
      <span>{label}</span>
      {children}
    </label>
  );
}

function VisibilityButton({
  visible,
  setVisible,
  showLabel,
  hideLabel,
}: {
  visible: boolean;
  setVisible: (visible: boolean) => void;
  showLabel: string;
  hideLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={() => setVisible(!visible)}
      aria-label={visible ? hideLabel : showLabel}
      aria-pressed={visible}
      className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {visible ? (
        <EyeOff size={18} aria-hidden="true" />
      ) : (
        <Eye size={18} aria-hidden="true" />
      )}
    </button>
  );
}

function ModeLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-10 items-center justify-center rounded-lg px-3 text-sm font-extrabold transition ${
        active
          ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200/80"
          : "text-slate-500 hover:text-slate-900"
      }`}
    >
      {label}
    </Link>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#2864ff] px-4 text-sm font-black text-white shadow-[0_12px_28px_rgba(40,100,255,0.24)] transition hover:bg-[#1f55e5] focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? (
        <LoaderCircle
          size={18}
          className="animate-spin"
          aria-hidden="true"
        />
      ) : (
        <ArrowRight size={18} aria-hidden="true" />
      )}
      {pending ? `${label}…` : label}
    </button>
  );
}

function ResendForm({
  locale,
  email,
  next,
  label,
  variant = "secondary",
}: {
  locale: Locale;
  email: string;
  next: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <form action="/api/session" method="post" className="mt-3">
      <input type="hidden" name="intent" value="resend" />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="mode" value="login" />
      <input type="hidden" name="email" value={email} />
      <ResendButton label={label} variant={variant} />
    </form>
  );
}

function ResendButton({
  label,
  variant,
}: {
  label: string;
  variant: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={
        variant === "primary"
          ? "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2864ff] px-4 text-sm font-black text-white shadow-[0_10px_24px_rgba(40,100,255,0.2)] transition hover:bg-[#1f55e5] focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-wait disabled:opacity-70"
          : "inline-flex min-h-11 items-center gap-2 rounded-xl border border-current/20 bg-white/70 px-4 text-sm font-extrabold text-current transition hover:bg-white focus-visible:ring-4 focus-visible:ring-current/10 disabled:cursor-wait disabled:opacity-70"
      }
    >
      {pending ? (
        <LoaderCircle
          size={17}
          className="animate-spin"
          aria-hidden="true"
        />
      ) : (
        <MailCheck size={17} aria-hidden="true" />
      )}
      {pending ? `${label}…` : label}
    </button>
  );
}

function SignedInPanel({
  account,
  locale,
  next,
}: {
  account: Account;
  locale: Locale;
  next: string;
}) {
  const copy = AUTH_COPY[locale];
  const destination =
    account.role === "admin" ? `/${locale}/admin` : `/${locale}/account/tickets`;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <CheckCircle2 size={21} aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-lg font-black text-emerald-950">
        {copy.alreadySignedIn}
      </h3>
      <p className="mt-1 font-extrabold text-emerald-950">{account.name}</p>
      <p className="mt-0.5 break-words text-sm text-emerald-800">
        {account.email}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={next || destination}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-extrabold text-white transition hover:bg-emerald-800"
        >
          {copy.continueAccount}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <form action="/api/session" method="post">
          <input type="hidden" name="intent" value="logout" />
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            className="h-10 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-extrabold text-emerald-950 transition hover:bg-emerald-100"
          >
            {copy.signOut}
          </button>
        </form>
      </div>
    </div>
  );
}

const ERROR_FIELDS: Record<string, string> = {
  invalid: "credentials",
  email: "email",
  name: "name",
  password: "password",
  "password-match": "confirmPassword",
  terms: "terms",
};

const AUTH_COPY = {
  bg: {
    authChoice: "Избери вход или регистрация",
    loginTab: "Вход",
    signupTab: "Регистрация",
    email: "Имейл адрес",
    password: "Парола",
    name: "Име и фамилия",
    namePlaceholder: "Мария Иванова",
    passwordPlaceholder: "Въведи своята парола",
    createPasswordPlaceholder: "Създай сигурна парола",
    confirmPassword: "Потвърди паролата",
    confirmPasswordPlaceholder: "Въведи паролата отново",
    showPassword: "Покажи паролата",
    hidePassword: "Скрий паролата",
    sameLogin:
      "Това е единственият вход за клиенти и администратори. Достъпът се определя автоматично от профила.",
    loginButton: "Влез в профила си",
    signupButton: "Създай профил",
    problemTitle: "Не успяхме да продължим",
    serviceUnavailableTitle: "Профилите временно са недостъпни",
    serviceUnavailableSignup:
      "Не успяхме да обработим регистрацията. Данните за вход не бяха запазени в браузъра — изчакай малко и опитай отново.",
    serviceUnavailableLogin:
      "Не успяхме да проверим данните за вход. Паролата ти не беше запазена — изчакай малко и опитай отново.",
    tryAgain: "Опитай отново",
    browseEvents: "Разгледай събитията",
    goToLogin: "Към входа",
    verificationSentTitle: "Провери входящата си поща",
    verificationSentText:
      "Изпратихме линк за потвърждение на",
    verificationDelayedTitle: "Профилът е създаден",
    verificationDelayedText:
      "Не успяхме да доставим имейла за потвърждение до",
    noNeedToRegister:
      "Не е нужно да се регистрираш отново. Изпрати нов линк от бутона по-долу.",
    localDeliveryTitle: "Имейл не е изпратен",
    localDeliveryText:
      "Resend не е конфигуриран в този локален проект. Използвай действието по-долу, за да продължиш директно към потвърждението.",
    localUnverified:
      "Профилът още не е потвърден. В локален режим използвай действието по-долу — няма да бъде изпратен реален имейл.",
    resend: "Изпрати имейла отново",
    continueVerification: "Продължи към потвърждение",
    passwordGuidance:
      "Минимум 8 символа с главна, малка буква и цифра.",
    strengthEmpty: "Въведи парола",
    strengthWeak: "Слаба",
    strengthFair: "Средна",
    strengthGood: "Добра",
    strengthStrong: "Силна",
    termsPrefix: "Приемам",
    terms: "условията за ползване",
    and: "и",
    privacy: "политиката за поверителност",
    verificationNote:
      "Ще изпратим защитен линк, с който да потвърдиш имейл адреса си.",
    localVerificationNote:
      "Локален режим: след регистрацията ще продължиш директно към потвърждението. Няма да бъде изпратен реален имейл.",
    alreadySignedIn: "Вече си влязъл в профила си",
    continueAccount: "Продължи",
    signOut: "Изход",
    errors: {
      invalid: "Имейлът или паролата са неправилни.",
      unverified:
        "Профилът още не е потвърден. Отвори линка в имейла си или поискай нов.",
      email: "Въведи валиден имейл адрес.",
      name: "Името трябва да е между 2 и 100 символа.",
      password:
        "Паролата трябва да е поне 8 символа и да отговаря на изискванията за сигурност.",
      "password-match": "Двете пароли не съвпадат.",
      terms:
        "Трябва да приемеш условията и политиката за поверителност.",
      "account-exists":
        "Вече има профил с този имейл. Избери „Вход“, за да продължиш.",
      "rate-limit":
        "Направени са твърде много опити. Изчакай няколко минути и опитай отново.",
      "email-delivery":
        "Не успяхме да изпратим имейла за потвърждение. Опитай отново след малко.",
      "service-unavailable":
        "Профилите временно са недостъпни. Опитай отново след малко.",
      generic: "Възникна неочаквана грешка. Опитай отново.",
    },
  },
  en: {
    authChoice: "Choose sign in or registration",
    loginTab: "Sign in",
    signupTab: "Create account",
    email: "Email address",
    password: "Password",
    name: "Full name",
    namePlaceholder: "Maria Ivanova",
    passwordPlaceholder: "Enter your password",
    createPasswordPlaceholder: "Create a secure password",
    confirmPassword: "Confirm password",
    confirmPasswordPlaceholder: "Enter your password again",
    showPassword: "Show password",
    hidePassword: "Hide password",
    sameLogin:
      "This is the single sign-in for customers and administrators. Access is assigned automatically by your account.",
    loginButton: "Sign in to your account",
    signupButton: "Create account",
    problemTitle: "We could not continue",
    serviceUnavailableTitle: "Account access is temporarily unavailable",
    serviceUnavailableSignup:
      "We could not process this registration. Your sign-in details were not saved in the browser—wait a moment and try again.",
    serviceUnavailableLogin:
      "We could not check your sign-in details. Your password was not saved—wait a moment and try again.",
    tryAgain: "Try again",
    browseEvents: "Browse events",
    goToLogin: "Go to sign in",
    verificationSentTitle: "Check your inbox",
    verificationSentText: "We sent a verification link to",
    verificationDelayedTitle: "Your account was created",
    verificationDelayedText:
      "We could not deliver the verification email to",
    noNeedToRegister:
      "You do not need to register again. Send a fresh link below.",
    localDeliveryTitle: "No email was sent",
    localDeliveryText:
      "Resend is not configured for this local project. Use the action below to continue directly to verification.",
    localUnverified:
      "This account is not verified yet. In local mode, use the action below—no real email will be sent.",
    resend: "Send the email again",
    continueVerification: "Continue to verification",
    passwordGuidance:
      "At least 8 characters with uppercase, lowercase and a number.",
    strengthEmpty: "Enter a password",
    strengthWeak: "Weak",
    strengthFair: "Fair",
    strengthGood: "Good",
    strengthStrong: "Strong",
    termsPrefix: "I accept the",
    terms: "terms of use",
    and: "and",
    privacy: "privacy policy",
    verificationNote:
      "We will send a secure link to verify your email address.",
    localVerificationNote:
      "Local mode: after registration you will continue directly to verification. No real email will be sent.",
    alreadySignedIn: "You are already signed in",
    continueAccount: "Continue",
    signOut: "Sign out",
    errors: {
      invalid: "The email or password is incorrect.",
      unverified:
        "This account is not verified yet. Open the link in your email or request a new one.",
      email: "Enter a valid email address.",
      name: "Your name must be between 2 and 100 characters.",
      password:
        "Your password must be at least 8 characters and meet the security requirements.",
      "password-match": "The passwords do not match.",
      terms: "You must accept the terms and privacy policy.",
      "account-exists":
        "An account with this email already exists. Choose “Sign in” to continue.",
      "rate-limit":
        "Too many attempts were made. Wait a few minutes and try again.",
      "email-delivery":
        "We could not send the verification email. Please try again shortly.",
      "service-unavailable":
        "Account access is temporarily unavailable. Please try again shortly.",
      generic: "Something unexpected happened. Please try again.",
    },
  },
} as const;
