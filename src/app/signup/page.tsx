import { redirect } from "next/navigation";
import { getLocale, localizeHref } from "@/lib/i18n";
import { safeReturnPath } from "@/lib/site";

type SignupSearchParams = {
  email?: string | string[];
  next?: string | string[];
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<SignupSearchParams>;
}) {
  const [locale, query] = await Promise.all([getLocale(), searchParams]);
  const next = localizeHref(
    locale,
    safeReturnPath(
      first(query.next),
      localizeHref(locale, "/events"),
    ),
  );
  const params = new URLSearchParams({
    mode: "signup",
    next,
  });
  const email = first(query.email)?.trim();
  if (email) params.set("email", email.slice(0, 254));

  redirect(`${localizeHref(locale, "/login")}?${params.toString()}`);
}
