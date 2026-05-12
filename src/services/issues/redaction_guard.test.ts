import { describe, expect, it } from "vitest";

import {
  RedactionGuardError,
  assertPublicEmissionIsClean,
  runRedactionGuard,
} from "./redaction_guard.js";

describe("runRedactionGuard", () => {
  it("returns the original strings when there is no PII", () => {
    const result = runRedactionGuard({
      title: "Bug in CLI",
      body: "Steps to reproduce: run the command, observe error.",
    });
    expect(result.applied).toBe(false);
    expect(result.fields_redacted).toBe(0);
    expect(result.title).toBe("Bug in CLI");
    expect(result.body).toBe("Steps to reproduce: run the command, observe error.");
  });

  it("redacts emails, tokens, and home paths in scan mode", () => {
    const result = runRedactionGuard({
      title: "Reporter alice@example.com hit error",
      body: "Failed at /Users/alice/repo/main.ts with token sk-AAAAAAAAAAAAAAAAAA",
    });
    expect(result.applied).toBe(true);
    expect(result.fields_redacted).toBe(2);
    expect(result.title).toMatch(/<EMAIL:[0-9a-f]{4}>/);
    expect(result.body).toMatch(/<TOKEN:[0-9a-f]{4}>/);
    expect(result.body).toContain("~/repo/main.ts");
    expect(result.body).not.toContain("alice@example.com");
    expect(result.hits).toContain("email");
  });

  it("redacts extra_fields using the same salt", () => {
    const result = runRedactionGuard({
      title: "ok",
      body: "ok",
      extra_fields: {
        branch_name: "fix/contains-bob@example.com",
        commit_message: "no leakage",
      },
    });
    expect(result.applied).toBe(true);
    expect(result.extra_fields?.branch_name).toMatch(/<EMAIL:[0-9a-f]{4}>/);
    expect(result.extra_fields?.commit_message).toBe("no leakage");
  });

  it("throws RedactionGuardError in guard mode when a hit is found", () => {
    expect(() =>
      runRedactionGuard({
        title: "Reporter alice@example.com",
        body: "ok",
        mode: "guard",
      }),
    ).toThrow(RedactionGuardError);
  });

  it("does not throw in guard mode when there is no PII", () => {
    expect(() =>
      runRedactionGuard({
        title: "Clean title",
        body: "Clean body",
        mode: "guard",
      }),
    ).not.toThrow();
  });

  it("assertPublicEmissionIsClean is the guard-mode shortcut", () => {
    expect(() =>
      assertPublicEmissionIsClean({
        title: "Reporter alice@example.com",
        body: "ok",
      }),
    ).toThrow(RedactionGuardError);
  });

  it("preserves an existing placeholder rather than re-hashing it", () => {
    const result = runRedactionGuard({
      title: "Reporter <EMAIL:abcd>",
      body: "Already redacted upstream",
    });
    expect(result.title).toBe("Reporter <EMAIL:abcd>");
    expect(result.applied).toBe(false);
  });

  it("does not treat ISO date literals in public issue titles as phone numbers", () => {
    const result = runRedactionGuard({
      title: "Public test via unsigned-dev 2026-05-12T07-10 flow3",
      body: "No PII here.",
    });

    expect(result.applied).toBe(false);
    expect(result.title).toBe("Public test via unsigned-dev 2026-05-12T07-10 flow3");
    expect(result.title).not.toContain("<PHONE:");
  });

  it("still redacts phone-like values", () => {
    const result = runRedactionGuard({
      title: "Call 202-555-0123",
      body: "No PII here.",
    });

    expect(result.applied).toBe(true);
    expect(result.title).toMatch(/Call <PHONE:[0-9a-f]{4}>/);
  });
});
