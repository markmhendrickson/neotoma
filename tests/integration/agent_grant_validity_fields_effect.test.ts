/**
 * Effect and parity coverage for the `agent_grant` schema change 1.0.0 -> 1.1.0.
 *
 * Version 1.1.0 declares two optional string fields, `valid_from` and
 * `valid_until`. Nothing reads them yet; what changes is STORAGE, and only
 * where 1.1.0 is the active schema. This file runs the same cases under each
 * schema version, explicitly, instead of branching on whichever schema the
 * test database happens to hold:
 *
 *   - under 1.0.0 (the pre-change definition): the fields are not declared, so
 *     raw writes do not put them in the snapshot and no timeline event derives;
 *   - under 1.1.0 (the code-defined definition): both fields are kept verbatim
 *     and unvalidated in the snapshot, and a date-shaped value derives a
 *     timeline event, exactly as `last_used_at` already does.
 *
 * Each case drives the surfaces in their natural call shapes (HTTP `/store`
 * and `/correct`, MCP `store` and `correct`, and the real CLI `store` and
 * `corrections create` run as a child process) and reads back through both HTTP
 * `GET /entities/:id` and MCP `retrieve_entity_snapshot`. In every case the
 * grant stays an ordinary legacy grant: a v1 capability is still refused and
 * confers no authority. The grants routes (`POST/PATCH /agents/grants`) do not
 * store these fields under either version.
 *
 * Schema versions are made active through USER-SPECIFIC registrations for the
 * local owner, which take precedence over the global row, so the shared global
 * schema is never modified.
 */

import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import {
  clearGrantCacheForTests,
  getGrant,
  lookupGrantForIdentity,
} from "../../src/services/agent_grants.js";
import { getEntityWithProvenance } from "../../src/services/entity_queries.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { ENTITY_SCHEMAS } from "../../src/services/schema_definitions.js";
import { cleanupTestEntities } from "../helpers/cleanup_helpers.js";

const OWNER = LOCAL_DEV_USER_ID;
const LEGACY_CAPS = [{ op: "retrieve", entity_types: ["task"] }];
const FROM = "2030-01-01T00:00:00Z";
const UNTIL = "2031-01-01T00:00:00Z";
const FROM_2 = "2030-06-01T00:00:00Z";
const UNTIL_2 = "2031-06-01T00:00:00Z";
const AGENT_SUB = "agent@example.com";
const AGENT_ISS = "https://agent.example.com";

type Version = "1.0.0" | "1.1.0";
type McpResult = { content: Array<{ text: string }> };

function thumbprint(): string {
  return randomBytes(32).toString("base64url");
}

/** The agent_grant definition as it was at `version`. */
function definitionAt(version: Version) {
  const code = ENTITY_SCHEMAS.agent_grant;
  const definition = structuredClone(code.schema_definition);
  const reducer = structuredClone(code.reducer_config);
  if (version === "1.0.0") {
    for (const field of ["valid_from", "valid_until"]) {
      delete definition.fields[field];
      delete reducer.merge_policies[field];
    }
  }
  return { definition, reducer };
}

let apiBase = "";
let cliHome = "";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TSX_BIN = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
const CLI_ENTRY = path.join(REPO_ROOT, "src", "cli", "index.ts");

/**
 * Run the real CLI from the reviewed source as a child process against the
 * suite's loopback server. Asynchronous, because this process hosts that
 * server. HOME points at an empty directory and transport/auth overrides from
 * the operator's environment are dropped, so only `--base-url` decides where
 * the command goes.
 */
/**
 * Names the CLI child must not inherit: transport and credential overrides, and
 * every AAuth / signing / key input the CLI reads, so a developer shell that
 * exports them cannot make the child sign loopback requests or pick another
 * server. The pattern covers future `NEOTOMA_AAUTH_*` / `NEOTOMA_CLI_AAUTH_*`
 * names; the list names the rest explicitly (found by grepping `src/cli`,
 * `src/shared` and `src/crypto` for `process.env.NEOTOMA_*`).
 */
