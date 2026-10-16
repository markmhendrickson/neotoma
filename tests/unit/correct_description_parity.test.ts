/**
 * The correction rule as agents and users read it must say what the reducer does,
 * including its one exception: merge_array and merge_array_by_key still union
 * corrections with each other instead of letting a later correction replace an
 * earlier one (#2341). A description that promised "a later correction replaces it"
 * for every field would send an agent into a silent union.
 *
 * One definition (`CORRECTION_RULE_TEXT`) backs the TypeScript tool description;
 * this test fails if the YAML mirror, the MCP spec, the served instruction block,
 * the README or the observation-architecture doc stop carrying the exception, or if
 * the two `resolve_sync_conflict` description surfaces stop agreeing.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { extractFirstFencedCodeBlock } from "../../src/mcp_instruction_doc.js";
import { CORRECTION_RULE_TEXT } from "../../src/services/correction_identity.js";
import {
  buildToolDefinitions,
  RESOLVE_SYNC_CONFLICT_DESCRIPTION,
} from "../../src/tool_definitions.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

const ARRAY_EXCEPTION = "array fields excepted: corrections union, #2341";

const yamlDescriptions = (
  yaml.load(read("docs", "developer", "mcp", "tool_descriptions.yaml")) as {
    tools: Record<string, string>;
  }
).tools;
const tsDescription = (name: string) =>
  buildToolDefinitions().find((tool) => tool.name === name)?.description;

describe("the correction rule carries its array exception on every surface", () => {
  it("the rule text itself names the exception and limits recency to scalar fields", () => {
    expect(CORRECTION_RULE_TEXT).toContain(ARRAY_EXCEPTION);
    expect(CORRECTION_RULE_TEXT).toContain("deterministic recency for scalar fields");
  });

  it("the `correct` tool description (TypeScript) carries the rule text", () => {
    expect(tsDescription("correct")).toContain(CORRECTION_RULE_TEXT);
  });

  it("the `correct` description in tool_descriptions.yaml carries the same rule text, and points arrays at patch_array_item", () => {
    expect(yamlDescriptions.correct).toContain(CORRECTION_RULE_TEXT);
    expect(yamlDescriptions.correct).toMatch(/prefer patch_array_item over a full-array correct/);
  });

  it("MCP_SPEC.md states the exception on the `correct` entry", () => {
    const spec = read("docs", "specs", "MCP_SPEC.md");
    expect(spec).toContain(ARRAY_EXCEPTION);
    expect(spec).not.toContain("until a later correction replaces it; among corrections");
  });

  it("the served MCP instruction block states the exception next to the rule", () => {
    const block = extractFirstFencedCodeBlock(read("docs", "developer", "mcp", "instructions.md"));
    expect(block).not.toBeNull();
    expect(block).toMatch(
      /A correction outranks every other write to its field[^.]*\(array fields union corrections, #2341\)/
    );
  });

  it("README and observation_architecture.md state the exception", () => {
    expect(read("README.md")).toMatch(/array fields union corrections for now, #2341/);
    expect(read("docs", "subsystems", "observation_architecture.md")).toContain(ARRAY_EXCEPTION);
  });
});

describe("resolve_sync_conflict descriptions agree", () => {
  it("the TypeScript and YAML descriptions are the same text", () => {
    expect(tsDescription("resolve_sync_conflict")).toBe(RESOLVE_SYNC_CONFLICT_DESCRIPTION);
    expect(yamlDescriptions.resolve_sync_conflict).toBe(RESOLVE_SYNC_CONFLICT_DESCRIPTION);
  });

  it("both say manual needs the correct capability and that ok:true with withheld fields is a partial apply", () => {
    expect(RESOLVE_SYNC_CONFLICT_DESCRIPTION).toContain(
      "prefer_remote and manual need the correct capability"
    );
    expect(RESOLVE_SYNC_CONFLICT_DESCRIPTION).toContain(
      "ok:true with a non-empty fields_withheld means a partial apply"
    );
  });
});
