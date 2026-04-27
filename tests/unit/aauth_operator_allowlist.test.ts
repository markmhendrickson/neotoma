/**
 * Unit tests for `src/services/aauth_operator_allowlist.ts`.
 *
 * Exercises the env-var-driven allowlist: parsing, trimming, empty
 * handling, and the iss vs iss:sub match precedence used by the AAuth
 * middleware to promote signatures to `operator_attested`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isOperatorAttested,
  resetOperatorAllowlistCacheForTests,
} from "../../src/services/aauth_operator_allowlist.js";

const ENV_KEYS = [
  "NEOTOMA_OPERATOR_ATTESTED_ISSUERS",
  "NEOTOMA_OPERATOR_ATTESTED_SUBS",
] as const;

function withEnv(
  values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
): void {
  for (const key of ENV_KEYS) {
    if (key in values) {
      const v = values[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  }
  resetOperatorAllowlistCacheForTests();
}

describe("isOperatorAttested", () => {
  const original: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) original[key] = process.env[key];
    resetOperatorAllowlistCacheForTests();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const v = original[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
    resetOperatorAllowlistCacheForTests();
  });

  it("returns no-match when iss is missing", () => {
    withEnv({
      NEOTOMA_OPERATOR_ATTESTED_ISSUERS: "https://issuer",
      NEOTOMA_OPERATOR_ATTESTED_SUBS: "",
    });
    expect(isOperatorAttested({})).toEqual({ matched: false, source: null });
    expect(isOperatorAttested({ iss: "" })).toEqual({
      matched: false,
      source: null,
    });
    expect(isOperatorAttested({ iss: "   " })).toEqual({
      matched: false,
      source: null,
    });
  });

  it("returns no-match when no allowlists are configured", () => {
    withEnv({
      NEOTOMA_OPERATOR_ATTESTED_ISSUERS: undefined,
      NEOTOMA_OPERATOR_ATTESTED_SUBS: undefined,
    });
    expect(
      isOperatorAttested({ iss: "https://issuer", sub: "agent:x" }),
    ).toEqual({ matched: false, source: null });
  });

  it("matches by issuer when only the issuer list is set", () => {
    withEnv({
      NEOTOMA_OPERATOR_ATTESTED_ISSUERS: "https://issuer-a, https://issuer-b",
    });
    expect(isOperatorAttested({ iss: "https://issuer-a" })).toEqual({
      matched: true,
      source: "issuer",
    });
    expect(
      isOperatorAttested({ iss: "https://issuer-b", sub: "agent:y" }),
    ).toEqual({ matched: true, source: "issuer" });
    expect(isOperatorAttested({ iss: "https://other" })).toEqual({
      matched: false,
      source: null,
    });
  });

  it("prefers issuer_subject match over plain issuer match", () => {
    withEnv({
      NEOTOMA_OPERATOR_ATTESTED_ISSUERS: "https://issuer-a",
      NEOTOMA_OPERATOR_ATTESTED_SUBS: "https://issuer-a:agent:special",
    });
    expect(
      isOperatorAttested({ iss: "https://issuer-a", sub: "agent:special" }),
    ).toEqual({ matched: true, source: "issuer_subject" });
    expect(
      isOperatorAttested({ iss: "https://issuer-a", sub: "agent:other" }),
    ).toEqual({ matched: true, source: "issuer" });
  });

  it("matches only by issuer_subject when only that list is set", () => {
    withEnv({
      NEOTOMA_OPERATOR_ATTESTED_ISSUERS: undefined,
      NEOTOMA_OPERATOR_ATTESTED_SUBS:
        "https://issuer-a:agent:1, https://issuer-b:agent:2",
    });
    expect(
      isOperatorAttested({ iss: "https://issuer-a", sub: "agent:1" }),
    ).toEqual({ matched: true, source: "issuer_subject" });
    expect(
      isOperatorAttested({ iss: "https://issuer-a", sub: "agent:9" }),
    ).toEqual({ matched: false, source: null });
    expect(isOperatorAttested({ iss: "https://issuer-a" })).toEqual({
      matched: false,
      source: null,
    });
  });

  it("trims entries and ignores empty CSV slots", () => {
    withEnv({
      NEOTOMA_OPERATOR_ATTESTED_ISSUERS: " ,, https://issuer-a ,, ,",
    });
    expect(isOperatorAttested({ iss: "https://issuer-a" })).toEqual({
      matched: true,
      source: "issuer",
    });
    expect(isOperatorAttested({ iss: "" })).toEqual({
      matched: false,
      source: null,
    });
  });

  it("does NOT lowercase issuers (matching is case-sensitive)", () => {
    withEnv({
      NEOTOMA_OPERATOR_ATTESTED_ISSUERS: "https://Issuer-A",
    });
    expect(isOperatorAttested({ iss: "https://Issuer-A" })).toEqual({
      matched: true,
      source: "issuer",
    });
    expect(isOperatorAttested({ iss: "https://issuer-a" })).toEqual({
      matched: false,
      source: null,
    });
  });

  it("caches parse results across calls until reset", () => {
    withEnv({
      NEOTOMA_OPERATOR_ATTESTED_ISSUERS: "https://issuer-a",
    });
    expect(isOperatorAttested({ iss: "https://issuer-a" }).matched).toBe(true);

    process.env.NEOTOMA_OPERATOR_ATTESTED_ISSUERS = "https://issuer-b";
    expect(isOperatorAttested({ iss: "https://issuer-a" }).matched).toBe(true);
    expect(isOperatorAttested({ iss: "https://issuer-b" }).matched).toBe(false);

    resetOperatorAllowlistCacheForTests();
    expect(isOperatorAttested({ iss: "https://issuer-a" }).matched).toBe(false);
    expect(isOperatorAttested({ iss: "https://issuer-b" }).matched).toBe(true);
  });
});
