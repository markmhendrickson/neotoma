import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import {
  extractFirstFencedCodeBlock,
  readMcpInstructionsMarkdown,
  resolveNeotomaPackageRoot,
} from "../../src/mcp_instruction_doc.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { execFileLocal } from "../helpers/cli_local_target.js";

const execute = execFileLocal;
const TYPE = "planning_axis_surface";
const UPPER = "planning_other_stratum";
const USER = LOCAL_DEV_USER_ID;
const REGISTER_HTTP = "planning_registered_http_surface";
const REGISTER_MCP = "planning_registered_mcp_surface";
const ALL_TYPES = [TYPE, UPPER, REGISTER_HTTP, REGISTER_MCP];
const fields = { label: { type: "string", required: false } };

async function seed(type: string, level: number, scope: "global" | "user" = "global") {
  const { error } = await db.from("schema_registry").insert({
    entity_type: type,
    schema_version: scope === "global" ? "1.0.0" : "1.9.0",
    schema_definition: {
      fields,
      identity_opt_out: "heuristic_canonical_name",
      planning: { level },
    },
    reducer_config: { merge_policies: { label: { strategy: "last_write" } } },
    metadata: { icon: "shape", guest_access_policy: "read_only" },
    active: true,
    scope,
    user_id: scope === "user" ? USER : null,
  });
  if (error) throw error;
}

