/**
 * Drift-detection test for the ERR_SCHEMA_SCOPE_MISMATCH repair instruction (#2454 / PR #2455).
 *
 * Arch gate requires the repair path on MCP initialize surfaces (fenced instructions
 * block + tool_descriptions) so agents do not fall through to register_schema when
 * a schema already exists in another scope. CLI gets a thin ops pointer only.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { extractFirstFencedCodeBlock } from "../../src/mcp_instruction_doc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");

const SCOPE_MISMATCH_ANCHOR = "Schema scope mismatch";
const ERROR_CODE = "ERR_SCHEMA_SCOPE_MISMATCH";

describe("ERR_SCHEMA_SCOPE_MISMATCH instruction surfaces (#2454 / PR #2455)", () => {
  it("appears inside the MCP fenced code block in docs/developer/mcp/instructions.md", () => {
    const mcpDocPath = join(REPO_ROOT, "docs", "developer", "mcp", "instructions.md");
    const raw = readFileSync(mcpDocPath, "utf8");
    const body = extractFirstFencedCodeBlock(raw);
    expect(body).not.toBeNull();
    expect(body).toContain(SCOPE_MISMATCH_ANCHOR);
    expect(body).toContain(ERROR_CODE);
    expect(body).toMatch(
      /Schema scope mismatch[\s\S]{0,800}FORBIDDEN[\s\S]{0,200}register_schema/
    );
    expect(body).toMatch(
      /Full data fidelity[\s\S]{0,2000}ERR_SCHEMA_SCOPE_MISMATCH[\s\S]{0,400}register_schema/
    );
  });

  it("documents the retry path on update_schema_incremental in tool_descriptions.yaml", () => {
    const yamlPath = join(REPO_ROOT, "docs", "developer", "mcp", "tool_descriptions.yaml");
    const yaml = readFileSync(yamlPath, "utf8");
    const idx = yaml.indexOf("update_schema_incremental:");
    expect(idx).toBeGreaterThanOrEqual(0);
    const slice = yaml.slice(idx, idx + 2500);
    expect(slice).toContain(ERROR_CODE);
    expect(slice).toMatch(/user_specific[\s\S]{0,200}found_scope/);
    expect(slice).toMatch(/Never call register_schema|never register_schema/i);
  });

  it("includes a thin CLI ops pointer under Schema audit (not a full behavioral duplicate)", () => {
    const cliDocPath = join(REPO_ROOT, "docs", "developer", "cli_agent_instructions.md");
    const cli = readFileSync(cliDocPath, "utf8");
    expect(cli).toContain(ERROR_CODE);
    expect(cli).toContain("neotoma schemas update --user-specific");
    expect(cli).toMatch(/Do not run `neotoma schemas register`|do not `neotoma schemas register`/i);
    expect(cli).toContain("neotoma instructions print");
  });
});
