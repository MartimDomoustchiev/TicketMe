import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));

async function runWithReactServerCondition(source: string): Promise<void> {
  await execFileAsync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      source,
    ],
    { cwd: projectRoot },
  );
}

test("missing ticket objects are uploaded again even when database metadata exists", async () => {
  const moduleUrl = pathToFileURL(
    `${projectRoot}/src/lib/stripe-fulfillment.ts`,
  ).href;

  await runWithReactServerCondition(`
    import assert from "node:assert/strict";
    const { shouldStoreTicketPdf } = await import(${JSON.stringify(moduleUrl)});

    assert.equal(shouldStoreTicketPdf({
      storedPdfFound: true,
      storageKey: "tickets/TKT-1.pdf",
      storageUrl: "/api/tickets/TKT-1/download",
    }), false);
    assert.equal(shouldStoreTicketPdf({
      storedPdfFound: false,
      storageKey: "tickets/TKT-1.pdf",
      storageUrl: "/api/tickets/TKT-1/download",
    }), true);
    assert.equal(shouldStoreTicketPdf({
      storedPdfFound: true,
      storageKey: "",
      storageUrl: "/api/tickets/TKT-1/download",
    }), true);
  `);
});

test("multi-ticket delivery is bounded, concurrent, and preserves ticket order", async () => {
  const moduleUrl = pathToFileURL(
    `${projectRoot}/src/lib/stripe-fulfillment.ts`,
  ).href;

  await runWithReactServerCondition(`
    import assert from "node:assert/strict";
    const { runTicketDeliveryBatch } = await import(${JSON.stringify(moduleUrl)});
    let active = 0;
    let maximumActive = 0;
    const values = await runTicketDeliveryBatch(
      [0, 1, 2, 3, 4, 5, 6],
      async (value) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return value * 2;
      },
    );

    assert.deepEqual(values, [0, 2, 4, 6, 8, 10, 12]);
    assert.equal(maximumActive, 3);
  `);
});

test("recovery scans beyond poison records while keeping the attempted batch bounded", async () => {
  const moduleUrl = pathToFileURL(
    `${projectRoot}/src/lib/ticket-delivery-recovery.ts`,
  ).href;

  await runWithReactServerCondition(`
    import assert from "node:assert/strict";
    const {
      normalizeTicketDeliveryBatchSize,
      recoverTicketDeliveries,
    } = await import(${JSON.stringify(moduleUrl)});

    assert.equal(normalizeTicketDeliveryBatchSize(undefined), 5);
    assert.equal(normalizeTicketDeliveryBatchSize(Number.NaN), 5);
    assert.equal(normalizeTicketDeliveryBatchSize(999), 5);
    assert.equal(normalizeTicketDeliveryBatchSize(0), 1);

    const candidates = [
      { id: "poison-oldest", deliveryAttempts: 12 },
      { id: "poison-second", deliveryAttempts: 8 },
      { id: "fresh-delivery", deliveryAttempts: 0 },
      { id: "fresh-processing", deliveryAttempts: 1 },
    ];
    const attempted = [];
    const result = await recoverTicketDeliveries(
      {
        baseUrl: "https://tickets.example",
        limit: 2,
        reconcileStripe: false,
      },
      {
        reconcileStaleStripeCheckouts: async () => {
          throw new Error("reconciliation should be disabled");
        },
        listTicketDeliveriesForRetry: async (limit) => {
          assert.equal(limit, 8);
          return candidates;
        },
        deliverCheckoutTicket: async (reservationId) => {
          attempted.push(reservationId);
          return {
            ticket: {},
            delivered: reservationId === "fresh-delivery",
            inProgress: reservationId === "fresh-processing",
          };
        },
      },
    );

    assert.deepEqual(attempted.sort(), ["fresh-delivery", "fresh-processing"]);
    assert.deepEqual(result, {
      stripeReconciled: 0,
      scanned: 4,
      candidates: 2,
      deferred: 2,
      delivered: 1,
      inProgress: 1,
      failed: 0,
    });
  `);
});

test("one failed recovery candidate does not stop the rest of the batch", async () => {
  const moduleUrl = pathToFileURL(
    `${projectRoot}/src/lib/ticket-delivery-recovery.ts`,
  ).href;

  await runWithReactServerCondition(`
    import assert from "node:assert/strict";
    const { recoverTicketDeliveries } = await import(${JSON.stringify(moduleUrl)});
    const attempted = [];
    console.error = () => undefined;

    const result = await recoverTicketDeliveries(
      {
        baseUrl: "https://tickets.example",
        limit: 3,
        reconcileStripe: false,
      },
      {
        reconcileStaleStripeCheckouts: async () => 0,
        listTicketDeliveriesForRetry: async (limit) => {
          assert.equal(limit, 12);
          return [
            { id: "fails", deliveryAttempts: 0 },
            { id: "delivers", deliveryAttempts: 0 },
            { id: "processing", deliveryAttempts: 0 },
          ];
        },
        deliverCheckoutTicket: async (reservationId) => {
          attempted.push(reservationId);
          if (reservationId === "fails") {
            throw new Error("permanent provider rejection");
          }
          return {
            ticket: {},
            delivered: reservationId === "delivers",
            inProgress: reservationId === "processing",
          };
        },
      },
    );

    assert.deepEqual(attempted.sort(), ["delivers", "fails", "processing"]);
    assert.deepEqual(result, {
      stripeReconciled: 0,
      scanned: 3,
      candidates: 3,
      deferred: 0,
      delivered: 1,
      inProgress: 1,
      failed: 1,
    });
  `);
});
