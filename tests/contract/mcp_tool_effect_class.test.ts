import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { config } from "../../src/config.js";
import { buildSmitheryServerCard } from "../../src/mcp_server_card.js";
import {
  loadToolEffectCatalog,
  resolveToolCatalogPath,
  TOOL_CATALOG_SEGMENTS,
} from "../../src/shared/tool_effect_catalog.js";
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

  it("fails closed when a newly registered tool has no title", () => {
    const directory = mkdtempSync(join(tmpdir(), "neotoma-tool-titles-"));
    const yamlPath = join(directory, "tool_descriptions.yaml");
    try {
      const source = readFileSync(
        join(config.projectRoot, "docs", "developer", "mcp", "tool_descriptions.yaml"),
        "utf8"
      );
      const withoutTitle = source.replace(/^  store: Store entities and files\n/m, "");
      expect(withoutTitle).not.toBe(source);
      writeFileSync(yamlPath, withoutTitle);
      expect(() => loadToolEffectCatalog(yamlPath, NEOTOMA_TOOL_NAMES)).toThrow(
        /titles must match the MCP tool inventory; missing: store/
      );
      // The error names the exact file that was read.
      expect(() => loadToolEffectCatalog(yamlPath, NEOTOMA_TOOL_NAMES)).toThrow(yamlPath);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("gives every advertised tool a non-empty title and complete annotations", () => {
    expect(catalog.titles.size).toBe(NEOTOMA_TOOL_NAMES.length);
    const titles = new Set<string>();
    for (const definition of definitions) {
      expect(definition.title, definition.name).toBeTruthy();
      expect(definition.title!.length, definition.name).toBeLessThanOrEqual(40);
      expect(definition.annotations?.title, definition.name).toBe(definition.title);
      expect(typeof definition.annotations?.readOnlyHint, definition.name).toBe("boolean");
      expect(typeof definition.annotations?.openWorldHint, definition.name).toBe("boolean");
      if (definition.annotations?.readOnlyHint === false) {
        expect(typeof definition.annotations?.destructiveHint, definition.name).toBe("boolean");
        expect(typeof definition.annotations?.idempotentHint, definition.name).toBe("boolean");
      }
      titles.add(definition.title!);
    }
    // Titles are what a person sees on a permission screen; two tools must
    // never be indistinguishable there.
    expect(titles.size).toBe(definitions.length);
  });

  it("classifies key tools by the rule: destructive means irreversible or outward-facing", () => {
    const hints = (name: string) => {
      const { readOnlyHint, destructiveHint, openWorldHint } = tool(name).annotations ?? {};
      return { readOnlyHint, destructiveHint, openWorldHint };
    };

    // Reads.
    for (const name of [
      "retrieve_entities",
      "retrieve_entity_snapshot",
      "list_relationships",
      "list_relationship_types",
      "describe_entity_type",
    ]) {
      expect(hints(name), name).toEqual({
        readOnlyHint: true,
        destructiveHint: undefined,
        openWorldHint: false,
      });
    }

    // Local, reversible writes: soft delete and restore must never demand
    // confirmation, so they are not destructive.
    for (const name of [
      "store",
      "correct",
      "create_relationship",
      "register_relationship_type",
      "merge_entities",
      "split_entity",
      "delete_entity",
      "delete_relationship",
      "restore_entity",
      "restore_relationship",
      "unsubscribe",
      "manage_bundles",
      "register_schema",
      "update_schema_incremental",
      // auto_fix rewrites snapshot rows, so this is a write, not a read.
      "health_check_snapshots",
    ]) {
      expect(hints(name), name).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      });
    }

    // Changing peers stays destructive even when the row is soft-deleted.
    expect(hints("remove_peer")).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    });

    // Publishing, sending and peer or grant changes are outward-facing.
    for (const name of [
      "publish_rendered_page",
      "submit_issue",
      "add_issue_message",
      "sync_issues",
      "sync_peer",
      "add_peer",
      "subscribe",
      // Can mint a guest access grant and POST to a custom_webhook mirror.
      "submit_entity",
    ]) {
      expect(hints(name), name).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      });
    }

    // prefer_remote fetches from a peer URL, but every strategy keeps both
    // sides (immutable observations), so it is open-world, not destructive.
    expect(hints("resolve_sync_conflict")).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    });

    // Remote probes read beyond the instance without changing anything.
    for (const name of ["get_peer_status", "npm_check_update", "get_issue_status"]) {
      expect(hints(name), name).toEqual({
        readOnlyHint: true,
        destructiveHint: undefined,
        openWorldHint: true,
      });
    }
  });

  it("names the missing catalog file and every searched root instead of a raw ENOENT", () => {
    const empty = mkdtempSync(join(tmpdir(), "neotoma-tool-catalog-missing-"));
    try {
      expect(() => resolveToolCatalogPath([empty])).toThrow(
        /tool catalog docs\/developer\/mcp\/tool_descriptions\.yaml is missing.*Searched: .*neotoma-tool-catalog-missing-/
      );
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("falls back to the next root when the project root has no catalog", () => {
    const empty = mkdtempSync(join(tmpdir(), "neotoma-tool-catalog-project-"));
    const installed = mkdtempSync(join(tmpdir(), "neotoma-tool-catalog-package-"));
    try {
      const target = join(installed, ...TOOL_CATALOG_SEGMENTS);
      mkdirSync(join(installed, ...TOOL_CATALOG_SEGMENTS.slice(0, -1)), { recursive: true });
      writeFileSync(target, "effect_classes: {}\ntitles: {}\n");
      expect(resolveToolCatalogPath([empty, installed])).toBe(target);
    } finally {
      rmSync(empty, { recursive: true, force: true });
      rmSync(installed, { recursive: true, force: true });
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
        title?: string;
        annotations: unknown;
        _meta: unknown;
      }>
    )
      .map(({ name, title, annotations, _meta }) => ({ name, title, annotations, _meta }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const listTools = definitions
      .map(({ name, title, annotations, _meta }) => ({ name, title, annotations, _meta }))
      .sort((a, b) => a.name.localeCompare(b.name));
    expect(cardTools).toEqual(listTools);
  });
});
