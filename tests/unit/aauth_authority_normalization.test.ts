/**
 * Unit tests for `canonicalAauthAuthority()` — exercises the host-only
 * normalisation contract added in v0.7.2.
 *
 * Why this exists: the v0.7.1 sandbox deploy set
 * `NEOTOMA_AAUTH_AUTHORITY = "https://sandbox.neotoma.io"`, but the
 * RFC 9421 `@authority` derived component is bare host (no scheme), so
 * the live verifier saw a different signature base than every signed
 * client computed and `signature_invalid` came back for every signed
 * request. Operators paste either form interchangeably; the function
 * must accept both and produce a host-only string.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { canonicalAauthAuthority } from "../../src/actions.js";

const ORIGINAL_ENV = process.env.NEOTOMA_AAUTH_AUTHORITY;

describe("canonicalAauthAuthority", () => {
  beforeEach(() => {
    delete process.env.NEOTOMA_AAUTH_AUTHORITY;
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.NEOTOMA_AAUTH_AUTHORITY;
    } else {
      process.env.NEOTOMA_AAUTH_AUTHORITY = ORIGINAL_ENV;
    }
  });

  it("strips the scheme when the env var is a https URL", () => {
    process.env.NEOTOMA_AAUTH_AUTHORITY = "https://sandbox.neotoma.io";
    expect(canonicalAauthAuthority()).toBe("sandbox.neotoma.io");
  });

  it("strips the scheme and path when the env var is a full URL", () => {
    process.env.NEOTOMA_AAUTH_AUTHORITY = "https://api.example.com/mcp";
    expect(canonicalAauthAuthority()).toBe("api.example.com");
  });

  it("preserves an explicit port", () => {
    process.env.NEOTOMA_AAUTH_AUTHORITY = "https://localhost:3080";
    expect(canonicalAauthAuthority()).toBe("localhost:3080");
  });

  it("returns the bare host unchanged when no scheme is present", () => {
    process.env.NEOTOMA_AAUTH_AUTHORITY = "neotoma.io";
    expect(canonicalAauthAuthority()).toBe("neotoma.io");
  });

  it("returns the bare host with port unchanged", () => {
    process.env.NEOTOMA_AAUTH_AUTHORITY = "localhost:3080";
    expect(canonicalAauthAuthority()).toBe("localhost:3080");
  });

  it("falls back to the trimmed env value when URL parsing throws", () => {
    process.env.NEOTOMA_AAUTH_AUTHORITY = "  ::not-a-url::  ";
    expect(canonicalAauthAuthority()).toBe("::not-a-url::");
  });
});
