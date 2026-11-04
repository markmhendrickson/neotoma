/**
 * The correction rule as agents and users read it must say what the reducer does:
 * a later correction replaces an earlier one on every field, including the whole
 * array on a merge_array field (#2341), with one exception: on merge_array_by_key
 * fields corrections combine by key, which patch_array_item relies on. A
 * description that left the exception out would send an agent into a silent
 * keyed merge.
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

const ARRAY_EXCEPTION = "merge_array_by_key fields excepted: corrections combine by key";

const yamlDescriptions = (
  yaml.load(read("docs", "developer", "mcp", "tool_descriptions.yaml")) as {
    tools: Record<string, string>;
  }
).tools;
const tsDescription = (name: string) =>
  buildToolDefinitions().find((tool) => tool.name === name)?.description;

describe("the correction rule carries its array exception on every surface", () => {
  it("the rule text itself names the exception and the merge_array replacement", () => {
    expect(CORRECTION_RULE_TEXT).toContain(ARRAY_EXCEPTION);
    expect(CORRECTION_RULE_TEXT).toContain("on a merge_array field it replaces the whole array");
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
    expect(spec).toContain(CORRECTION_RULE_TEXT);
    expect(spec).not.toContain("corrections union, #2341");
  });

  it("the served MCP instruction block states the exception next to the rule", () => {
    const block = extractFirstFencedCodeBlock(read("docs", "developer", "mcp", "instructions.md"));
    expect(block).not.toBeNull();
    expect(block).toMatch(
      /A correction outranks every other write to its field[^.]*\(merge_array_by_key fields combine corrections by key\)/
    );
  });

  it("README and observation_architecture.md state the exception", () => {
    expect(read("README.md")).not.toMatch(/union corrections/);
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
