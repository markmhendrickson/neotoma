/**
 * Drift-detection test for the "Skill auto-loading at session start" instruction.
 *
 * Bundles m1 PR A (GitHub issue #205, Neotoma plan ent_b5a51d1395d206e10945b6b1)
 * added a canonical paragraph to `docs/developer/mcp/instructions.md` (inside
 * the fenced code block sent over MCP) and mirrored it in
 * `docs/developer/cli_agent_instructions.md` per the anchor-sync rule in
 * `docs/developer/agent_instructions_sync_rules.mdc`.
 *
 * This test catches accidental removal from either doc, and also verifies that
 * the MCP fenced-block extractor (`extractFirstFencedCodeBlock`) still picks
 * up the paragraph — which is what `neotoma instructions print` and the MCP
 * `initialize` payload ship to clients.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { extractFirstFencedCodeBlock } from "../../src/mcp_instruction_doc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");

const SKILL_AUTOLOAD_ANCHOR = "Skill auto-loading at session start";

describe("Skill auto-loading instruction (Bundles m1 PR A, issue #205)", () => {
  it("appears inside the MCP fenced code block in docs/developer/mcp/instructions.md", () => {
    const mcpDocPath = join(
      REPO_ROOT,
      "docs",
      "developer",
      "mcp",
      "instructions.md",
    );
    const raw = readFileSync(mcpDocPath, "utf8");
    const body = extractFirstFencedCodeBlock(raw);
    expect(body).not.toBeNull();
    expect(body).toContain(SKILL_AUTOLOAD_ANCHOR);
    // Verify it is a MUST-language behavioral rule, not just a stray mention.
    expect(body).toMatch(/Skill auto-loading at session start[\s\S]{0,400}MUST/);
  });

  it("is mirrored in docs/developer/cli_agent_instructions.md per anchor-sync", () => {
    const cliDocPath = join(
      REPO_ROOT,
      "docs",
      "developer",
      "cli_agent_instructions.md",
    );
    const cli = readFileSync(cliDocPath, "utf8");
    expect(cli).toContain(SKILL_AUTOLOAD_ANCHOR);
  });
});
