/**
 * Reachability test for the "Relationship type discovery and registration" rule
 * on the CLI-installed agent channel (v0.24.0 rc3 review).
 *
 * The section lives outside the MCP instruction block in
 * docs/developer/mcp/instructions.md, so neither MCP clients nor
 * `neotoma instructions print` emit it. An earlier rc3 edit replaced the CLI copy
 * with a pointer to `instructions print`, which left the rule reachable from no
 * agent channel. This test pins that the rule content the CLI installs into agent
 * rule files carries the full guidance, and that it stays verbatim with the
 * section of the same name in the MCP doc.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildRuleContentForTarget,
  loadCliAgentInstructions,
  PROJECT_APPLIED_RULE_PATHS,
} from "../../src/cli/agent_instructions_scan.js";
import { extractFirstFencedCodeBlock } from "../../src/mcp_instruction_doc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");

const HEADING = "## Relationship type discovery and registration";

/** Body of a `## ` section, up to the next `## ` heading or end of file. */
function sectionBody(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  if (start < 0) return "";
  const rest = markdown.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

/** Paragraphs of the section, whitespace-normalized for comparison. */
function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}

describe("relationship type rule on the CLI-installed agent channel", () => {
  it("is carried in full by the rule content the CLI installs", async () => {
    const body = await loadCliAgentInstructions(REPO_ROOT);
    const installed = buildRuleContentForTarget(body, PROJECT_APPLIED_RULE_PATHS.claude);
    const section = sectionBody(installed, HEADING);

    expect(section).not.toBe("");
    // Empty-list disambiguation.
    expect(section).toContain("registry_unseeded");
    expect(section).toContain("filtered_to_empty");
    // Built-in types: list and retry, never register.
    expect(section).toMatch(/built-in[\s\S]{0,400}list_relationship_types[\s\S]{0,40}retry/);
    // Capability denial vs unhealthy registry.
    expect(section).toMatch(/capability denial/);
    // related_to re-typing migration recipe.
    expect(section).toMatch(/related_to[\s\S]{0,200}metadata\.relation="knows"/);
    expect(section).toMatch(/soft-delete the old edge/);
  });

  it("does not point agents at `instructions print` for a section print does not emit", () => {
    const mcpRaw = readFileSync(
      join(REPO_ROOT, "docs", "developer", "mcp", "instructions.md"),
      "utf8"
    );
    const printed = extractFirstFencedCodeBlock(mcpRaw) ?? "";
    const cliRaw = readFileSync(
      join(REPO_ROOT, "docs", "developer", "cli_agent_instructions.md"),
      "utf8"
    );
    if (!printed.includes("Relationship type discovery and registration")) {
      expect(cliRaw).not.toMatch(
        /instructions print`?\s*\(search\s*"Relationship type discovery and registration"\)/
      );
    }
  });

  it("stays verbatim with the MCP doc section of the same name", () => {
    const mcpRaw = readFileSync(
      join(REPO_ROOT, "docs", "developer", "mcp", "instructions.md"),
      "utf8"
    );
    const cliRaw = readFileSync(
      join(REPO_ROOT, "docs", "developer", "cli_agent_instructions.md"),
      "utf8"
    );
    const mcpParas = paragraphs(sectionBody(mcpRaw, HEADING));
    const cliParas = paragraphs(sectionBody(cliRaw, HEADING));

    expect(mcpParas.length).toBeGreaterThan(0);
    for (const para of mcpParas) {
      expect(cliParas).toContain(para);
    }
  });
});
