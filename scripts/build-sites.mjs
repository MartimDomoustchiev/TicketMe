import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const openNextCli = join(
  projectRoot,
  "node_modules",
  "@opennextjs",
  "cloudflare",
  "dist",
  "cli",
  "index.js",
);
const wranglerCli = join(
  projectRoot,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);
const workerPath = join(projectRoot, ".open-next", "worker.js");

function runCli(cliPath, args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runCli(openNextCli, ["build"]);

const bundleDirectory = mkdtempSync(
  join(tmpdir(), "ticketforge-sites-worker-"),
);

try {
  runCli(wranglerCli, [
    "deploy",
    "--dry-run",
    "--outdir",
    bundleDirectory,
  ]);

  const bundledWorkerPath = join(bundleDirectory, "worker.js");

  if (!existsSync(bundledWorkerPath)) {
    throw new Error("Wrangler did not produce the Sites worker bundle.");
  }

  copyFileSync(bundledWorkerPath, workerPath);
  console.log("Sites worker bundle is ready at .open-next/worker.js");
} finally {
  rmSync(bundleDirectory, { force: true, recursive: true });
}
