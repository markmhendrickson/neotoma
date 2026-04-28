/**
 * Invariant tests for the MCP_INTERACTION_INSTRUCTIONS_FALLBACK constant
 * in src/server.ts. These ensure the runtime fallback (used when
 * docs/developer/mcp/instructions.md is unreadable) stays aligned with the
 * canonical compact block on critical phrases and contract elements.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MCP_INTERACTION_INSTRUCTIONS_FALLBACK } from "../../src/server.js";

const REPO_ROOT = join(__dirname, "..", "..");
const INSTRUCTIONS_MD = join(REPO_ROOT, "docs", "developer", "mcp", "instructions.md");

function loadCanonicalCompactBlock(): string {
  const raw = readFileSync(INSTRUCTIONS_MD, "utf-8");
  const match = raw.match(/```\s*\n?([\s\S]*?)```/);
  if (!match || !match[1]) throw new Error("Could not extract fenced code block from instructions.md");
  return match[1].trim();
}

describe("MCP_INTERACTION_INSTRUCTIONS_FALLBACK", () => {
  const fb = MCP_INTERACTION_INSTRUCTIONS_FALLBACK;

  it("identifies itself as a runtime fallback", () => {
    expect(fb).toMatch(/runtime fallback/i);
  });

  it("covers the five-step turn lifecycle", () => {
    expect(fb).toContain("Bounded retrieval");
    expect(fb).toContain("User-phase store");
    expect(fb).toContain("Other actions");
    expect(fb).toContain("Compose reply");
    expect(fb).toContain("Closing store");
  });

  it("references conversation_message entity type", () => {
    expect(fb).toContain("conversation_message");
  });

  it("references canonical relationship types", () => {
    expect(fb).toContain("PART_OF");
    expect(fb).toContain("REFERS_TO");
  });

  it("encodes the forbidden bullets", () => {
    expect(fb).toMatch(/FORBIDDEN/);
    expect(fb).toMatch(/persisting.*user message.*without.*assistant/i);
    expect(fb).toMatch(/ending the turn without.*closing.*store/i);
  });

  it("uses the current display rule heading", () => {
    expect(fb).toContain("🧠 Neotoma");
  });

  it("includes the idempotency-key fallback recipe", () => {
    expect(fb).toMatch(/conversation-chat-<turn>/);
  });

  it("includes the store retry policy", () => {
    expect(fb).toMatch(/retry once/i);
    expect(fb).toMatch(/surface the error/i);
  });

  it("stays compact (under ~5000 chars)", () => {
    expect(fb.length).toBeLessThan(5000);
  });

  it("agrees with canonical compact block on critical phrases", () => {
    const canonical = loadCanonicalCompactBlock();
    const critical = [
      "conversation_message",
      "sender_kind",
      "PART_OF",
      "REFERS_TO",
      "store_structured",
      "idempotency_key",
    ];
    for (const phrase of critical) {
      expect(fb).toContain(phrase);
      expect(canonical).toContain(phrase);
    }
  });
});
