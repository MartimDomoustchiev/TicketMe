import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  CURRENT_TERMS_VERSION,
  legalLastUpdatedDate,
} from "../src/lib/legal";

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

test("legal update labels stay aligned with the accepted terms version", () => {
  assert.equal(CURRENT_TERMS_VERSION, "2026-08-16");
  assert.equal(legalLastUpdatedDate("bg"), "16 август 2026 г.");
  assert.equal(legalLastUpdatedDate("en"), "16 August 2026");
});

test("terms distinguish admission tickets from Stripe test records", async () => {
  const terms = await source("src/app/terms/page.tsx");

  assert.match(terms, /explicitly identified as an admission ticket/);
  assert.match(terms, /Stripe test mode does not charge real funds/);
  assert.match(terms, /Admission rights are determined separately/);
  assert.match(terms, /not valid for admission/);
  assert.match(terms, /external source or seller/);
});

test("privacy copy states the implemented cookie and token lifetimes", async () => {
  const privacy = await source("src/app/privacy/page.tsx");

  assert.match(privacy, /no more than 14 days/);
  assert.match(privacy, /verification links after 30 minutes/);
  assert.match(privacy, /selected-language cookie lasts for up to one year/);
  assert.match(privacy, /not used for advertising tracking/);
});

test("terms consent migration keeps historical users unknown", async () => {
  const migration = await source(
    "database/migrations/008_terms_consent.sql",
  );

  assert.match(migration, /Existing accounts remain NULL/);
  assert.match(migration, /terms_accepted_version TEXT/);
  assert.match(migration, /terms_accepted_at TIMESTAMPTZ/);
  assert.doesNotMatch(migration, /UPDATE\s+users/i);
});
