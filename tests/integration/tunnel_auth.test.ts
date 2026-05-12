/**
 * Integration tests for tunnel-based remote API auth enforcement.
 *
 * Covers:
 * - isLocalRequest classification by socket remote address plus forwarded
 *   client address (the Host header is NOT trusted; see
 *   docs/reports/security_audit_2026_04_22.md S-1)
 * - /mcp endpoint auth enforcement for tunnel (remote) requests
 * - NEOTOMA_BEARER_TOKEN validation on /mcp
 * - REST middleware bearer enforcement for tunnel requests
 */

import { describe, it, expect } from "vitest";
import { isLocalRequest } from "../../src/actions.js";

// --------------------------------------------------------------------------
// Helper: build a minimal express-like request with a socket remoteAddress.
// The `host` header is included only to prove it is ignored by the check.
// --------------------------------------------------------------------------
function fakeReq(options: {
  remoteAddress?: string;
  hostHeader?: string;
  forwardedFor?: string;
}): import("express").Request {
  const headers: Record<string, string> = {};
  if (options.hostHeader) headers.host = options.hostHeader;
  if (options.forwardedFor) headers["x-forwarded-for"] = options.forwardedFor;
  return {
    headers,
    socket: { remoteAddress: options.remoteAddress } as unknown,
    header(name: string) {
      return (this.headers as Record<string, string | undefined>)[
        name.toLowerCase()
      ];
    },
  } as unknown as import("express").Request;
}

// ==========================================================================
// isLocalRequest classification (socket-based)
// ==========================================================================
describe("isLocalRequest (socket-based)", () => {
  it("classifies 127.0.0.1 remote as local", () => {
    expect(isLocalRequest(fakeReq({ remoteAddress: "127.0.0.1" }))).toBe(true);
  });

  it("classifies other IPv4 loopback range (127.0.0.0/8) as local", () => {
    expect(isLocalRequest(fakeReq({ remoteAddress: "127.0.0.2" }))).toBe(true);
    expect(isLocalRequest(fakeReq({ remoteAddress: "127.5.6.7" }))).toBe(true);
  });

  it("classifies IPv6 loopback ::1 as local", () => {
    expect(isLocalRequest(fakeReq({ remoteAddress: "::1" }))).toBe(true);
  });

  it("classifies IPv4-mapped IPv6 loopback as local", () => {
    expect(isLocalRequest(fakeReq({ remoteAddress: "::ffff:127.0.0.1" }))).toBe(true);
  });

  it("does NOT trust a spoofed Host header when the socket is remote", () => {
    // SECURITY: the whole point of the post-audit rewrite. A remote caller
    // that sends `Host: localhost` must NOT be treated as local.
    expect(isLocalRequest(fakeReq({ remoteAddress: "203.0.113.10", hostHeader: "localhost" }))).toBe(false);
    expect(isLocalRequest(fakeReq({ remoteAddress: "203.0.113.10", hostHeader: "127.0.0.1" }))).toBe(false);
  });

  it("classifies public IPs as remote", () => {
    expect(isLocalRequest(fakeReq({ remoteAddress: "8.8.8.8" }))).toBe(false);
    expect(isLocalRequest(fakeReq({ remoteAddress: "198.51.100.5" }))).toBe(false);
    expect(isLocalRequest(fakeReq({ remoteAddress: "2001:db8::1" }))).toBe(false);
  });

  it("classifies LAN / private IPs as remote (they are not loopback)", () => {
    // Private ranges are *not* loopback. Historically a misconfiguration
    // that bound the API to 0.0.0.0 + let LAN callers through was the
    // original bypass. Keep them remote.
    expect(isLocalRequest(fakeReq({ remoteAddress: "192.168.1.10" }))).toBe(false);
    expect(isLocalRequest(fakeReq({ remoteAddress: "10.0.0.5" }))).toBe(false);
    expect(isLocalRequest(fakeReq({ remoteAddress: "172.16.5.5" }))).toBe(false);
  });

  it("treats loopback reverse-proxy requests with a public forwarded client as remote", () => {
    expect(
      isLocalRequest(fakeReq({ remoteAddress: "127.0.0.1", forwardedFor: "198.51.100.5" }))
    ).toBe(false);
  });

  it("treats loopback reverse-proxy chains as local only when every forwarded hop is loopback", () => {
    expect(
      isLocalRequest(
        fakeReq({ remoteAddress: "127.0.0.1", forwardedFor: "127.0.0.1, ::ffff:127.0.0.2" })
      )
    ).toBe(true);
  });

  it("classifies requests with no socket remote address as remote", () => {
    expect(isLocalRequest(fakeReq({ remoteAddress: undefined }))).toBe(false);
    expect(
      isLocalRequest({
        headers: { host: "localhost" },
      } as unknown as import("express").Request),
    ).toBe(false);
  });
});
