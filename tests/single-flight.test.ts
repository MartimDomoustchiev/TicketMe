import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const moduleUrl = pathToFileURL(
  `${projectRoot}/src/lib/single-flight.ts`,
).href;

test("single-flight coalesces bursts and clears failed work", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      `
        const { singleFlight } = await import(${JSON.stringify(moduleUrl)});
        let calls = 0;
        const values = await Promise.all(
          Array.from({ length: 300 }, () => singleFlight("burst", async () => {
            calls += 1;
            await new Promise((resolve) => setTimeout(resolve, 10));
            return 42;
          })),
        );
        let failures = 0;
        await Promise.allSettled([
          singleFlight("failure", async () => {
            failures += 1;
            throw new Error("expected");
          }),
          singleFlight("failure", async () => {
            failures += 1;
            throw new Error("unexpected second call");
          }),
        ]);
        await singleFlight("failure", async () => {
          failures += 1;
          return "recovered";
        });
        console.log(JSON.stringify({ calls, failures, values }));
      `,
    ],
    { cwd: projectRoot },
  );

  const result = JSON.parse(stdout) as {
    calls: number;
    failures: number;
    values: number[];
  };
  assert.equal(result.calls, 1);
  assert.equal(result.failures, 2);
  assert.equal(result.values.length, 300);
  assert.ok(result.values.every((value) => value === 42));
});
