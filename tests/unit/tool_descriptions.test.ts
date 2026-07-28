import { describe, it, expect } from "vitest";
import { buildToolDefinitions } from "../../src/tool_definitions.js";

/**
 * Token count estimation using simple word/punctuation heuristic.
 * Approximates tokens by: word_count + 0.3 * punctuation_count + markup_overhead
 */
function estimateTokenCount(text: string): number {
  // Split on whitespace and count tokens
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const punctuation = (text.match(/[.,!?;:\-—–]/g) || []).length;
  const markup = (text.match(/[*_[\]]/g) || []).length;

  // Rough estimate: 1 word ≈ 1.3 tokens, punctuation ≈ 0.2 tokens
  return Math.ceil(words.length * 1.3 + punctuation * 0.2 + markup * 0.1);
}

describe("tool_descriptions - store tool", () => {
  const tools = buildToolDefinitions();
  const storeTool = tools.find((t) => t.name === "store");

  it("should exist", () => {
    expect(storeTool).toBeDefined();
  });

  it("description should be ≤60 tokens (~250 chars)", () => {
    if (!storeTool) throw new Error("store tool not found");
    const tokenCount = estimateTokenCount(storeTool.description);
    const charCount = storeTool.description.length;

    expect(tokenCount).toBeLessThanOrEqual(60);
    expect(charCount).toBeLessThanOrEqual(250);

    // Debug output
    console.log(
      `Store tool description: ${charCount} chars, ~${tokenCount} tokens`
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
    const props = ((storeTool.inputSchema as Record<string, unknown>).properties as Record<string, any>) || {};

    // Check key field descriptions exist and are substantive
    const requiredFields = [
      "entities",
      "interpretation",
      "file_content",
      "file_path",
      "idempotency_key",
      "mime_type",
    ];

    for (const field of requiredFields) {
      expect(props[field]).toBeDefined(
        `Field ${field} should exist in inputSchema properties`
      );
      expect(props[field].description).toBeDefined(
        `Field ${field} should have a description`
      );
      expect(props[field].description.length).toBeGreaterThanOrEqual(
        40,
        `Field ${field} description should be ≥40 chars (was ${props[field].description.length})`
      );

      // Debug output
      console.log(
        `${field}: ${props[field].description.length} chars description`
      );
    }
  });

  it("entities field should document schema inference and ALL-fields rule", () => {
    if (!storeTool) throw new Error("store tool not found");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = ((storeTool.inputSchema as Record<string, unknown>).properties as Record<string, any>) || {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entitiesDesc = (props.entities as { description: string }).description;

    expect(entitiesDesc).toMatch(/ALL fields/i);
    expect(entitiesDesc).toMatch(/raw_fragments/i);
    expect(entitiesDesc).toMatch(/schema.*infer/i);
    expect(entitiesDesc).toMatch(/interpretation/i);
  });

  it("interpretation field should document Source → Observation chain semantics", () => {
    if (!storeTool) throw new Error("store tool not found");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = ((storeTool.inputSchema as Record<string, unknown>).properties as Record<string, any>) || {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const interpretationDesc = (props.interpretation as { description: string }).description;

    expect(interpretationDesc).toMatch(/Source.*Observation.*chain/i);
    expect(interpretationDesc).toMatch(/provenance/i);
    expect(interpretationDesc).toMatch(
      /external.*(data|source)/i
    );
    expect(interpretationDesc).toMatch(/interpretation_id.*null/i);
  });

  it("file_content field should document per-user dedup and base64", () => {
    if (!storeTool) throw new Error("store tool not found");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = ((storeTool.inputSchema as Record<string, unknown>).properties as Record<string, any>) || {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fileContentDesc = (props.file_content as { description: string }).description;

    expect(fileContentDesc).toMatch(/base64/i);
    expect(fileContentDesc).toMatch(/per-user.*dedup/i);
    expect(fileContentDesc).toMatch(/mime_type/i);
  });

  it("file_path field should document platform availability and tenant scope", () => {
    if (!storeTool) throw new Error("store tool not found");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = ((storeTool.inputSchema as Record<string, unknown>).properties as Record<string, any>) || {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filePathDesc = (props.file_path as { description: string }).description;

    expect(filePathDesc).toMatch(/Cursor.*Claude Code.*only/i);
    expect(filePathDesc).toMatch(/unavailable.*web/i);
    expect(filePathDesc).toMatch(/per-user.*dedup/i);
  });

  it("idempotency_key field should clarify required vs optional usage", () => {
    if (!storeTool) throw new Error("store tool not found");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = ((storeTool.inputSchema as Record<string, unknown>).properties as Record<string, any>) || {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idempotencyDesc = (props.idempotency_key as { description: string }).description;

    expect(idempotencyDesc).toMatch(/required.*entit/i); // required for entities path
    expect(idempotencyDesc).toMatch(/optional.*file/i); // optional for file path
    expect(idempotencyDesc).toMatch(/idempotent/i);
  });
});
