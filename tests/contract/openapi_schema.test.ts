import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import {
  getOpenApiInputSchemaForTool,
  listOpenApiMappedMcpTools,
} from "../../src/shared/openapi_schema.js";
import { resolveOpenApiPath } from "../../src/shared/openapi_file.js";
import { mkdtempSync, readFileSync } from "node:fs";
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
        expect.arrayContaining(["relationship_type", "source_entity_id", "target_entity_id"])
      );
    });

    it("declares relationship_type as an open string pointing at the registry", () => {
      // REWRITTEN for #1972 / G25, same reason as the list_relationships case
      // below: the vocabulary is a runtime registry, so an enum in the
      // contract is a second copy that goes stale on the next registration —
      // and a spec-driven client would then refuse locally a call the server
      // accepts, which is exactly the one-way door #1972 was opened about.
      const rel = schema?.properties?.relationship_type;
      expect(rel?.type).toBe("string");
      expect(
        rel?.enum,
        "create_relationship must not enumerate relationship types in the contract"
      ).toBeUndefined();
      expect(
        rel?.description ?? "",
        "the contract must tell a client how to discover the vocabulary"
      ).toContain("list_relationship_types");
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
      expect(Object.keys(props)).toEqual(expect.arrayContaining(["user_id", "keyword", "summary"]));
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

    it("declares relationship_type as an open string pointing at the registry", () => {
      // REWRITTEN for #1972 / G25. This used to assert a CLOSED enum containing
      // a sample of the 28 built-ins. That assertion pinned the bug rather than
      // the fix: the vocabulary is a runtime registry, so an enum in the
      // contract goes stale the moment a type is registered, and a
      // spec-driven client would refuse locally a call the server accepts.
      const rel = schema?.properties?.relationship_type;
      expect(rel?.type).toBe("string");
      expect(
        rel?.enum,
        "openapi.yaml must not enumerate relationship types — the vocabulary is a registry"
      ).toBeUndefined();
      expect(
        rel?.description ?? "",
        "the contract must tell a client how to discover the vocabulary"
      ).toContain("list_relationship_types");
    });

    // Note: the openapi.yaml schema declares an `anyOf` constraint requiring
    // at least one of entity_id / source_entity_id / target_entity_id /
    // relationship_type. That constraint is not surfaced by the
    // tool-schema extractor (which flattens to {type, properties, required}
    // for MCP consumption), so it is verified by the openapi:bc-diff output
    // and by ListRelationshipsRequestSchema's .refine() in action_schemas.ts.
  });

  describe("policy-unavailable 503 is declared where it is emitted (#1974/#1975)", () => {
    // The handlers emit 503 + ERR_STORE_POLICY_UNAVAILABLE for both /store and
    // /correct (one shared error branch in src/actions.ts). The envelope schema
    // and the docs landed with it. The OPERATIONS did not — for one review
    // cycle the runtime returned a status the spec never declared.
    //
    // That divergence is worse here than in most places. A generated client
    // sees only the declared responses, so an undeclared 503 lands in whatever
    // the client does with an unrecognised status — typically the generic-error
    // path, next to the 400 DENIED. Those two demand OPPOSITE responses:
    // DENIED means fix the payload, UNAVAILABLE means retry it unchanged. An
    // agent that conflates them narrows what it stores because the server could
    // not read its own policy.
    //
    // Reads openapi.yaml directly rather than the generated types: the
    // generator is what could silently drop this, so asserting against its
    // output would only prove the generator agrees with itself.
    const spec = load(readFileSync(resolveOpenApiPath(), "utf-8")) as {
      paths?: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
      components?: { schemas?: Record<string, unknown> };
    };

    it.each(["/store", "/correct"])(
      "%s declares 503 -> StorePolicyUnavailableErrorEnvelope",
      (route) => {
        const responses = spec.paths?.[route]?.post?.responses;
        expect(responses, `${route} POST has no responses block`).toBeTruthy();

        const declared = responses?.["503"];
        expect(
          declared,
          `${route} emits 503 ERR_STORE_POLICY_UNAVAILABLE at runtime but does not declare it`
        ).toBeTruthy();

        expect(JSON.stringify(declared)).toContain(
          "#/components/schemas/StorePolicyUnavailableErrorEnvelope"
        );
      }
    );

    it("keeps the referenced envelope defined", () => {
      // A $ref to a deleted schema is a spec that parses and lies.
      expect(spec.components?.schemas?.StorePolicyUnavailableErrorEnvelope).toBeTruthy();
    });

    it("keeps DENIED on 400 and UNAVAILABLE on 503, never merged", () => {
      // Collapsing these onto one status erases the retry/rewrite distinction
      // the split exists to carry.
      for (const route of ["/store", "/correct"]) {
        const responses = spec.paths?.[route]?.post?.responses ?? {};
        const four = JSON.stringify(responses["400"] ?? {});
        const five = JSON.stringify(responses["503"] ?? {});

        expect(four, `${route} 400 must still carry DENIED`).toContain(
          "StorePolicyDeniedErrorEnvelope"
        );
        expect(four, `${route} 400 must not carry UNAVAILABLE`).not.toContain(
          "StorePolicyUnavailableErrorEnvelope"
        );
        expect(five, `${route} 503 must not carry DENIED`).not.toContain(
          "StorePolicyDeniedErrorEnvelope"
        );
      }
    });
  });
});
