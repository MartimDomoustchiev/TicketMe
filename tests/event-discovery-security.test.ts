import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPublicDiscoveryHost,
  createPinnedDiscoveryLookup,
  fetchDiscoveryFeed,
} from "../src/lib/event-discovery-security";

test("public discovery DNS returns the exact validated address set", async () => {
  const addresses = await assertPublicDiscoveryHost(
    new URL("https://feeds.tickets.example.org/events.json"),
    async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ],
  );

  assert.deepEqual(addresses, [
    { address: "93.184.216.34", family: 4 },
    { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
  ]);
});

test("pinned discovery lookup never performs or trusts a second DNS answer", async () => {
  const lookup = createPinnedDiscoveryLookup([
    { address: "93.184.216.34", family: 4 },
  ]);

  const result = await new Promise<{
    address: string | { address: string; family: number }[];
    family?: number;
  }>((resolve, reject) => {
    lookup(
      "rebound-to-private.example.org",
      { all: false, family: 0 },
      (error, address, family) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({
          address: address as
            | string
            | { address: string; family: number }[],
          family,
        });
      },
    );
  });

  assert.deepEqual(result, {
    address: "93.184.216.34",
    family: 4,
  });
});

test("production discovery fetch receives only the prevalidated DNS addresses", async () => {
  const feedUrl = new URL("https://feeds.tickets.example.org/events.json");
  const seen: {
    addresses?: readonly { address: string; family: number }[];
    hostname?: string;
  } = {};

  const fetched = await fetchDiscoveryFeed(feedUrl, {
    allowedFeedUrls: [feedUrl],
    dnsLookup: async () => [
      { address: "93.184.216.34", family: 4 },
    ],
    pinnedFetchImpl: async (input, addresses) => {
      seen.hostname = input.hostname;
      seen.addresses = addresses;
      return new Response('{"events":[]}', {
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(seen.hostname, "feeds.tickets.example.org");
  assert.deepEqual(seen.addresses, [
    { address: "93.184.216.34", family: 4 },
  ]);
  assert.equal(fetched.body, '{"events":[]}');
});
