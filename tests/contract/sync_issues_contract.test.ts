/**
 * sync_issues transport parity (#2536): the MCP tool schema, the OpenAPI request body
 * (which drives the generated types and the CLI client) and the Zod request schema that
 * both the REST handler and the MCP handler validate with must expose the same request
 * fields, so `repo` / `push` / `commit` cannot exist on one transport and not another.
 */

import { describe, expect, it } from "vitest";

import { buildToolDefinitions } from "../../src/tool_definitions.js";
import { getOpenApiInputSchemaForOperationId } from "../../src/shared/openapi_schema.js";
import { IssuesSyncRequestSchema } from "../../src/shared/action_schemas.js";

function keys(schema: unknown): string[] {
  return Object.keys((schema as { properties?: Record<string, unknown> }).properties ?? {})
    .filter((k) => k !== "user_id")
    .sort();
}

describe("sync_issues request field parity", () => {
  const tool = buildToolDefinitions().find((t) => t.name === "sync_issues");
  const openApi = getOpenApiInputSchemaForOperationId("issuesSync");

  it("declares repo, push and commit on the MCP tool", () => {
    expect(tool).toBeDefined();
    expect(keys(tool!.inputSchema)).toEqual(
      expect.arrayContaining(["commit", "labels", "push", "repo", "since", "state"])
    );
  });

  it("MCP tool and OpenAPI request body expose identical fields", () => {
    expect(keys(tool!.inputSchema)).toEqual(keys(openApi));
  });

  it("the Zod request schema accepts every declared field", () => {
    const shapeKeys = Object.keys(IssuesSyncRequestSchema.shape)
      .filter((k) => k !== "user_id")
      .sort();
    expect(shapeKeys).toEqual(keys(openApi));
  });

  it("OpenAPI documents the push default and the token setting", () => {
    const props = (openApi as { properties: Record<string, { description?: string }> }).properties;
    expect(props.push?.description).toMatch(/default false for any other `repo`/);
    expect(tool!.description).toMatch(/NEOTOMA_ISSUES_GITHUB_TOKEN/);
  });
});
