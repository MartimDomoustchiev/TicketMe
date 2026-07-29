import { loadEnvConfig } from "@next/env";
import { promoteUser } from "../src/lib/auth-store";
import { isValidEmail, normalizeEmail } from "../src/lib/auth-validation";

loadEnvConfig(process.cwd());

async function main() {
  const email = normalizeEmail(process.argv[2] ?? "");
  if (!isValidEmail(email)) {
    console.error(
      "Usage: npm run user:promote -- verified-user@example.com",
    );
    process.exitCode = 1;
    return;
  }

  const result = await promoteUser(email);
  if (result === "not-found") {
    console.error(`No account exists for ${email}.`);
    process.exitCode = 1;
    return;
  }
  if (result === "unverified") {
    console.error(
      `${email} must verify their email before becoming an admin.`,
    );
    process.exitCode = 1;
    return;
  }
  if (result === "already-admin") {
    console.log(`${email} is already an admin.`);
    return;
  }

  console.log(`${email} is now an admin.`);
}

main().catch((error) => {
  console.error("Could not promote the user.", error);
  process.exitCode = 1;
});
