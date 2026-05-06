/**
 * Invariant tests for the MCP_INTERACTION_INSTRUCTIONS_FALLBACK constant
 * in src/server.ts. These ensure the runtime fallback (used when
 * docs/developer/mcp/instructions.md is unreadable) stays compact and aligned
 * with MCP_INTERACTION_INSTRUCTIONS_COMPACT_DUAL_HOST body lines.
 */

import { describe, expect, it } from "vitest";

import {
  MCP_INTERACTION_INSTRUCTIONS_COMPACT_DUAL_HOST,
  MCP_INTERACTION_INSTRUCTIONS_FALLBACK,
} from "../../src/server.js";

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

  it("includes bounded product-bug repair escalation", () => {
    expect(fb).toMatch(/Product-bug repair escalation/i);
    expect(fb).toMatch(/deterministic Neotoma product bug/i);
    expect(fb).toMatch(/source checkout/i);
    expect(fb).toMatch(/targeted validation/i);
  });

  it("stays compact (under ~5000 chars)", () => {
    expect(fb.length).toBeLessThan(5000);
  });

  it("includes compact-critical phrases shared with dual-host variant", () => {
    const critical = [
      "conversation_message",
      "PART_OF",
      "REFERS_TO",
      "store_structured",
      "idempotency_key",
      "Product-bug repair escalation",
    ];
    expect(MCP_INTERACTION_INSTRUCTIONS_FALLBACK.split("\n").slice(1, -1)).toEqual(
      MCP_INTERACTION_INSTRUCTIONS_COMPACT_DUAL_HOST.split("\n").slice(1, -1)
    );
    for (const phrase of critical) {
      expect(fb).toContain(phrase);
    }
  });
});

describe("MCP_INTERACTION_INSTRUCTIONS_COMPACT_DUAL_HOST", () => {
  const compact = MCP_INTERACTION_INSTRUCTIONS_COMPACT_DUAL_HOST;

  it("identifies compact-by-choice mode", () => {
    expect(compact).toMatch(/NEOTOMA_MCP_COMPACT_INSTRUCTIONS/);
  });

  it("matches fallback body lines between headers and footers", () => {
    const fb = MCP_INTERACTION_INSTRUCTIONS_FALLBACK;
    expect(compact.split("\n").slice(1, -1)).toEqual(fb.split("\n").slice(1, -1));
  });

  it("does not claim runtime file-unreadable fallback", () => {
    expect(compact).not.toMatch(/unreadable; reconnect/);
  });
});