describe("planning declaration HTTP / MCP / CLI parity", () => {
  let http: ReturnType<typeof createServer>;
  let base: string;
  let server: NeotomaServer;
  beforeAll(async () => {
    for (const type of ALL_TYPES) await db.from("schema_registry").delete().eq("entity_type", type);
    await seed(TYPE, 12);
    await seed(UPPER, 888);
    http = createServer(app);
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
    server = new NeotomaServer();
  });
  afterAll(async () => {
    for (const type of ALL_TYPES) await db.from("schema_registry").delete().eq("entity_type", type);
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });

  it("delivers canonical planning instructions through extraction, MCP, HTTP and compiled CLI", async () => {
    const body = extractFirstFencedCodeBlock(
      readMcpInstructionsMarkdown(resolveNeotomaPackageRoot())!
    );
    expect(body).toContain("[TURN LIFECYCLE]");
    expect(body).toContain("[PLANNING DECLARATIONS]");
    expect(body).toContain("registry_coverage");
    const delivered = await fetch(`${base}/mcp-interaction-instructions`);
    expect(delivered.status).toBe(200);
    expect(await delivered.text()).toContain(body!);
    expect((server as any).getMcpInteractionInstructions()).toContain(body!);
    const { stdout } = await execute(
      process.execPath,
      ["dist/cli/index.js", "--api-only", "--base-url", base, "instructions", "print", "--json"],
      { env: { ...process.env, NEOTOMA_API_BASE_URL: base }, timeout: 15000 }
    );
    expect(JSON.parse(stdout).body).toContain(body!);
  });

  it("round-trips a declaration-only HTTP update and preserves definition, metadata and scope", async () => {
    const before = await schemaRegistry.loadActiveSchema(TYPE, USER);
    const response = await fetch(`${base}/update_schema_incremental`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: TYPE, planning: { level: 24, read_only: true } }),
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as any;
    expect(result.success).toBe(true);
    const after = await schemaRegistry.loadActiveSchema(TYPE, USER);
    expect(after?.schema_definition.planning).toEqual({ level: 24, read_only: true });
    expect(after?.schema_definition.fields).toEqual(before?.schema_definition.fields);
    expect(after?.schema_definition.identity_opt_out).toEqual(
      before?.schema_definition.identity_opt_out
    );
    expect(after?.reducer_config).toEqual(before?.reducer_config);
    expect(after?.metadata).toEqual(before?.metadata);
    expect(after?.scope).toEqual(before?.scope);
  });

  it("forwards a standalone MCP declaration through the same service", async () => {
    const out = await server.executeToolForCli(
      "update_schema_incremental",
      {
        entity_type: TYPE,
        planning: { level: 31 },
      },
      USER
    );
    const result = JSON.parse(out.content[0]!.text);
    expect(result.success).toBe(true);
    expect((await schemaRegistry.loadActiveSchema(TYPE, USER))?.schema_definition.planning).toEqual(
      { level: 31 }
    );
  });

  it("forwards the actual CLI --planning request without reconstructing fields", async () => {
    const { stdout } = await execute(
      process.execPath,
      [
        "dist/cli/index.js",
        "--api-only",
        "--base-url",
        base,
        "schemas",
        "update",
        TYPE,
        "--planning",
        '{"level":33}',
        "--json",
      ],
      { env: { ...process.env, NEOTOMA_API_BASE_URL: base }, timeout: 15000 }
    );
    expect(JSON.parse(stdout).success).toBe(true);
    expect((await schemaRegistry.loadActiveSchema(TYPE, USER))?.schema_definition.planning).toEqual(
      { level: 33 }
    );
  });

  it("exposes the complete declared level set in compact REST and MCP catalogs", async () => {
    const response = await fetch(`${base}/schemas?summary=true&limit=5000&offset=0`);
    const rest = (await response.json()) as any;
    expect(rest.registry_coverage).toEqual({
      version: "1",
      state: "complete",
      source: "registry",
      reasons: [],
      total: rest.schemas.length,
      returned_count: rest.schemas.length,
      exhausted: true,
      scope: { owner: "authenticated", keyword: null, entity_type: null },
    });
    expect(rest.schemas.find((row: any) => row.entity_type === TYPE).planning).toEqual({
      level: 33,
    });
    expect(rest.schemas.find((row: any) => row.entity_type === UPPER).planning).toEqual({
      level: 888,
    });
    expect(rest.schemas.every((row: any) => !Object.hasOwn(row, "field_names"))).toBe(true);
    const out = await server.executeToolForCli("list_entity_types", { summary: true }, USER);
    const mcp = JSON.parse(out.content[0]!.text);
    expect(mcp.registry_coverage).toEqual(rest.registry_coverage);
    expect(mcp.entity_types.find((row: any) => row.entity_type === TYPE).planning).toEqual({
      level: 33,
    });
    expect(mcp.entity_types.find((row: any) => row.entity_type === UPPER).planning).toEqual({
      level: 888,
    });
    const { stdout } = await execute(
      process.execPath,
      [
        "dist/cli/index.js",
        "--api-only",
        "--base-url",
        base,
        "schemas",
        "list",
        "--summary",
        "--limit",
        "5000",
        "--json",
      ],
      { env: { ...process.env, NEOTOMA_API_BASE_URL: base }, timeout: 15000 }
    );
    const cli = JSON.parse(stdout);
    expect(cli.registry_coverage).toEqual(rest.registry_coverage);
    expect(cli.schemas.find((row: any) => row.entity_type === UPPER).planning).toEqual({
      level: 888,
    });
  });

  it("does not certify filtered or paginated catalogs as a complete level set", async () => {
    for (const query of ["summary=true&limit=1", `summary=true&limit=5000&entity_type=${TYPE}`]) {
      const response = await fetch(`${base}/schemas?${query}`);
      const result = (await response.json()) as any;
      expect(result.registry_coverage.state).toBe("unknown");
      expect(result.registry_coverage.exhausted).toBe(false);
      expect(result.registry_coverage.reasons.length).toBeGreaterThan(0);
    }
  });

  it("rejects malformed declarations with a structured hint and no new schema version", async () => {
    const before = await schemaRegistry.loadActiveSchema(TYPE, USER);
    const response = await fetch(`${base}/update_schema_incremental`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: TYPE, planning: { level: true } }),
    });
    expect(response.status).toBe(400);
    const result = (await response.json()) as any;
    expect(result.details.hint).toMatch(/finite number/);
    expect((await schemaRegistry.loadActiveSchema(TYPE, USER))?.schema_version).toBe(
      before?.schema_version
    );
  });

  it("resolves a scoped declaration consistently and does not select it for another principal", async () => {
    await seed(TYPE, 777, "user");
    const response = await fetch(`${base}/schemas?summary=true&limit=5000`);
    const result = (await response.json()) as any;
    expect(result.schemas.find((row: any) => row.entity_type === TYPE).planning).toEqual({
      level: 777,
    });
    expect(result.registry_coverage.state).toBe("complete");
    const other = await schemaRegistry.listEntityTypesResult(undefined, "another-synthetic-owner");
    expect(other.entity_types.find((row) => row.entity_type === TYPE)?.planning).toEqual({
      level: 33,
    });
  });
  it("registers valid planning and refuses malformed planning without writes on HTTP and MCP", async () => {
    for (const [surface, type] of [
      ["http", REGISTER_HTTP],
      ["mcp", REGISTER_MCP],
    ]) {
      const schema_definition = {
        fields,
        identity_opt_out: "heuristic_canonical_name",
        unrelated_declaration: { retained: true },
        planning: { level: -2.5, read_only: true },
      };
      const request = {
        entity_type: type,
        schema_definition,
        reducer_config: { merge_policies: {} },
        activate: true,
      };
      const invalid = {
        ...request,
        schema_definition: { ...schema_definition, planning: { level: "high" } },
      };
      if (surface === "http") {
        const response = await fetch(`${base}/register_schema`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(invalid),
        });
        expect(response.status).toBe(400);
        expect(((await response.json()) as any).details.hint).toMatch(/finite number/);
      } else {
        await expect(server.executeToolForCli("register_schema", invalid, USER)).rejects.toThrow(
          /planning/
        );
      }
      const before = await db.from("schema_registry").select("id").eq("entity_type", type);
      expect(before.error).toBeNull();
      expect(before.data).toEqual([]);
      if (surface === "http") {
        const response = await fetch(`${base}/register_schema`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        expect(response.status).toBe(200);
      } else {
        const response = await server.executeToolForCli("register_schema", request, USER);
        expect(JSON.parse(response.content[0]!.text).success).toBe(true);
      }
      expect((await schemaRegistry.loadActiveSchema(type, USER))?.schema_definition).toEqual(
        schema_definition
      );
    }
  });
});
