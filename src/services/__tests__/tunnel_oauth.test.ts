/**
 * Tests for tunnel-specific OAuth functions.
 *
 * Covers:
 * - isRedirectUriAllowedForTunnel allow/deny matrix
 */

import { describe, it, expect } from "vitest";
import { isRedirectUriAllowedForTunnel } from "../mcp_oauth.js";

describe("isRedirectUriAllowedForTunnel", () => {
  describe("allowed redirect URIs", () => {
    it("allows cursor:// scheme", () => {
      expect(isRedirectUriAllowedForTunnel("cursor://callback")).toBe(true);
      expect(isRedirectUriAllowedForTunnel("cursor://anysphere.cursor-deeplink/mcp/install")).toBe(true);
    });

    it("allows vscode:// scheme", () => {
      expect(isRedirectUriAllowedForTunnel("vscode://callback")).toBe(true);
    });

    it("allows app:// scheme", () => {
      expect(isRedirectUriAllowedForTunnel("app://callback")).toBe(true);
    });

    it("allows http://localhost", () => {
      expect(isRedirectUriAllowedForTunnel("http://localhost/callback")).toBe(true);
      expect(isRedirectUriAllowedForTunnel("http://localhost:5195/oauth")).toBe(true);
      expect(isRedirectUriAllowedForTunnel("http://localhost:8080/mcp/oauth/callback")).toBe(true);
    });

    it("allows http://127.0.0.1", () => {
      expect(isRedirectUriAllowedForTunnel("http://127.0.0.1/callback")).toBe(true);
      expect(isRedirectUriAllowedForTunnel("http://127.0.0.1:8080/callback")).toBe(true);
    });

    it("allows https://localhost", () => {
      expect(isRedirectUriAllowedForTunnel("https://localhost/callback")).toBe(true);
      expect(isRedirectUriAllowedForTunnel("https://localhost:8443/callback")).toBe(true);
    });

    it("allows IPv6 loopback", () => {
      expect(isRedirectUriAllowedForTunnel("http://[::1]/callback")).toBe(true);
      expect(isRedirectUriAllowedForTunnel("http://[::1]:8080/callback")).toBe(true);
    });
  });

  describe("denied redirect URIs", () => {
    it("rejects https://evil.com", () => {
      expect(isRedirectUriAllowedForTunnel("https://evil.com/steal-code")).toBe(false);
    });

    it("rejects http://evil.com", () => {
      expect(isRedirectUriAllowedForTunnel("http://evil.com/steal-code")).toBe(false);
    });

    it("rejects https://ngrok-free.dev (tunnel URL as redirect)", () => {
      expect(isRedirectUriAllowedForTunnel("https://abc123.ngrok-free.dev/callback")).toBe(false);
    });

    it("rejects https://trycloudflare.com", () => {
      expect(isRedirectUriAllowedForTunnel("https://random.trycloudflare.com/callback")).toBe(false);
    });

    it("rejects ftp:// scheme", () => {
      expect(isRedirectUriAllowedForTunnel("ftp://localhost/callback")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns false for empty string", () => {
      expect(isRedirectUriAllowedForTunnel("")).toBe(false);
    });

    it("returns false for null/undefined cast", () => {
      expect(isRedirectUriAllowedForTunnel(null as unknown as string)).toBe(false);
      expect(isRedirectUriAllowedForTunnel(undefined as unknown as string)).toBe(false);
    });

    it("returns false for invalid URL", () => {
      expect(isRedirectUriAllowedForTunnel("not-a-url")).toBe(false);
    });

    it("returns false for javascript: scheme", () => {
      expect(isRedirectUriAllowedForTunnel("javascript:alert(1)")).toBe(false);
    });
  });
});
