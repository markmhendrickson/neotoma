import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import yaml from "js-yaml";
import { buildToolDefinitions } from "../../src/tool_definitions.js";

/**
 * Token count estimation using simple word/punctuation heuristic.
 * Approximates tokens by: word_count + 0.3 * punctuation_count + markup_overhead
 */
function estimateTokenCount(text: string): number {
  // Split on whitespace and count tokens
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const punctuation = (text.match(/[.,!?;:\-—–']/g) || []).length;
  const markup = (text.match(/[*_[\]]/g) || []).length;

  // Rough estimate: 1 word ≈ 1.3 tokens, punctuation ≈ 0.2 tokens
  return Math.ceil(words.length * 1.3 + punctuation * 0.2 + markup * 0.1);
}

/**
 * Mirror src/server.ts loadToolDescriptionsMap / ListTools override path:
 * YAML entries override buildToolDefinitions() inline defaults when present.
 */
function loadToolDescriptionsMap(): Map<string, string> {
  const path = join(process.cwd(), "docs", "developer", "mcp", "tool_descriptions.yaml");
  const raw = readFileSync(path, "utf-8");
  const data = yaml.load(raw) as { tools?: Record<string, string> } | undefined;
  if (data?.tools && typeof data.tools === "object") {
    return new Map(Object.entries(data.tools));
  }
  return new Map();
}

describe("tool_descriptions - store tool", () => {
  // Assert the ListTools-facing description (code default + YAML override),
  // not the bare buildToolDefinitions() fallback alone.
  const descriptionOverrides = loadToolDescriptionsMap();
  const tools = buildToolDefinitions(descriptionOverrides);
  const storeTool = tools.find((t) => t.name === "store");

  it("should exist", () => {
    expect(storeTool).toBeDefined();
  });

  it("merged ListTools description should be ≤60 tokens (~250 chars)", () => {
    if (!storeTool) throw new Error("store tool not found");
    const tokenCount = estimateTokenCount(storeTool.description);
    const charCount = storeTool.description.length;

    expect(tokenCount).toBeLessThanOrEqual(60);
    expect(charCount).toBeLessThanOrEqual(250);

    // Debug output
    console.log(`Store tool description (merged): ${charCount} chars, ~${tokenCount} tokens`);
  });

  it("serialized store entry is smaller than main's pre-repair ListTools entry", () => {
    if (!storeTool) throw new Error("store tool not found");
    // origin/main at the repair merge: 15,371 bytes for this exact JSON.stringify shape.
    // Keep at least 5% savings on the store entry, including inputSchema descriptions.
    expect(JSON.stringify(storeTool).length).toBeLessThanOrEqual(Math.floor(15_371 * 0.95));
  });

  it("inline fallback stays within the same budget as the YAML override", () => {
    const fallback = buildToolDefinitions().find((tool) => tool.name === "store");
    expect(fallback).toBeDefined();
    expect(estimateTokenCount(fallback!.description)).toBeLessThanOrEqual(60);
    expect(fallback!.description.length).toBeLessThanOrEqual(250);
    expect(fallback!.description).toBe(storeTool?.description);
  });

  it("YAML store override must not reintroduce a long-form description", () => {
    const yamlStore = descriptionOverrides.get("store");
    // Absent override is fine (inline default wins). If present, it must stay short.
    if (yamlStore !== undefined) {
      expect(estimateTokenCount(yamlStore)).toBeLessThanOrEqual(60);
      expect(yamlStore.length).toBeLessThanOrEqual(250);
    }
    if (!storeTool) throw new Error("store tool not found");
    // Merged result is what agents see via ListTools
    expect(storeTool.description).toBe(
      yamlStore ?? buildToolDefinitions().find((t) => t.name === "store")?.description
    );
  });

  it("description should end with punctuation", () => {
    if (!storeTool) throw new Error("store tool not found");
    expect(storeTool.description).toMatch(/[.!?]$/);
  });

  it("description should NOT contain internal-mechanics jargon", () => {
    if (!storeTool) throw new Error("store tool not found");
    const description = storeTool.description.toLowerCase();

    // These terms should NOT be in the tool hint (moved to field descriptions)
    expect(description).not.toMatch(/interpretation block/i);
    expect(description).not.toMatch(/raw_fragments/i);
    expect(description).not.toMatch(/observation provenance/i);
    expect(description).not.toMatch(/schema-agnostic/i);
  });

  it("description should include essential signals", () => {
    if (!storeTool) throw new Error("store tool not found");
    const description = storeTool.description.toLowerCase();

    // Six essential signals
    expect(description).toMatch(/entit/i); // entities or entity
    expect(description).toMatch(/file/i);
    expect(description).toMatch(/dedup/i); // deduplication or dedup
    expect(description).toMatch(/schema.*infer/i); // schema inference
  });

  it("field descriptions should be present and non-empty", () => {
    if (!storeTool) throw new Error("store tool not found");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props =
      ((storeTool.inputSchema as Record<string, unknown>).properties as Record<string, any>) || {};

    // Check key field descriptions exist and are substantive
    const requiredFields = [
      "entities",
      "interpretation",
      "file_content",
      "file_path",
      "idempotency_key",
      "mime_type",
      "data_origin",
      "expected_entity_absent",
    ];

    for (const field of requiredFields) {
      expect(props[field]).toBeDefined(`Field ${field} should exist in inputSchema properties`);
      expect(props[field].description).toBeDefined(`Field ${field} should have a description`);
      expect(props[field].description.length).toBeGreaterThanOrEqual(
        40,
        `Field ${field} description should be ≥40 chars (was ${props[field].description.length})`
      );

      // Debug output
      console.log(`${field}: ${props[field].description.length} chars description`);
    }
  });

  it("current store controls remain discoverable after shortening the YAML hint", () => {
    if (!storeTool) throw new Error("store tool not found");
    const props = (storeTool.inputSchema as { properties: Record<string, { description: string }> })
      .properties;
    expect(props.data_origin.description).toMatch(/Request-level.*entity's data_origin overrides/i);
    expect(props.data_origin.description).toMatch(/Strip credentials/i);
    expect(props.expected_entity_absent.description).toMatch(/atomically create exactly one/i);
    expect(props.relationships.description).toMatch(/Create relationships/i);
  });

  it("entities field should document schema inference and ALL-fields rule", () => {
    if (!storeTool) throw new Error("store tool not found");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props =
      ((storeTool.inputSchema as Record<string, unknown>).properties as Record<string, any>) || {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entitiesDesc = (props.entities as { description: string }).description;

    expect(entitiesDesc).toMatch(/ALL fields/i);
    expect(entitiesDesc).toMatch(/raw_fragments/i);
    expect(entitiesDesc).toMatch(/schema.*infer/i);
    expect(entitiesDesc).toMatch(/parse readable files/i);
    expect(entitiesDesc).toMatch(/save.*create entity.*add record.*ingest.*persist/i);
  });

  it("interpretation field should document Source → Observation chain semantics", () => {
    if (!storeTool) throw new Error("store tool not found");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props =
      ((storeTool.inputSchema as Record<string, unknown>).properties as Record<string, any>) || {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const interpretationDesc = (props.interpretation as { description: string }).description;

    expect(interpretationDesc).toMatch(/Source.*Observation.*chain/i);
    expect(interpretationDesc).toMatch(/provenance/i);
    expect(interpretationDesc).toMatch(/external.*(data|source)/i);
    expect(interpretationDesc).toMatch(/interpretation_id.*null/i);
  });

  it("file_content field should document per-user dedup and base64", () => {
    if (!storeTool) throw new Error("store tool not found");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props =
      ((storeTool.inputSchema as Record<string, unknown>).properties as Record<string, any>) || {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fileContentDesc = (props.file_content as { description: string }).description;

    expect(fileContentDesc).toMatch(/base64/i);
    expect(fileContentDesc).toMatch(/per-user.*dedup/i);
    expect(fileContentDesc).toMatch(/mime_type/i);
  });

  it("file_path field should document server locality and remote upload", () => {
    if (!storeTool) throw new Error("store tool not found");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props =
      ((storeTool.inputSchema as Record<string, unknown>).properties as Record<string, any>) || {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filePathDesc = (props.file_path as { description: string }).description;

    expect(filePathDesc).toMatch(/SERVER's filesystem/i);
    expect(filePathDesc).toMatch(/ERR_FILE_PATH_IS_SERVER_LOCAL/i);
    expect(filePathDesc).toMatch(/POST \/sources\/upload/i);
    expect(filePathDesc).toMatch(/file_content.*mime_type/i);
  });

  it("idempotency_key field should clarify required vs optional usage", () => {
    if (!storeTool) throw new Error("store tool not found");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props =
      ((storeTool.inputSchema as Record<string, unknown>).properties as Record<string, any>) || {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idempotencyDesc = (props.idempotency_key as { description: string }).description;

    expect(idempotencyDesc).toMatch(/required.*entit/i); // required for entities path
    expect(idempotencyDesc).toMatch(/optional.*file/i); // optional for file path
    expect(idempotencyDesc).toMatch(/idempotent/i);
  });
});