const CLI_SCRUBBED_ENV_NAMES = [
  "NEOTOMA_BASE_URL",
  "NEOTOMA_BEARER_TOKEN",
  "NEOTOMA_USER_ID",
  "NEOTOMA_OFFLINE",
  "NEOTOMA_API_ONLY",
  "NEOTOMA_FORCE_LOCAL_TRANSPORT",
  "NEOTOMA_KEY_FILE_PATH",
  "NEOTOMA_MNEMONIC",
  "NEOTOMA_MNEMONIC_PASSPHRASE",
  "NEOTOMA_AAUTH_PRIVATE_JWK_PATH",
  "NEOTOMA_AAUTH_SUB",
  "NEOTOMA_AAUTH_ISS",
  "NEOTOMA_AAUTH_KID",
  "NEOTOMA_AAUTH_TOKEN_TTL_SEC",
  "NEOTOMA_CLI_AAUTH_ENABLE",
  "NEOTOMA_CLI_AAUTH_DISABLE",
  "NEOTOMA_CLI_AAUTH_SUB",
  "NEOTOMA_CLI_AAUTH_ISS",
  "NEOTOMA_CLI_AAUTH_KID",
  "NEOTOMA_CLI_AAUTH_TOKEN_TTL_SEC",
] as const;
const CLI_SCRUBBED_ENV_PATTERN = /^NEOTOMA_(CLI_)?AAUTH_/;

/** The environment the CLI child runs with: the parent's, minus the scrubbed names. */
function buildCliEnv(source: NodeJS.ProcessEnv, home: string): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = { ...source, HOME: home, USERPROFILE: home };
  for (const name of Object.keys(childEnv)) {
    if (
      (CLI_SCRUBBED_ENV_NAMES as readonly string[]).includes(name) ||
      CLI_SCRUBBED_ENV_PATTERN.test(name)
    ) {
      delete childEnv[name];
    }
  }
  return childEnv;
}

