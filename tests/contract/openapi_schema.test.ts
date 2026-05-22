import { describe, expect, it } from "vitest";
import {
  getOpenApiInputSchemaForTool,
  listOpenApiMappedMcpTools,
} from "../../src/shared/openapi_schema.js";
import { resolveOpenApiPath } from "../../src/shared/openapi_file.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("OpenAPI tool schemas", () => {
  it("returns schemas for all mapped MCP tools", () => {
    for (const toolName of listOpenApiMappedMcpTools()) {
      const schema = getOpenApiInputSchemaForTool(toolName);
      expect(schema).toBeTruthy();
      expect(schema?.type).toBeTruthy();
    }
  });

  it("resolves OpenAPI path independently of cwd", () => {
    const originalCwd = process.cwd();
    const tempDir = mkdtempSync(join(tmpdir(), "neotoma-openapi-cwd-"));
    process.chdir(tempDir);
    try {
      const openApiPath = resolveOpenApiPath();
      expect(openApiPath.endsWith("/openapi.yaml")).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  describe("create_relationship tool schema (issue #159)", () => {
    const schema = getOpenApiInputSchemaForTool("create_relationship") as {
      type?: string;
      properties?: Record<string, { type?: string; enum?: string[] }>;
    } | null;

    it("declares required-by-server properties so MCP clients can pass them", () => {
      expect(schema).toBeTruthy();
      expect(schema?.type).toBe("object");
      const props = schema?.properties ?? {};
      expect(Object.keys(props)).toEqual(
        expect.arrayContaining([
          "relationship_type",
          "source_entity_id",
          "target_entity_id",
        ])
      );
    });

    it("enumerates canonical relationship_type values including EMBEDS", () => {
      const rel = schema?.properties?.relationship_type;
      expect(rel?.type).toBe("string");
      expect(rel?.enum).toEqual(
        expect.arrayContaining([
          "PART_OF",
          "CORRECTS",
          "REFERS_TO",
          "DEPENDS_ON",
          "EMBEDS",
        ])
      );
    });

    it("declares optional metadata, source_id, user_id alongside required fields", () => {
      const props = schema?.properties ?? {};
      expect(Object.keys(props)).toEqual(
        expect.arrayContaining(["metadata", "source_id", "user_id"])
      );
    });
  });

  describe("list_entity_types tool schema (issue #161)", () => {
    const schema = getOpenApiInputSchemaForTool("list_entity_types") as {
      type?: string;
      properties?: Record<string, { type?: string }>;
    } | null;

    it("exposes keyword and summary query params alongside user_id", () => {
      expect(schema).toBeTruthy();
      expect(schema?.type).toBe("object");
      const props = schema?.properties ?? {};
      expect(Object.keys(props)).toEqual(
        expect.arrayContaining(["user_id", "keyword", "summary"])
      );
      expect(props.keyword?.type).toBe("string");
      expect(props.summary?.type).toBe("boolean");
    });
  });

  describe("list_relationships tool schema (issue #340)", () => {
    const schema = getOpenApiInputSchemaForTool("list_relationships") as {
      type?: string;
      anyOf?: Array<{ required?: string[] }>;
      properties?: Record<
        string,
        { type?: string; enum?: string[]; minimum?: number; default?: unknown }
      >;
    } | null;

    it("declares the request fields the handler actually accepts", () => {
      expect(schema).toBeTruthy();
      expect(schema?.type).toBe("object");
      const props = schema?.properties ?? {};
      expect(Object.keys(props)).toEqual(
        expect.arrayContaining([
          "entity_id",
          "source_entity_id",
          "target_entity_id",
          "direction",
          "relationship_type",
          "limit",
          "offset",
          "user_id",
        ])
      );
    });

    it("constrains relationship_type to the closed enum matching the handler", () => {
      const rel = schema?.properties?.relationship_type;
      expect(rel?.type).toBe("string");
      // Sample of canonical + lowercase relationship types; full list must
      // match RelationshipTypeSchema in src/shared/action_schemas.ts.
      expect(rel?.enum).toEqual(
        expect.arrayContaining([
          "PART_OF",
          "CORRECTS",
          "REFERS_TO",
          "DEPENDS_ON",
          "EMBEDS",
          "works_at",
          "invested_in",
        ])
      );
    });

    // Note: the openapi.yaml schema declares an `anyOf` constraint requiring
    // at least one of entity_id / source_entity_id / target_entity_id /
    // relationship_type. That constraint is not surfaced by the
    // tool-schema extractor (which flattens to {type, properties, required}
    // for MCP consumption), so it is verified by the openapi:bc-diff output
    // and by ListRelationshipsRequestSchema's .refine() in action_schemas.ts.
  });
});
