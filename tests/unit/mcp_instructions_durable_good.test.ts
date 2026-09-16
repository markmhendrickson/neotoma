/**
 * Drift-detection test for the durable-good ("owned physical items") clause —
 * step (7) of the per-record extraction checklist.
 *
 * Context: ateles#1014 / neotoma#2238. The clause sat as an uncommitted edit in
 * the release deployment checkout from 2026-08-05, where it both blocked the
 * checkout from being updated and was invisible to review. This test pins the
 * landed text so it cannot silently regress, and pins the two decisions that
 * were made about it:
 *
 *   1. ONE registered ownership type — `device`. `asset` is not a registered
 *      schema, and shipping `device` / `asset` as equally valid would push
 *      agents into inventing an unregistered type.
 *   2. The obligation survives compact mode, where the full checklist is not
 *      shipped — at minimum as a pointer saying the full checklist still binds.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { extractFirstFencedCodeBlock } from "../../src/mcp_instruction_doc.js";
import { MCP_INTERACTION_INSTRUCTIONS_COMPACT_DUAL_HOST } from "../../src/server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");

const DURABLE_GOOD_ANCHOR = "owned physical items";

function mcpFencedBody(): string {
  const raw = readFileSync(
    join(REPO_ROOT, "docs", "developer", "mcp", "instructions.md"),
    "utf8",
  );
  const body = extractFirstFencedCodeBlock(raw);
  expect(body).not.toBeNull();
  return body as string;
}

/**
 * The clause-(7) region: from the step number that introduces the anchor
 * through to the end of the checklist paragraph. Slicing from the anchor text
 * alone would cut off the "(7)" that precedes it.
 */
function clauseRegion(): string {
  const body = mcpFencedBody();
  const anchor = body.indexOf(DURABLE_GOOD_ANCHOR);
  expect(anchor).toBeGreaterThan(-1);
  const start = body.lastIndexOf("(7)", anchor);
  expect(start).toBeGreaterThan(-1);
  const end = body.indexOf("\n", anchor);
  return body.slice(start, end === -1 ? undefined : end);
}

describe("durable-good extraction clause (ateles#1014, neotoma#2238)", () => {
  it("ships inside the MCP fenced block that clients actually receive", () => {
    // Not merely present in the file — present in the fence, which is what
    // `neotoma instructions print` and the MCP initialize payload send.
    expect(mcpFencedBody()).toContain(DURABLE_GOOD_ANCHOR);
  });

  it("is numbered as step (7) of the per-record extraction checklist", () => {
    const region = clauseRegion();
    expect(region).toContain("(7)");
    // It must sit in the checklist paragraph, after step (6).
    const body = mcpFencedBody();
    expect(body.indexOf("(6) **outreach implications**")).toBeLessThan(
      body.indexOf(DURABLE_GOOD_ANCHOR),
    );
  });

  it("names exactly one registered ownership type: `device`", () => {
    const region = clauseRegion();
    expect(region).toContain("`device`");
  });

  it("does not offer `device` / `asset` as equally valid (P0 invent-type regression)", () => {
    const region = clauseRegion();
    // The clause may *warn against* `asset`, but must never present it as an
    // acceptable alternative target type.
    expect(region).not.toMatch(/`device`\s*\/\s*`asset`/);
    expect(region).not.toMatch(/`asset`\s*\/\s*`device`/);
    // Where `asset` appears at all, it must be in a prohibition.
    if (region.includes("`asset`")) {
      expect(region).toMatch(/do NOT invent[^.]*`asset`/);
    }
  });

  it("requires the ownership entity IN ADDITION to the purchase transaction", () => {
    const region = clauseRegion();
    expect(region).toContain("distinct from and additional to any `transaction`");
    expect(region).toContain("REFERS_TO");
    // The whole point: a buy is not an ownership record.
    expect(region).toMatch(/FORBIDDEN: recording\s+only a `transaction`/);
  });

  it("carries a positive and a negative worked example", () => {
    const region = clauseRegion();
    // Positive: a keepable good gets both entities.
    expect(region).toMatch(/Worked example \(positive\)/);
    expect(region).toContain("laptop");
    // Negative: consumables/services/disposables get a transaction only.
    expect(region).toMatch(/Worked example \(negative\)/);
    expect(region).toMatch(/consumable|SaaS|disposable/);
  });

  it("routes ownership and maintenance queries through retrieval first", () => {
    const body = mcpFencedBody();
    expect(body).toContain("what hardware do I own");
    expect(body).toMatch(/entity_type: "device"/);
    // An empty result must not be reported as "you own nothing".
    expect(body).toMatch(/do NOT claim the user owns nothing/);
  });

  it("backfills the transaction gap on an empty device retrieve (ux empty-state)", () => {
    // An empty `device` result is not the end of the answer: it must be
    // cross-checked against `transaction` for keepable-good purchases that
    // were never backfilled into a `device`, and the gap disclosed rather
    // than silently reported as "you own nothing".
    const body = mcpFencedBody();
    expect(body).toMatch(/entity_type: "transaction"/);
    expect(body).toMatch(/disclose the gap explicitly/);
    expect(body).toMatch(/offer to backfill a `device` entity/);
  });

  it("asks once before storing an ambiguous durable-vs-consumable item (ux error-state)", () => {
    // No silent guess on an ambiguous line item, and no stalled extraction —
    // the transaction still lands immediately; only the device is deferred.
    const region = clauseRegion();
    expect(region).toMatch(/ask the user once to disambiguate/);
    expect(region).toMatch(/do NOT silently guess a `device`/);
    expect(region).toMatch(/store the `transaction` immediately/);
  });

  /**
   * Compact mode deliberately carries NO durable-good line.
   *
   * The compact fallback sits at 4988 of its 5000-character budget on
   * `origin/main` (see mcp_instructions_fallback_invariants.test.ts), so the
   * obligation cannot be added there without displacing an existing rule or
   * raising the cap — a trade-off for the operator, not for this PR. This test
   * pins the budget as the reason, so a future attempt reads the constraint
   * rather than rediscovering it.
   */
  it("leaves the compact surface unchanged — it has no room for this obligation", () => {
    const compact = MCP_INTERACTION_INSTRUCTIONS_COMPACT_DUAL_HOST;
    expect(compact.length).toBeLessThan(5200);
    expect(compact).not.toContain(DURABLE_GOOD_ANCHOR);
  });

  it("does not duplicate the checklist into the CLI harness doc (no split brain)", () => {
    // Per agent_instructions_sync_rules.mdc the CLI doc stays transport-only;
    // a second copy of the clause is how the two surfaces drift apart.
    const cli = readFileSync(
      join(REPO_ROOT, "docs", "developer", "cli_agent_instructions.md"),
      "utf8",
    );
    expect(cli).not.toContain(DURABLE_GOOD_ANCHOR);
  });
});
