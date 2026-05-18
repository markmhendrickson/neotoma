/**
 * DX tests for submit_issue improvements (issues #181, #182, #183, #191, #206).
 *
 * #181 — store tool description must rank high in tool_search for common verbs
 * #182 — reporter_app_version auto-populate logic in the server layer
 * #183/#206 — AUTH_REQUIRED errors surface an actionable hint instead of a raw JSON blob
 * #191 — tool deregistration documented in mcp/instructions.md (doc-only, no code test)
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// #183 / #206 — AUTH_REQUIRED error shaping
// ---------------------------------------------------------------------------

/** Minimal extraction of the AUTH_REQUIRED formatting logic from neotoma_client.ts */
function formatRemoteSubmitError(error: unknown): string {
  const errObj =
    error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  if (errObj?.["error_code"] === "AUTH_REQUIRED") {
    const hint =
      typeof errObj?.["details"] === "object" &&
      errObj["details"] !== null &&
      typeof (errObj["details"] as Record<string, unknown>)["hint"] === "string"
        ? ` ${(errObj["details"] as Record<string, unknown>)["hint"]}`
        : " Create an agent grant via Inspector → Agents → Grants to allow AAuth-signed agents to authenticate without a Bearer token.";
    return `Remote Neotoma issue submit failed: authentication required (AUTH_REQUIRED).${hint}`;
  }
  return `Remote Neotoma issue submit failed: ${JSON.stringify(error)}`;
}

describe("AUTH_REQUIRED error shaping (#183, #206)", () => {
  it("surfaces the hint from details.hint when present", () => {
    const error = {
      error_code: "AUTH_REQUIRED",
      details: { hint: "Go to Inspector → Agents → Grants and create a grant." },
    };
    const msg = formatRemoteSubmitError(error);
    expect(msg).toContain("AUTH_REQUIRED");
    expect(msg).toContain("Inspector → Agents → Grants and create a grant");
    expect(msg).not.toContain('"error_code"'); // not the raw JSON blob
  });

  it("falls back to default hint when details.hint is absent", () => {
    const error = { error_code: "AUTH_REQUIRED", details: {} };
    const msg = formatRemoteSubmitError(error);
    expect(msg).toContain("authentication required (AUTH_REQUIRED)");
    expect(msg).toContain("Inspector → Agents → Grants");
  });

  it("falls back to default hint when details is not an object", () => {
    const error = { error_code: "AUTH_REQUIRED", details: "string details" };
    const msg = formatRemoteSubmitError(error);
    expect(msg).toContain("Create an agent grant via Inspector");
  });

  it("falls back to default hint when details.hint is not a string", () => {
    const error = { error_code: "AUTH_REQUIRED", details: { hint: 42 } };
    const msg = formatRemoteSubmitError(error);
    expect(msg).toContain("Create an agent grant via Inspector");
  });

  it("passes through non-AUTH_REQUIRED errors as JSON", () => {
    const error = { error_code: "NOT_FOUND", message: "resource missing" };
    const msg = formatRemoteSubmitError(error);
    expect(msg).toContain("NOT_FOUND");
    expect(msg).toContain("resource missing");
    expect(msg).not.toContain("AUTH_REQUIRED");
  });

  it("handles null error gracefully", () => {
    const msg = formatRemoteSubmitError(null);
    expect(msg).toContain("null");
  });

  it("handles string error gracefully", () => {
    const msg = formatRemoteSubmitError("something went wrong");
    expect(msg).toContain("something went wrong");
  });
});

// ---------------------------------------------------------------------------
// #182 — reporter_app_version auto-populate
// ---------------------------------------------------------------------------

/** Minimal reproduction of the server-side auto-populate logic */
function resolveReporterAppVersion(
  callerProvided: string | undefined,
  serverVersion: string,
): string {
  return callerProvided ?? serverVersion;
}

describe("reporter_app_version auto-populate (#182)", () => {
  it("uses caller-supplied value when provided", () => {
    expect(resolveReporterAppVersion("1.2.3-custom", "0.14.0")).toBe("1.2.3-custom");
  });

  it("falls back to server version when caller omits the field", () => {
    expect(resolveReporterAppVersion(undefined, "0.14.0")).toBe("0.14.0");
  });

  it("uses caller-supplied empty string (explicit) over server version", () => {
    // ?? only fires on null/undefined, not on empty string — this is correct
    // behaviour: if caller explicitly passes "" they mean "".
    expect(resolveReporterAppVersion("", "0.14.0")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// #181 — store tool description contains keywords used in tool_search
// ---------------------------------------------------------------------------

// The description is embedded in buildToolDefinitions(); we read the source
// file directly so we don't have to spin up a full server instance.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const toolDefsSource = readFileSync(
  resolve(import.meta.dirname, "../../src/tool_definitions.ts"),
  "utf-8",
);

// Extract the store description from the source by finding the string between
// the `desc("store",` call and the next closing paren.  We look for a
// representative sample of keywords rather than parsing the full AST.
const storeDescriptionMatch = toolDefsSource.match(/desc\(\s*"store"\s*,\s*"([^"]+)"/);
const storeDescription = storeDescriptionMatch?.[1] ?? "";

describe("store tool description keyword coverage (#181)", () => {
  it("contains the store description in source", () => {
    expect(storeDescription.length).toBeGreaterThan(50);
  });

  it("starts with an action verb agents use when querying for the tool", () => {
    // 'save', 'create', 'record', or 'store' — any of these should appear
    // near the start so tool_search ranking favours this entry.
    expect(storeDescription.toLowerCase()).toMatch(/^(save|create|record|store)/);
  });

  it("mentions common entity type names for improved tool_search ranking", () => {
    const desc = storeDescription.toLowerCase();
    // At least two of these must appear so agents searching for a specific
    // entity type have a match in the description.
    const entityTerms = ["task", "note", "contact", "transaction", "event", "plan"];
    const matched = entityTerms.filter((t) => desc.includes(t));
    expect(matched.length).toBeGreaterThanOrEqual(2);
  });

  it("includes alias names to catch store/save/create variations", () => {
    expect(storeDescription.toLowerCase()).toContain("alias");
  });
});
