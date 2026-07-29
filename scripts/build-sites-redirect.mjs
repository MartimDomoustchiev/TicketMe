import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(projectRoot, ".open-next");
const workerPath = join(outputDirectory, "worker.js");
const wranglerCli = join(
  projectRoot,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);

const workerSource = `
const canonicalOrigin = "https://www.ticketme.store";

export default {
  fetch(request) {
    const source = new URL(request.url);
    const target = new URL(source.pathname + source.search, canonicalOrigin);

    return new Response(null, {
      status: 308,
      headers: {
        "Cache-Control": "public, max-age=300",
        "Location": target.href,
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }
};
`.trimStart();

rmSync(outputDirectory, { force: true, recursive: true });
mkdirSync(join(outputDirectory, "assets"), { recursive: true });
writeFileSync(workerPath, workerSource);

const validationDirectory = mkdtempSync(
  join(tmpdir(), "ticketme-sites-redirect-"),
);

try {
  const result = spawnSync(
    process.execPath,
    [
      wranglerCli,
      "deploy",
      workerPath,
      "--config",
      join(projectRoot, "wrangler.jsonc"),
      "--dry-run",
      "--no-bundle",
      "--outdir",
      validationDirectory,
    ],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  console.log(
    `Sites canonical redirect is ready at .open-next/worker.js (${statSync(workerPath).size} bytes)`,
  );
} finally {
  rmSync(validationDirectory, { force: true, recursive: true });
}
