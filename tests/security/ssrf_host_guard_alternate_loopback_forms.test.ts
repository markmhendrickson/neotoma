/**
 * Regression gate: alternate spellings of loopback and platform-internal hosts
 * under hosted mode.
 *
 * `isPrivateOrLoopbackHostname` compared the hostname as given, so a fully
 * qualified name with a trailing dot (`localhost.`, `x.internal.`) and the
 * unspecified IPv6 address (`::`, which connects to the local host) were
 * treated as public. Every guarded outbound fetch, including each redirect hop
 * of `guardedFetch`, goes through this check.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isPrivateOrLoopbackHostname,
  isPublicFetchUrlAllowed,
} from "../../src/services/net/private_host_guard.js";

vi.mock("../../src/services/sync/peer_ops.js", () => ({
  findActivePeerForUrl: vi.fn(async () => null),
  listPeersWithSecrets: vi.fn(async () => []),
}));

const storeMock = vi.hoisted(() =>
  vi.fn(async () => ({ entities: [{ entity_id: "ent_remote" }] }))
);
vi.mock("../../src/actions.js", () => ({ storeStructuredForApi: storeMock }));

const HOSTED = "NEOTOMA_HOSTED_MODE";

const ALTERNATE_FORMS = [
  "::",
  "[::]",
  "0::",
  "::0",
  "0:0:0:0:0:0:0:0",
  "localhost.",
  "LOCALHOST.",
  "a.localhost.",
  "localhost..",
  "x.internal.",
  "internal.",
  "x.svc.cluster.local.",
  "127.0.0.1.",
  "10.0.0.1.",
];

describe("isPrivateOrLoopbackHostname: alternate loopback and internal forms", () => {
  it("treats the unspecified IPv6 address and trailing-dot names as private", () => {
    for (const h of ALTERNATE_FORMS) {
      expect(isPrivateOrLoopbackHostname(h), h).toBe(true);
    }
  });

  it("still treats public names, with or without a trailing dot, as public", () => {
    for (const h of ["example.com", "example.com.", "registered.example.", "2001:db8::1"]) {
      expect(isPrivateOrLoopbackHostname(h), h).toBe(false);
    }
  });
});

describe("isPublicFetchUrlAllowed (hosted mode): alternate loopback and internal forms", () => {
  beforeEach(() => {
    process.env[HOSTED] = "1";
  });
  afterEach(() => {
    delete process.env[HOSTED];
  });

  it("refuses them as URLs, after WHATWG URL normalization", () => {
    for (const url of [
      "http://[::]/",
      "http://[0::]/",
      "http://[0:0:0:0:0:0:0:0]:8080/x",
      "http://localhost./",
      "http://a.localhost./",
      "http://x.internal./",
      "http://x.svc.cluster.local./",
      "http://127.0.0.1./",
    ]) {
      expect(isPublicFetchUrlAllowed(url), url).toBe(false);
    }
  });

  it("still allows a public URL with a trailing-dot host", () => {
    expect(isPublicFetchUrlAllowed("https://example.com./entities/x")).toBe(true);
  });
});

describe("prefer_remote (hosted mode) never reaches a listener on the unspecified address", () => {
  let server: Server;
  let port = 0;
  let hits = 0;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      hits++;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ entity_type: "note", snapshot: { title: "from loopback" } }));
    });
    await new Promise<void>((resolve) => server.listen(0, "::", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    process.env[HOSTED] = "1";
    hits = 0;
    storeMock.mockClear();
  });
  afterEach(() => {
    delete process.env[HOSTED];
  });

  for (const host of ["[::]", "localhost."]) {
    it(`refuses sender_peer_url http://${host}:<port> without fetching`, async () => {
      const { resolveSyncConflict } = await import("../../src/services/sync/conflict_resolver.js");
      const result = await resolveSyncConflict({
        userId: "user-1",
        entity_id: `ent_unspecified_${host.length}`,
        strategy: "prefer_remote",
        sender_peer_url: `http://${host}:${port}`,
      });
      expect(result.ok).toBe(false);
      expect(hits).toBe(0);
      expect(storeMock).not.toHaveBeenCalled();
    });
  }
});
