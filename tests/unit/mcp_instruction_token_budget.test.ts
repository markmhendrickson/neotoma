/**
 * Token-budget regression tests for the two instruction payloads the MCP
 * server can serve (#2431).
 *
 * WHY THIS EXISTS
 *
 * The instruction block is the largest fixed cost a session pays, and it is
 * paid before the user types anything. It drifted to roughly twice its
 * believed size without anyone noticing: issue #1885 describes the block as
 * "~14-17K tokens as delivered" and the compact payload as "~900 tokens",
 * while the measured values at the time this test was written were 31,376 and
 * 1,095 tokens respectively. An estimate nobody re-measures is how a fixed
 * cost doubles in silence, so this test makes the size a thing that fails.
 *
 * WHAT IT MEASURES, AND WHY IN CHARACTERS
 *
 * The budgets below are expressed in CHARACTERS, not tokens, deliberately:
 * the repository has no tokenizer dependency, and adding one so a test can
 * assert a size would be a disproportionate cost for a regression guard.
 * Characters are exact, deterministic, and dependency-free.
 *
 * The conversion is stable enough for the proxy to hold. Measured with
 * tiktoken cl100k_base over these exact payloads at
 * origin/main ce636611d7a5de5628204b115f70cb037d8e4af5:
 *
 *   full block    145,194 chars / 31,376 tokens = 4.628 chars per token
 *   compact dual    5,100 chars /  1,095 tokens = 4.658 chars per token
 *
 * Both payloads are dense English prose and sit within 1% of each other, so a
 * character budget tracks the token budget it stands for. Each budget below
 * therefore records both numbers, and a reader changing one should recompute
 * the other rather than trusting the ratio indefinitely.
 *
 * WHAT IT DOES NOT MEASURE
 *
 * Only the instruction payloads. The tool surface (names, descriptions, and
 * inputSchemas resolved from openapi.yaml) is a separate and comparable fixed
 * cost that is not bounded here.
 *
 * These budgets are CEILINGS, not targets. Shrinking a payload is always
 * allowed and never fails this test. Growth past the ceiling is what fails,
 * and the fix is to justify the growth and raise the number deliberately —
 * which is the review conversation this test exists to force.
 */

import { describe, expect, it } from "vitest";

import {
  extractFirstFencedCodeBlock,
  readMcpInstructionsMarkdown,
  resolveNeotomaPackageRoot,
} from "../../src/mcp_instruction_doc.js";
import {
  MCP_INTERACTION_INSTRUCTIONS_COMPACT_DUAL_HOST,
  MCP_INTERACTION_INSTRUCTIONS_FALLBACK,
} from "../../src/server.js";

/**
 * Ceiling for the full fenced block served when NEOTOMA_MCP_COMPACT_INSTRUCTIONS
 * is unset — the default for every deployment.
 *
 * Measured 145,194 chars (31,376 tokens). Ceiling set at 150,000 chars
 * (~32,400 tokens), roughly 3% of headroom: enough that an ordinary
 * documentation edit does not trip it, tight enough that a new section does.
 *
 * Raised 150,000 -> 152,000 (#1933 / PR #1934): the [PROVENANCE] "Agent-initiated
 * file reads" clause and the [QA REFLECTION] "Dangling source-file citation
 * check" close a provenance-integrity gap (entities citing a `source_file` that
 * was never stored). Both clauses were condensed before raising; their net
 * growth is ~1,740 chars (~375 tokens). main sat at 149,964 chars when this was
 * raised, so the increase covers that growth and nothing else of substance.
 *
 * Baseline after the security-lens round on PR #1934 (secret-bearing files
 * exempted from byte persistence and from the self-audit repair): measured
 * 151,906 chars (~32,820 tokens), leaving 94 chars (~0.06%) of headroom. The
 * exemption was paid for by tightening the two #1933 clauses, not by raising
 * the ceiling again. Headroom this thin means the next instruction edit of any
 * size trips the test: further growth should be weighed under #1885 (and offset
 * by condensing elsewhere) rather than raised piecemeal.
 *
 * #2242 (`data_origin` on store, PR #2636) adds one instruction line and did
 * NOT raise the ceiling: the line was condensed to its required rules (pass
 * `data_origin` for read-from content, entity value overrides, never replaces
 * the per-entity `data_source`, strip credentials from `url`/`locator`) and
 * two rationale sentences in the same section were shortened to pay for it.
 * Baseline after that merge: measured 151,984 chars (~32,840 tokens),
 * leaving 16 chars of headroom.
 */
