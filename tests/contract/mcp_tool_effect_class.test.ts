import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { config } from "../../src/config.js";
import { buildSmitheryServerCard } from "../../src/mcp_server_card.js";
import { loadToolEffectCatalog } from "../../src/shared/tool_effect_catalog.js";
import { buildToolDefinitions, NEOTOMA_TOOL_NAMES } from "../../src/tool_definitions.js";

const catalog = loadToolEffectCatalog(
  join(config.projectRoot, "docs", "developer", "mcp", "tool_descriptions.yaml"),
  NEOTOMA_TOOL_NAMES
);

const definitions = buildToolDefinitions(
  catalog.descriptions,
  "ui://neotoma/timeline_widget",
  "ui://neotoma/turn-summary",
  catalog
);

function tool(name: string) {
  const definition = definitions.find((candidate) => candidate.name === name);
  if (!definition) throw new Error(`Missing test tool ${name}`);
  return definition;
}

describe("MCP tool effect catalog", () => {
  it("fails closed when a newly registered tool has no effect class", () => {
    const directory = mkdtempSync(join(tmpdir(), "neotoma-tool-effects-"));
    const yamlPath = join(directory, "tool_descriptions.yaml");
    try {
      const source = readFileSync(
        join(config.projectRoot, "docs", "developer", "mcp", "tool_descriptions.yaml"),
        "utf8"
      );
      writeFileSync(yamlPath, source.replace("  store: write\n", ""));
      expect(() => loadToolEffectCatalog(yamlPath, NEOTOMA_TOOL_NAMES)).toThrow(
        /effect_classes must match the MCP tool inventory; missing: store/
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("makes every advertised tool distinguishable by complete, protocol-native metadata", () => {
    expect(catalog.effectClasses.size).toBe(NEOTOMA_TOOL_NAMES.length);
    expect(definitions).toHaveLength(NEOTOMA_TOOL_NAMES.length);

    for (const definition of definitions) {
      expect(definition.annotations).toHaveProperty("readOnlyHint");
      expect(definition.annotations).toHaveProperty("openWorldHint");
      expect(definition._meta?.["neotoma/effect_class"]).toMatch(/^(read|write|external)$/);
      if (definition.annotations?.readOnlyHint === false) {
        expect(definition.annotations).toHaveProperty("destructiveHint");
        expect(definition.annotations).toHaveProperty("idempotentHint");
      }
    }
  });

  it("distinguishes local reads, durable writes, and network-facing actions without names", () => {
    expect(tool("retrieve_entities")).toMatchObject({
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { "neotoma/effect_class": "read" },
    });
    expect(tool("store")).toMatchObject({
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: { "neotoma/effect_class": "write" },
    });
    expect(tool("sync_peer")).toMatchObject({
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: { "neotoma/effect_class": "external" },
    });
  });

  it("never labels known mutators or transmitters as read-only", () => {
    for (const name of [
      "store",
      "correct",
      "delete_entity",
      "merge_entities",
      "sync_peer",
      "publish_rendered_page",
      "submit_issue",
    ]) {
      expect(tool(name).annotations?.readOnlyHint, name).toBe(false);
      expect(tool(name)._meta?.["neotoma/effect_class"], name).not.toBe("read");
    }
  });

  it("keeps the static server card exactly aligned with tools/list metadata", () => {
    const cardTools = (
      buildSmitheryServerCard().tools as Array<{
        name: string;
        annotations: unknown;
        _meta: unknown;
      }>
    )
      .map(({ name, annotations, _meta }) => ({ name, annotations, _meta }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const listTools = definitions
      .map(({ name, annotations, _meta }) => ({ name, annotations, _meta }))
      .sort((a, b) => a.name.localeCompare(b.name));
    expect(cardTools).toEqual(listTools);
  });
});