async function cli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const childEnv = buildCliEnv(process.env, cliHome);
  try {
    const { stdout, stderr } = await execFileAsync(
      TSX_BIN,
      [CLI_ENTRY, "--json", "--api-only", "--base-url", apiBase, ...args],
      { cwd: REPO_ROOT, env: childEnv, timeout: 120_000, maxBuffer: 16 * 1024 * 1024 }
    );
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: unknown; stdout?: string; stderr?: string };
    return {
      code: typeof e.code === "number" ? e.code : 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

async function http(path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let parsed: Record<string, any> = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}

function v1Capability(): Record<string, unknown> {
  return {
    op: "agent_capability_v1",
    capability_id: "cap-1",
    purpose: { name: "example_purpose", version: "1" },
    delegation_chain: [],
    param_constraints: {
      contract_version: 1,
      operation_ids: ["store"],
      owner: { user_id: OWNER },
      source_bytes: [{ sha256: "a".repeat(64), byte_length: 12, mime_type: "text/plain" }],
      sources: [],
      entities: {
        entity_type: "configuration",
        composite: { system: "example", key: "example" },
        bound_fields: { schema_version: 1 },
        max_observations: 10,
      },
    },
  };
}

describe("the CLI child environment cannot sign or redirect loopback requests", () => {
  const dummy = "/nonexistent/value";

  it("drops every AAuth, signing-key, credential and transport input, even when exported", () => {
    const source: NodeJS.ProcessEnv = { PATH: process.env.PATH, KEEP_ME: "yes" };
    for (const name of CLI_SCRUBBED_ENV_NAMES) source[name] = dummy;
    // A name the explicit list does not know, matched by the pattern.
    source.NEOTOMA_AAUTH_SOMETHING_NEW = dummy;
    source.NEOTOMA_CLI_AAUTH_SOMETHING_NEW = dummy;

    const child = buildCliEnv(source, "/tmp/empty-home");
    for (const name of CLI_SCRUBBED_ENV_NAMES) expect(child, name).not.toHaveProperty(name);
    expect(child).not.toHaveProperty("NEOTOMA_AAUTH_SOMETHING_NEW");
    expect(child).not.toHaveProperty("NEOTOMA_CLI_AAUTH_SOMETHING_NEW");
    // Unrelated variables and the isolated HOME survive.
    expect(child.KEEP_ME).toBe("yes");
    expect(child.HOME).toBe("/tmp/empty-home");
    expect(child.USERPROFILE).toBe("/tmp/empty-home");
    // The input was not mutated.
    expect(source.NEOTOMA_AAUTH_PRIVATE_JWK_PATH).toBe(dummy);
  });

  it("names the signing inputs the CLI actually reads", () => {
    const cliDir = path.join(REPO_ROOT, "src", "cli");
    const cliSources = readdirSync(cliDir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => readFileSync(path.join(cliDir, f), "utf-8"))
      .join("\n");
    const read = new Set(
      [...cliSources.matchAll(/process\.env\.(NEOTOMA_(?:CLI_)?AAUTH_[A-Z_]+)/g)].map((m) => m[1])
    );
    expect(read.size, "the CLI reads at least one AAuth variable").toBeGreaterThan(0);
    for (const name of read) {
      expect(
        (CLI_SCRUBBED_ENV_NAMES as readonly string[]).includes(name) ||
          CLI_SCRUBBED_ENV_PATTERN.test(name),
        `${name} is scrubbed from the CLI child`
      ).toBe(true);
    }
  });
});

describe("agent_grant schema versions: the code-defined schema is 1.1.0", () => {
  it("1.1.0 declares both validity fields as plain optional strings; 1.0.0 declared neither", () => {
    expect(ENTITY_SCHEMAS.agent_grant.schema_version).toBe("1.1.0");
    for (const field of ["valid_from", "valid_until"]) {
      expect(ENTITY_SCHEMAS.agent_grant.schema_definition.fields[field]).toEqual({
        type: "string",
        required: false,
      });
      expect(definitionAt("1.0.0").definition.fields[field]).toBeUndefined();
      expect(definitionAt("1.1.0").definition.fields[field]).toBeDefined();
    }
  });
});

describe("agent_grant validity fields: storage follows the active schema version", () => {
  let httpServer: ReturnType<typeof createServer>;
  let server: NeotomaServer;
  const created: string[] = [];
  /** Cells that actually ran, so the suite can require 1.1.0 coverage. */
  const ran = new Set<string>();

  const mcp = (name: "store" | "correct", params: Record<string, unknown>) =>
    (server as unknown as Record<string, (p: Record<string, unknown>) => Promise<McpResult>>)[name](
      params
    );
  const mcpExec = (name: string, params: Record<string, unknown>) =>
    (
      server as unknown as {
        executeTool: (n: string, p: Record<string, unknown>) => Promise<McpResult>;
      }
    ).executeTool(name, params);

  async function clearUserSchemas() {
    await db
      .from("schema_registry")
      .delete()
      .eq("entity_type", "agent_grant")
      .eq("scope", "user")
      .eq("user_id", OWNER);
  }

  async function activate(version: Version) {
    await clearUserSchemas();
    const { definition, reducer } = definitionAt(version);
    await schemaRegistry.register({
      entity_type: "agent_grant",
      schema_version: version,
      schema_definition: definition,
      reducer_config: reducer,
      user_specific: true,
      user_id: OWNER,
      activate: true,
    });
    const active = await schemaRegistry.loadActiveSchema("agent_grant", OWNER);
    // The version under test really is the one the write path will resolve.
    expect(active?.schema_version).toBe(version);
    expect(Boolean(active?.schema_definition.fields.valid_from)).toBe(version === "1.1.0");
  }

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = OWNER;
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("no listen address");
    apiBase = `http://127.0.0.1:${address.port}`;
    cliHome = await mkdtemp(path.join(tmpdir(), "neotoma-validity-cli-"));
  });

  afterEach(() => {
    clearGrantCacheForTests();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await cleanupTestEntities(created);
    await clearUserSchemas();
    if (cliHome) await rm(cliHome, { recursive: true, force: true });
  });

  /** Read the snapshot back through HTTP and through MCP; both must agree. */
  async function readBack(entityId: string) {
    const viaHttp = await http(`/entities/${entityId}`);
    expect(viaHttp.status).toBe(200);
    const httpSnapshot = (viaHttp.body.snapshot ?? viaHttp.body.entity?.snapshot) as Record<
      string,
      unknown
    >;
    const viaMcp = JSON.parse(
      (
        await mcpExec("retrieve_entity_snapshot", {
          entity_id: entityId,
          user_id: OWNER,
          format: "json",
        })
      ).content[0].text
    ) as Record<string, any>;
    const mcpSnapshot = (viaMcp.snapshot ?? viaMcp.entity?.snapshot) as Record<string, unknown>;
    expect(httpSnapshot, "HTTP read-back has a snapshot").toBeTruthy();
    expect(mcpSnapshot, "MCP read-back has a snapshot").toBeTruthy();
    expect(mcpSnapshot.valid_from).toEqual(httpSnapshot.valid_from);
    expect(mcpSnapshot.valid_until).toEqual(httpSnapshot.valid_until);
    return httpSnapshot;
  }

  async function timelineTypes(entityId: string): Promise<string[]> {
    const { data } = await db
      .from("timeline_events")
      .select("event_type")
      .eq("entity_id", entityId);
    return ((data ?? []) as Array<{ event_type: string }>).map((r) => r.event_type).sort();
  }

  const surfaces = [
    {
      name: "HTTP /store and /correct",
      derivesTimelineWithoutDeclaration: false,
      async store(tp: string, extra: Record<string, unknown>) {
        const { status, body } = await http("/store", {
          idempotency_key: `validity-http-${randomUUID()}`,
          entities: [
            {
              entity_type: "agent_grant",
              label: "validity-http",
              status: "active",
              capabilities: LEGACY_CAPS,
              match_thumbprint: tp,
              match_sub: AGENT_SUB,
              match_iss: AGENT_ISS,
              ...extra,
            },
          ],
        });
        expect(status).toBeLessThan(300);
        return (body.structured?.entities?.[0]?.entity_id ??
          body.entities?.[0]?.entity_id) as string;
      },
      async correct(entityId: string, field: string, value: unknown) {
        const { status } = await http("/correct", {
          entity_id: entityId,
          entity_type: "agent_grant",
          field,
          value,
          idempotency_key: `validity-http-correct-${randomUUID()}`,
        });
        expect(status).toBe(200);
      },
      async refuseV1(entityId: string) {
        const { status, body } = await http("/correct", {
          entity_id: entityId,
          entity_type: "agent_grant",
          field: "capabilities",
          value: [v1Capability()],
          idempotency_key: `validity-http-v1-${randomUUID()}`,
        });
        expect(status).toBe(400);
        expect(body.error_code).toBe("agent_grant_invalid");
        expect(body.message).toMatch(/capabilities\[0\]\.op/);
      },
    },
    {
      name: "MCP store and correct",
      derivesTimelineWithoutDeclaration: true,
      slow: false,
      async store(tp: string, extra: Record<string, unknown>) {
        const result = await mcp("store", {
          user_id: OWNER,
          idempotency_key: `validity-mcp-${randomUUID()}`,
          commit: true,
          entities: [
            {
              entity_type: "agent_grant",
              label: "validity-mcp",
              status: "active",
              capabilities: LEGACY_CAPS,
              match_thumbprint: tp,
              match_sub: AGENT_SUB,
              match_iss: AGENT_ISS,
              ...extra,
            },
          ],
        });
        return JSON.parse(result.content[0].text).entities[0].entity_id as string;
      },
      async correct(entityId: string, field: string, value: unknown) {
        await mcp("correct", {
          user_id: OWNER,
          entity_id: entityId,
          entity_type: "agent_grant",
          field,
          value,
          idempotency_key: `validity-mcp-correct-${randomUUID()}`,
        });
      },
      async refuseV1(entityId: string) {
        const err = await mcp("correct", {
          user_id: OWNER,
          entity_id: entityId,
          entity_type: "agent_grant",
          field: "capabilities",
          value: [v1Capability()],
          idempotency_key: `validity-mcp-v1-${randomUUID()}`,
        }).then(
          () => {
            throw new Error("expected MCP correct to refuse the v1 entry");
          },
          (e: unknown) => e as { code?: unknown; message?: string }
        );
        expect(err.code).toBe(-32603);
        expect(err.message).toMatch(/capabilities\[0\]\.op/);
      },
    },
    {
      name: "CLI store and corrections create",
      // Each CLI call starts a child process (tsx compile); give those cells room.
      slow: true,
      // The CLI forwards both commands to HTTP /store and /correct.
      derivesTimelineWithoutDeclaration: false,
      async store(tp: string, extra: Record<string, unknown>) {
        const entities = [
          {
            entity_type: "agent_grant",
            label: "validity-cli",
            status: "active",
            capabilities: LEGACY_CAPS,
            match_thumbprint: tp,
            match_sub: AGENT_SUB,
            match_iss: AGENT_ISS,
            ...extra,
          },
        ];
        const { code, stdout } = await cli([
          "store",
          "--entities",
          JSON.stringify(entities),
          "--idempotency-key",
          `validity-cli-${randomUUID()}`,
        ]);
        expect(code, stdout).toBe(0);
        const out = JSON.parse(stdout) as {
          structured?: { entities?: Array<{ entity_id?: string }> };
          entities?: Array<{ entity_id?: string }>;
        };
        return (out.structured?.entities?.[0]?.entity_id ?? out.entities?.[0]?.entity_id) as string;
      },
      async correct(entityId: string, field: string, value: unknown) {
        const { code, stdout } = await cli([
          "corrections",
          "create",
          "--entity-id",
          entityId,
          "--entity-type",
          "agent_grant",
          "--field-name",
          field,
          "--corrected-value",
          typeof value === "string" ? value : JSON.stringify(value),
          "--idempotency-key",
          `validity-cli-correct-${randomUUID()}`,
        ]);
        expect(code, stdout).toBe(0);
      },
      async refuseV1(entityId: string) {
        const { code, stdout, stderr } = await cli([
          "corrections",
          "create",
          "--entity-id",
          entityId,
          "--entity-type",
          "agent_grant",
          "--field-name",
          "capabilities",
          "--corrected-value",
          JSON.stringify([v1Capability()]),
          "--idempotency-key",
          `validity-cli-v1-${randomUUID()}`,
        ]);
        // The CLI reports HTTP's refusal as a generic failure; the exit code
        // is the contract here, and legacyCheck() proves nothing changed. The
        // message pins the failure to the /correct call, not argument parsing.
        expect(code).not.toBe(0);
        expect(`${stdout}\n${stderr}`).toMatch(/Failed to create correction/);
      },
    },
  ];

  for (const version of ["1.0.0", "1.1.0"] as const) {
    describe(`active schema ${version}`, () => {
      beforeAll(async () => {
        await activate(version);
      });

      for (const surface of surfaces) {
        it(
          `${surface.name}: both fields ${version === "1.1.0" ? "are kept verbatim" : "are not stored"}, on store and on correction, as read back through HTTP and MCP`,
          async () => {
            const tp = thumbprint();
            const entityId = await surface.store(tp, { valid_from: FROM, valid_until: UNTIL });
            expect(entityId).toBeTruthy();
            created.push(entityId);

            // The grant is an ordinary legacy grant in every case.
            const legacyCheck = async () => {
              expect((await getGrant(OWNER, entityId))?.capabilities).toEqual(LEGACY_CAPS);
              clearGrantCacheForTests();
              const lookup = await lookupGrantForIdentity({
                sub: AGENT_SUB,
                iss: AGENT_ISS,
                thumbprint: tp,
              });
              expect(lookup.grant?.grant_id).toBe(entityId);
              expect(lookup.grant?.capabilities).toEqual(LEGACY_CAPS);
            };

            let snapshot = await readBack(entityId);
            const events = await timelineTypes(entityId);
            if (version === "1.1.0") {
              expect(snapshot.valid_from).toBe(FROM);
              expect(snapshot.valid_until).toBe(UNTIL);
              // Documented effect: a date-shaped value derives a timeline event
              // (generic heuristic, as last_used_at already does).
              expect(events).toEqual(["ValidFrom", "ValidUntil"]);
            } else {
              expect(snapshot).not.toHaveProperty("valid_from");
              expect(snapshot).not.toHaveProperty("valid_until");
              // Pre-existing and independent of 1.1.0: the MCP store path derives
              // timeline events from the submitted fields even when the active
              // schema does not declare them; the HTTP /store path does not.
              expect(events).toEqual(
                surface.derivesTimelineWithoutDeclaration ? ["ValidFrom", "ValidUntil"] : []
              );
            }
            await legacyCheck();

            // Correction, one field at a time, in this surface's natural shape.
            await surface.correct(entityId, "valid_from", FROM_2);
            await surface.correct(entityId, "valid_until", UNTIL_2);
            snapshot = await readBack(entityId);
            if (version === "1.1.0") {
              expect(snapshot.valid_from).toBe(FROM_2);
              expect(snapshot.valid_until).toBe(UNTIL_2);
            } else {
              expect(snapshot).not.toHaveProperty("valid_from");
              expect(snapshot).not.toHaveProperty("valid_until");
            }
            await legacyCheck();

            // The stored fields never turn into v1 authority: a v1 capability is
            // still refused on this surface and the grant is unchanged.
            await surface.refuseV1(entityId);
            await legacyCheck();
            ran.add(`${version}:${surface.name}`);
          },
          surface.slow ? 300_000 : undefined
        );
      }

      it("the grants routes do not store or enforce the validity fields", async () => {
        const tp = thumbprint();
        const { status, body } = await http("/agents/grants", {
          label: "validity-routes",
          capabilities: LEGACY_CAPS,
          match_thumbprint: tp,
          valid_from: FROM,
          valid_until: UNTIL,
        });
        expect(status).toBe(201);
        const grantId = body.grant.grant_id as string;
        created.push(grantId);
        expect(body.grant).not.toHaveProperty("valid_from");
        expect(body.grant).not.toHaveProperty("valid_until");
        const snapshot = (await getEntityWithProvenance(grantId))?.snapshot ?? {};
        expect(snapshot).not.toHaveProperty("valid_from");
        expect(snapshot).not.toHaveProperty("valid_until");

        const patched = await http(
          `/agents/grants/${grantId}`,
          { valid_from: FROM_2, valid_until: UNTIL_2, label: "validity-routes-2" },
          "PATCH"
        );
        expect(patched.status).toBe(200);
        const after = (await getEntityWithProvenance(grantId))?.snapshot ?? {};
        expect(after.label).toBe("validity-routes-2");
        expect(after).not.toHaveProperty("valid_from");
        expect(after).not.toHaveProperty("valid_until");
      });

      it("a garbage value is kept verbatim and unvalidated under 1.1.0, absent under 1.0.0", async () => {
        const tp = thumbprint();
        const entityId = await surfaces[0].store(tp, {
          valid_from: "not-a-date",
          valid_until: 12345,
        });
        created.push(entityId);
        const snapshot = await readBack(entityId);
        if (version === "1.1.0") {
          expect(snapshot.valid_from).toBe("not-a-date");
          expect(snapshot.valid_until).toBe(12345);
        } else {
          expect(snapshot).not.toHaveProperty("valid_from");
          expect(snapshot).not.toHaveProperty("valid_until");
        }
        // Nothing reads the fields: still an ordinary legacy grant.
        expect((await getGrant(OWNER, entityId))?.capabilities).toEqual(LEGACY_CAPS);
      });
    });
  }

  it("every surface was exercised under both 1.0.0 and 1.1.0 (1.1.0 coverage is required)", () => {
    for (const version of ["1.0.0", "1.1.0"]) {
      for (const surface of surfaces) {
        expect(ran.has(`${version}:${surface.name}`), `${version} ${surface.name}`).toBe(true);
      }
    }
  });
});