const FULL_BLOCK_MAX_CHARS = 152_000;

/**
 * Ceiling for the compact payload served when NEOTOMA_MCP_COMPACT_INSTRUCTIONS=1.
 *
 * Measured 5,100 chars (1,095 tokens). Ceiling set at 6,000 chars
 * (~1,290 tokens). The compact block's whole purpose is to be small, so its
 * headroom is proportionally tighter than the full block's.
 */
const COMPACT_MAX_CHARS = 6_000;

/**
 * The compact payload must stay dramatically smaller than the full block, or
 * it is not serving its purpose. Measured ratio is 28.5x; this asserts at
 * least 10x so the guarantee is structural rather than incidental.
 */
const MIN_COMPACT_REDUCTION_FACTOR = 10;

/**
 * Resolve the full block through the SAME path the server uses
 * (`getMcpInteractionInstructions` -> `readMcpInstructionsMarkdown` ->
 * `extractFirstFencedCodeBlock`), rather than reading the markdown file.
 *
 * This distinction is the point of the helper: the raw file is ~150,202 chars
 * while the fenced payload that actually ships is 145,194. A test that
 * measured the file would be measuring something the server never sends.
 */
function servedFullBlock(): string {
  const raw = readMcpInstructionsMarkdown(resolveNeotomaPackageRoot());
  expect(raw, "instructions.md must be readable").toBeTruthy();
  const body = extractFirstFencedCodeBlock(raw!);
  expect(body, "instructions.md must contain a fenced block").toBeTruthy();
  return body!;
}

describe("MCP instruction payload token budgets (#2431)", () => {
  it("the served full block stays within its character budget", () => {
    const body = servedFullBlock();
    expect(
      body.length,
      `Full instruction block is ${body.length} chars (~${Math.round(
        body.length / 4.628
      )} tokens), over the ${FULL_BLOCK_MAX_CHARS}-char budget. This payload ships to every ` +
        `default session before the user types. Either reduce it, or raise the budget ` +
        `deliberately and say why in the PR.`
    ).toBeLessThanOrEqual(FULL_BLOCK_MAX_CHARS);
  });

  it("measures the fenced payload the server serves, not the markdown file", () => {
    // Guards the helper itself: if extraction silently started returning the
    // whole file, every budget above would still pass while measuring the
    // wrong string. The fenced body must be a strict subset of the raw file.
    const raw = readMcpInstructionsMarkdown(resolveNeotomaPackageRoot())!;
    const body = servedFullBlock();
    expect(body.length).toBeLessThan(raw.length);
    expect(raw).toContain(body);
  });

  it("the compact dual-host payload stays within its character budget", () => {
    const compact = MCP_INTERACTION_INSTRUCTIONS_COMPACT_DUAL_HOST;
    expect(
      compact.length,
      `Compact payload is ${compact.length} chars (~${Math.round(
        compact.length / 4.658
      )} tokens), over the ${COMPACT_MAX_CHARS}-char budget. The compact block exists to be ` +
        `small; growth here defeats its purpose.`
    ).toBeLessThanOrEqual(COMPACT_MAX_CHARS);
  });

  it("the runtime fallback stays within the compact budget too", () => {
    // Same body lines, different header/footer framing. It is served when
    // instructions.md is unreadable, which is exactly when nobody is watching,
    // so it gets the same ceiling rather than an unbounded pass.
    expect(MCP_INTERACTION_INSTRUCTIONS_FALLBACK.length).toBeLessThanOrEqual(COMPACT_MAX_CHARS);
  });

  it("the compact payload is at least 10x smaller than the full block", () => {
    const full = servedFullBlock().length;
    const compact = MCP_INTERACTION_INSTRUCTIONS_COMPACT_DUAL_HOST.length;
    const factor = full / compact;
    expect(
      factor,
      `Compact payload is only ${factor.toFixed(1)}x smaller than the full block. ` +
        `Compact mode's entire justification is the size difference; below ${MIN_COMPACT_REDUCTION_FACTOR}x ` +
        `the flag is not worth the behavioural divergence it causes.`
    ).toBeGreaterThanOrEqual(MIN_COMPACT_REDUCTION_FACTOR);
  });
});
