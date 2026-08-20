/**
 * Regression gate — SSRF via caller-supplied outbound fetch URLs.
 *
 * Neotoma accepts URLs from remote callers on several paths (subscription
 * webhooks, submission mirrors, peer registration/health, peer conflict
 * resolution) and then fetches them server-side. Without a guard, an
 * authenticated caller can aim the server at loopback, RFC1918, link-local
 * (169.254.169.254 cloud metadata), or platform-internal hosts it cannot
 * reach itself.
 *
 * A guard existed (`isPrivateOrLoopbackHostname`) but was wired into only two
 * of the sinks. These tests lock the URL-level helper that now backs all of
 * them, so a future sink that forgets the check is caught by the class rather
 * than rediscovered per instance.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isPrivateOrLoopbackHostname,
  isPublicFetchUrlAllowed,
} from "../../src/services/net/private_host_guard.js";
import { isWebhookUrlAllowed } from "../../src/services/subscriptions/webhook_delivery.js";

const HOSTED = "NEOTOMA_HOSTED_MODE";

describe("isPrivateOrLoopbackHostname", () => {
  it("rejects loopback, RFC1918, and link-local hosts", () => {
    for (const h of [
      "localhost",
      "app.localhost",
      "127.0.0.1",
      "10.1.2.3",
      "172.16.5.4",
      "192.168.0.9",
      "169.254.169.254", // cloud metadata
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
    ]) {
      expect(isPrivateOrLoopbackHostname(h), h).toBe(true);
    }
  });

  it("rejects platform-internal service-discovery suffixes", () => {
    for (const h of ["neotoma.internal", "internal", "svc.cluster.local"]) {
      expect(isPrivateOrLoopbackHostname(h), h).toBe(true);
    }
  });

  it("rejects IPv4-mapped and IPv4-compatible IPv6 loopback/private forms", () => {
    // Regression: the first version of this guard tested an IPv4 regex against
    // the raw hostname, so `::ffff:127.0.0.1` matched none of its branches and
    // was treated as public. Caught by adversarial QA review on PR #2163.
    for (const h of [
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "::ffff:169.254.169.254",
      "::ffff:192.168.1.1",
      "::127.0.0.1",
    ]) {
      expect(isPrivateOrLoopbackHostname(h), h).toBe(true);
    }
  });

  it("still treats IPv4-mapped PUBLIC addresses as public", () => {
    // The unwrapping must not over-reject: a mapped public address stays public.
    expect(isPrivateOrLoopbackHostname("::ffff:8.8.8.8")).toBe(false);
  });

  it("allows ordinary public hosts", () => {
    for (const h of ["example.com", "hooks.slack.com", "8.8.8.8", "neotoma.io"]) {
      expect(isPrivateOrLoopbackHostname(h), h).toBe(false);
    }
  });
});

describe("isPublicFetchUrlAllowed (hosted mode)", () => {
  beforeEach(() => {
    process.env[HOSTED] = "1";
  });
  afterEach(() => {
    delete process.env[HOSTED];
  });

  it("rejects the internal targets an SSRF would aim at", () => {
    for (const u of [
      "https://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1:8080/admin",
      "https://10.0.0.5/internal",
      "https://neotoma.internal/health",
      "https://[::1]:3000/",
    ]) {
      expect(isPublicFetchUrlAllowed(u), u).toBe(false);
    }
  });

  it("rejects non-http(s) schemes", () => {
    for (const u of ["file:///etc/passwd", "gopher://x/", "ftp://example.com/"]) {
      expect(isPublicFetchUrlAllowed(u), u).toBe(false);
    }
  });

  it("rejects unparseable input rather than passing it through", () => {
    for (const u of ["", "not a url", "http://"]) {
      expect(isPublicFetchUrlAllowed(u), u).toBe(false);
    }
  });

  it("allows public https targets", () => {
    expect(isPublicFetchUrlAllowed("https://hooks.example.com/x")).toBe(true);
  });

  it("rejects IPv4-mapped IPv6 after WHATWG URL hostname normalization", () => {
    // Regression: Node's WHATWG URL parser rewrites `[::ffff:127.0.0.1]` to
    // hostname `[::ffff:7f00:1]`. The dotted-quad unwrap in
    // `isPrivateOrLoopbackHostname` never sees that form, so the reachable
    // sink path (`isPublicFetchUrlAllowed`) incorrectly allowed cloud-metadata
    // / loopback / RFC1918 via IPv4-mapped literals. Assert the URL forms an
    // attacker can supply — not bare dotted hostnames.
    for (const u of [
      "https://[::ffff:127.0.0.1]/latest/meta-data/",
      "http://[::ffff:7f00:1]/",
      "http://[::ffff:a00:1]/",
      "http://[::ffff:a9fe:a9fe]/latest/meta-data/",
    ]) {
      expect(isPublicFetchUrlAllowed(u), u).toBe(false);
    }
  });
});

describe("isPublicFetchUrlAllowed (self-hosted)", () => {
  beforeEach(() => {
    delete process.env[HOSTED];
  });

  it("permits loopback when not in hosted mode", () => {
    // A single-user self-host legitimately points webhooks at its own machine.
    expect(isPublicFetchUrlAllowed("http://127.0.0.1:9000/hook")).toBe(true);
  });
});

describe("isWebhookUrlAllowed routes through the shared guard", () => {
  beforeEach(() => {
    process.env[HOSTED] = "1";
  });
  afterEach(() => {
    delete process.env[HOSTED];
  });

  it("rejects an https URL pointing at cloud metadata", () => {
    // Pre-fix this returned true for ANY https URL.
    expect(isWebhookUrlAllowed("https://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  it("still allows a public https webhook", () => {
    expect(isWebhookUrlAllowed("https://hooks.example.com/neotoma")).toBe(true);
  });
});
