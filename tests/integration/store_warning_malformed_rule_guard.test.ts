/**
 * Regression test for the store_warnings malformed-rule guard (skill store 500).
 *
 * Bug: the store path evaluated each `store_warnings` rule with
 * `rule.fields.some(...)`. A rule stored in a legacy/malformed shape — no
 * `fields` array (e.g. a `condition`-shaped entry like
 * `{ code, message, condition: { missing_all_of: ["content"] } }`) — caused
 * `undefined.some` to throw, 500-ing the entire store call. This was observed
 * on the `skill` entity type, whose DB-stored schema carried a
 * `condition`-shaped store_warnings entry, making store() of ANY skill
 * entity fail.
 *
 * Fix: skip any rule whose `fields` is not a non-empty array (src/actions.ts,
 * src/server.ts).
 *
 * This suite drives the real store call sites across all three exposed
 * surfaces — storeStructuredForApi (API path, also reached by MCP's
 * NeotomaServer.store which delegates internally), the real Express HTTP
 * route (POST /store), and the CLI's `store` command over a child process —
 * against a schema seeded with the real condition-shaped malformed rule,
 * mirroring the entity type's actual DB-stored schema. It asserts the
 * reported effect: store() of an entity under the malformed schema resolves
 * instead of throwing "Cannot read properties of undefined (reading 'some')",
 * AND that the entity is actually created and retrievable with its stored
 * field values intact (neotoma#2165 policy
 * fixed_means_behavior_verified_not_contract_accepted, ent_db0b7855d47012084477fb00) —
 * a 200/success response alone is not sufficient.
 *
 * Cross-surface parity (neotoma#2165 acceptance criteria; policy
 * cross_surface_contract_parity_tested_all_surfaces, ent_2ad0677fe23c0c1878ae43e8):
 * MCP, HTTP, and CLI must all show the same success effect for the same
 * malformed-schema payload. See the "cross-surface parity" describe block.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { storeStructuredForApi } from "../../src/actions.js";
import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { db } from "../../src/db.js";
import { cleanupEntityType, cleanupTestSchema } from "../helpers/cleanup_helpers.js";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";

/**
 * Environment the CLI child process must run under for its effect assertions
 * to mean anything.
 *
 * The CLI resolves its database through `src/config.ts`, which falls back to
 * `~/.config/neotoma/.env` (and thence to a machine-local data directory)
 * whenever `NEOTOMA_DATA_DIR` is not already set in the process env. The test
 * worker happens to inherit `NEOTOMA_DATA_DIR` from `vitest.global_setup.ts`,
 * so `exec` has been passing it to the child implicitly — but that is an
 * unstated precondition, not a guarantee. Where the inheritance does not hold
 * (a runner that sanitizes the child env, or this file driven outside the
 * configured global setup), the CLI child writes to the operator's own
 * machine-local database while `readSnapshotFields` reads the test one, and
 * the read-back fails for a reason that has nothing to do with the guard
 * under test. Worse, it can PASS on residue left in that machine-local
 * database by an earlier run, making the result evidence about the runner
 * rather than about the code.
 *
 * So pass the data directory explicitly, and fail loudly here if it is not
 * resolvable, rather than letting the child silently pick a different
 * database. Per neotoma#2165 policy
 * fixed_means_behavior_verified_not_contract_accepted
 * (ent_db0b7855d47012084477fb00), a test whose outcome depends on which
 * instance it points at is not effect-verified.
 */
function cliEnv(): NodeJS.ProcessEnv {
  const dataDir = process.env.NEOTOMA_DATA_DIR;
  if (!dataDir?.trim()) {
    throw new Error(
      "NEOTOMA_DATA_DIR is not set in this test process, so the CLI child would " +
        "resolve a different database than these assertions read. Run this suite " +
        "through the configured vitest setup (npm run test:contract-parity), or set " +
        "NEOTOMA_DATA_DIR explicitly."
    );
  }
  return {
    ...process.env,
    NEOTOMA_DATA_DIR: dataDir,
    // `src/config.ts` keys its env-file loading off NEOTOMA_ENV (not NODE_ENV);
    // pin it so the child cannot load a production env file and repoint itself.
    NEOTOMA_ENV: process.env.NEOTOMA_ENV || "development",
  };
}

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const ENTITY_TYPE = "store_warning_malformed_rule_guard_test_skill";

// Faithful reproduction of the legacy, malformed `condition`-shaped
// store_warnings entry observed on the `skill` entity type's DB-stored
// schema: no `fields` array, a `condition` key instead. Cast through
// `unknown` because the TS type requires `fields`; the bug is precisely
// that malformed rows bypassing that type can already exist in the DB.
const MALFORMED_STORE_WARNINGS_RULE = {
  code: "MISSING_CONTENT_FIELD",
  message: "skill has no content body.",
  condition: { missing_all_of: ["content"] },
} as unknown as { code: string; fields: string[]; message: string };

/** Read back an entity's persisted snapshot fields directly from the DB. */
async function readSnapshotFields(entityId: string): Promise<Record<string, unknown>> {
  const { data, error } = await db
    .from("entity_snapshots")
    .select("snapshot, entity_type")
    .eq("entity_id", entityId)
    .maybeSingle();
  expect(error).toBeNull();
  expect(data).toBeTruthy();
  const raw = (data as { snapshot: unknown } | null)?.snapshot;
  return typeof raw === "string" ? JSON.parse(raw) : ((raw as Record<string, unknown>) ?? {});
}

describe("store_warnings malformed-rule guard (issue: skill store 500)", () => {
  beforeAll(async () => {
    if (!(await schemaRegistry.loadActiveSchema(ENTITY_TYPE, TEST_USER_ID))) {
      await schemaRegistry.register({
        entity_type: ENTITY_TYPE,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            name: { type: "string", required: false },
            content: { type: "string", required: false },
          },
          identity_opt_out: "heuristic_canonical_name",
          store_warnings: [MALFORMED_STORE_WARNINGS_RULE],
        },
        reducer_config: { merge_policies: {} },
        user_id: TEST_USER_ID,
        user_specific: true,
        activate: true,
      });
    }
  });

  afterAll(async () => {
    await cleanupEntityType(ENTITY_TYPE, TEST_USER_ID);
    await cleanupTestSchema(ENTITY_TYPE, TEST_USER_ID);
  });

  it("API path (storeStructuredForApi) resolves without throwing on the malformed rule", async () => {
    const result = await storeStructuredForApi({
      userId: TEST_USER_ID,
      entities: [
        {
          entity_type: ENTITY_TYPE,
          name: `api-store-${randomUUID()}`,
        },
      ],
      sourcePriority: 100,
      idempotencyKey: `malformed-rule-guard-api-${randomUUID()}`,
    });

    expect(result.entities.length).toBeGreaterThan(0);
  });

  it("MCP path (NeotomaServer.store) resolves without throwing on the malformed rule", async () => {
    const server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;

    const storeMethod = (
      server as unknown as {
        store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
      }
    ).store.bind(server);

    const result = await storeMethod({
      user_id: TEST_USER_ID,
      idempotency_key: `malformed-rule-guard-mcp-${randomUUID()}`,
      entities: [
        {
          entity_type: ENTITY_TYPE,
          name: `mcp-store-${randomUUID()}`,
        },
      ],
    });

    expect(result.content.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------
  // Effect verification (neotoma#2165 acceptance criteria; policy
  // fixed_means_behavior_verified_not_contract_accepted, ent_db0b7855d47012084477fb00):
  // a success response is not sufficient — the entity must actually be
  // created and its content field retrievable with the value that was sent.
  // ---------------------------------------------------------------------
  describe("effect verification: entity is actually created and retrievable", () => {
    it("MCP store() of a skill-shaped entity WITH content persists the content field", async () => {
      const server = new NeotomaServer();
      (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;
      const storeMethod = (
        server as unknown as {
          store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
        }
      ).store.bind(server);

      const probeName = `mcp-effect-${randomUUID()}`;
      const result = await storeMethod({
        user_id: TEST_USER_ID,
        idempotency_key: `malformed-rule-guard-mcp-effect-${randomUUID()}`,
        entities: [
          {
            entity_type: ENTITY_TYPE,
            name: probeName,
            content: "probe body",
          },
        ],
      });

      const parsed = JSON.parse(result.content[0]!.text) as {
        entities: Array<{ entity_id?: string; id?: string }>;
      };
      const entityId = parsed.entities[0]?.entity_id ?? parsed.entities[0]?.id;
      expect(entityId).toBeTruthy();

      const snapshotFields = await readSnapshotFields(entityId as string);
      expect(snapshotFields.name).toBe(probeName);
      expect(snapshotFields.content).toBe("probe body");
    });
  });

  // ---------------------------------------------------------------------
  // Cross-surface parity (neotoma#2165 acceptance criteria; policy
  // cross_surface_contract_parity_tested_all_surfaces, ent_2ad0677fe23c0c1878ae43e8):
  // MCP `store`, HTTP `POST /store`, and CLI `neotoma store` must show the
  // SAME success effect for the same reporter-shaped payload against a
  // schema carrying the malformed rule.
  // ---------------------------------------------------------------------
  describe("cross-surface parity: MCP, HTTP, and CLI all succeed identically", () => {
    const API_PORT = 18173;
    const API_BASE = `http://127.0.0.1:${API_PORT}`;
    let httpServer: ReturnType<typeof createServer>;

    beforeAll(async () => {
      httpServer = createServer(app);
      await new Promise<void>((resolve, reject) => {
        httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
        httpServer.once("error", reject);
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    it("HTTP POST /store: 200, not 500, error_code is never DB_QUERY_FAILED, entity created and retrievable", async () => {
      const probeName = `http-parity-${randomUUID()}`;
      const resp = await fetch(`${API_BASE}/store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: TEST_USER_ID,
          idempotency_key: `malformed-rule-guard-http-${randomUUID()}`,
          entities: [
            {
              entity_type: ENTITY_TYPE,
              name: probeName,
              content: "probe body",
            },
          ],
        }),
      });

      expect(resp.status).toBe(200);
      const body = (await resp.json()) as {
        error_code?: string;
        entities?: Array<{ entity_id?: string; id?: string }>;
      };
      expect(body.error_code).toBeUndefined();
      expect(Array.isArray(body.entities)).toBe(true);
      expect(body.entities!.length).toBeGreaterThan(0);

      const entityId = body.entities![0]!.entity_id ?? body.entities![0]!.id;
      expect(entityId).toBeTruthy();

      const snapshotFields = await readSnapshotFields(entityId as string);
      expect(snapshotFields.name).toBe(probeName);
      expect(snapshotFields.content).toBe("probe body");
    });

    it("CLI `neotoma store --entities`: exit 0, entity created and retrievable", async () => {
      const probeName = `cli-parity-${randomUUID()}`;
      const entitiesJson = JSON.stringify([
        {
          entity_type: ENTITY_TYPE,
          name: probeName,
          content: "probe body",
        },
      ]).replace(/"/g, '\\"');

      const { stdout, stderr } = await execAsync(
        `${CLI_PATH} store --entities "${entitiesJson}" --user-id "${TEST_USER_ID}" --idempotency-key "malformed-rule-guard-cli-${randomUUID()}" --json`,
        { env: cliEnv() }
      );

      // The CLI writes environment-dependent advisory lines to stderr on
      // first run (e.g. "Saved repo path", "Saved Neotoma path to config") —
      // present on a clean runner with no existing config (CI), absent on a
      // machine that already has one. Asserting stderr is empty after
      // stripping a fixed list of known-benign strings is a maintenance trap
      // (breaks on every new advisory line) and doesn't test what this test
      // is named for. execAsync already throws on a non-zero exit, so what
      // actually matters here is: no real failure signal reached stderr, and
      // the effect assertions below (stdout parses, entity exists, snapshot
      // read-back matches) hold.
      expect(stderr).not.toMatch(/error|exception|fail(ed)?|TypeError/i);

      const result = JSON.parse(stdout) as {
        entities?: Array<{ entity_id?: string; id?: string }>;
      };
      expect(Array.isArray(result.entities)).toBe(true);
      expect(result.entities!.length).toBeGreaterThan(0);

      const entityId = result.entities![0]!.entity_id ?? result.entities![0]!.id;
      expect(entityId).toBeTruthy();

      const snapshotFields = await readSnapshotFields(entityId as string);
      expect(snapshotFields.name).toBe(probeName);
      expect(snapshotFields.content).toBe("probe body");
    });

    it("parity: MCP, HTTP, and CLI store the identical payload with the identical effect (no surface diverges)", async () => {
      const commonPayload = (probeName: string) => ({
        entity_type: ENTITY_TYPE,
        name: probeName,
        content: "cross-surface parity probe",
      });

      // MCP
      const mcpProbeName = `parity-mcp-${randomUUID()}`;
      const server = new NeotomaServer();
      (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;
      const storeMethod = (
        server as unknown as {
          store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
        }
      ).store.bind(server);
      const mcpResult = await storeMethod({
        user_id: TEST_USER_ID,
        idempotency_key: `parity-mcp-${randomUUID()}`,
        entities: [commonPayload(mcpProbeName)],
      });
      const mcpParsed = JSON.parse(mcpResult.content[0]!.text) as {
        entities: Array<{ entity_id?: string; id?: string }>;
      };
      const mcpEntityId = mcpParsed.entities[0]?.entity_id ?? mcpParsed.entities[0]?.id;

      // HTTP
      const httpProbeName = `parity-http-${randomUUID()}`;
      const httpResp = await fetch(`${API_BASE}/store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: TEST_USER_ID,
          idempotency_key: `parity-http-${randomUUID()}`,
          entities: [commonPayload(httpProbeName)],
        }),
      });
      const httpBody = (await httpResp.json()) as {
        error_code?: string;
        entities?: Array<{ entity_id?: string; id?: string }>;
      };
      const httpEntityId = httpBody.entities?.[0]?.entity_id ?? httpBody.entities?.[0]?.id;

      // CLI
      const cliProbeName = `parity-cli-${randomUUID()}`;
      const entitiesJson = JSON.stringify([commonPayload(cliProbeName)]).replace(/"/g, '\\"');
      const { stdout: cliStdout } = await execAsync(
        `${CLI_PATH} store --entities "${entitiesJson}" --user-id "${TEST_USER_ID}" --idempotency-key "parity-cli-${randomUUID()}" --json`,
        { env: cliEnv() }
      );
      const cliResult = JSON.parse(cliStdout) as {
        entities?: Array<{ entity_id?: string; id?: string }>;
      };
      const cliEntityId = cliResult.entities?.[0]?.entity_id ?? cliResult.entities?.[0]?.id;

      // Same success effect on all three surfaces: no throw, no 5xx, entity created.
      expect(httpResp.status).toBe(200);
      expect(httpBody.error_code).toBeUndefined();
      expect(mcpEntityId).toBeTruthy();
      expect(httpEntityId).toBeTruthy();
      expect(cliEntityId).toBeTruthy();

      const [mcpFields, httpFields, cliFields] = await Promise.all([
        readSnapshotFields(mcpEntityId as string),
        readSnapshotFields(httpEntityId as string),
        readSnapshotFields(cliEntityId as string),
      ]);
      expect(mcpFields.content).toBe("cross-surface parity probe");
      expect(httpFields.content).toBe("cross-surface parity probe");
      expect(cliFields.content).toBe("cross-surface parity probe");
    });
  });

  // ---------------------------------------------------------------------
  // Control case (neotoma#2165 acceptance criteria): a type with NO
  // store_warnings block at all must still work — the guard must not
  // require every type to declare store_warnings.
  // ---------------------------------------------------------------------
  describe("control: reference_note (no store_warnings declared) still stores 200", () => {
    it("stores a reference_note with title+content successfully", async () => {
      const result = await storeStructuredForApi({
        userId: TEST_USER_ID,
        entities: [
          {
            entity_type: "reference_note",
            title: `control-${randomUUID()}`,
            content: "control body",
          },
        ],
        sourcePriority: 100,
        idempotencyKey: `malformed-rule-guard-control-${randomUUID()}`,
      });

      expect(result.entities.length).toBeGreaterThan(0);
      const entityId =
        (result.entities[0] as { entity_id?: string; id?: string }).entity_id ??
        (result.entities[0] as { entity_id?: string; id?: string }).id;
      expect(entityId).toBeTruthy();

      await cleanupEntityType("reference_note", TEST_USER_ID).catch(() => {
        // best-effort; reference_note is a shared type, only clean up if scoped by user_id
      });
    });
  });

  // ---------------------------------------------------------------------
  // skill-shaped entity WITHOUT content: must not 500. Must succeed with
  // a MISSING_CONTENT_FIELD-style warning (from the separate content_field
  // branch, per PR #1942's own notes — the redundant condition-shaped rule
  // is skipped, but content_field still fires the warning), never a
  // TypeError.
  // ---------------------------------------------------------------------
  describe("skill-shaped entity stored WITHOUT content", () => {
    const CONTENT_FIELD_ENTITY_TYPE = "store_warning_malformed_rule_guard_test_skill_cf";

    beforeAll(async () => {
      if (!(await schemaRegistry.loadActiveSchema(CONTENT_FIELD_ENTITY_TYPE, TEST_USER_ID))) {
        await schemaRegistry.register({
          entity_type: CONTENT_FIELD_ENTITY_TYPE,
          schema_version: "1.0",
          schema_definition: {
            fields: {
              name: { type: "string", required: false },
              content: { type: "string", required: false },
            },
            identity_opt_out: "heuristic_canonical_name",
            content_field: "content",
            store_warnings: [MALFORMED_STORE_WARNINGS_RULE],
          },
          reducer_config: { merge_policies: {} },
          user_id: TEST_USER_ID,
          user_specific: true,
          activate: true,
        });
      }
    });

    afterAll(async () => {
      await cleanupEntityType(CONTENT_FIELD_ENTITY_TYPE, TEST_USER_ID);
      await cleanupTestSchema(CONTENT_FIELD_ENTITY_TYPE, TEST_USER_ID);
    });

    it("does not 500/throw, succeeds, entity is created and retrievable without content", async () => {
      const probeName = `no-content-${randomUUID()}`;
      const result = await storeStructuredForApi({
        userId: TEST_USER_ID,
        entities: [
          {
            entity_type: CONTENT_FIELD_ENTITY_TYPE,
            name: probeName,
          },
        ],
        sourcePriority: 100,
        idempotencyKey: `malformed-rule-guard-no-content-${randomUUID()}`,
      });

      expect(result.entities.length).toBeGreaterThan(0);
      const entityId =
        (result.entities[0] as { entity_id?: string; id?: string }).entity_id ??
        (result.entities[0] as { entity_id?: string; id?: string }).id;
      expect(entityId).toBeTruthy();

      const snapshotFields = await readSnapshotFields(entityId as string);
      expect(snapshotFields.name).toBe(probeName);
      expect(snapshotFields.content == null || snapshotFields.content === "").toBe(true);

      // MISSING_CONTENT_FIELD warning must be present, sourced from the
      // content_field branch (the malformed condition-shaped rule is
      // skipped by the guard and never evaluated).
      const warnings = (
        result as unknown as {
          store_warnings?: Array<{ code: string; entity_id: string }>;
        }
      ).store_warnings;
      expect(warnings).toBeDefined();
      const warningForEntity = warnings?.find((w) => w.entity_id === entityId);
      expect(warningForEntity?.code).toBe("MISSING_CONTENT_FIELD");
    });

    it("HTTP POST /store: skill-shaped entity without content is 200, not 500, error_code is not DB_QUERY_FAILED", async () => {
      const probeName = `no-content-http-${randomUUID()}`;
      // Reuse the same running httpServer from the parity describe block is
      // not possible here as it's scoped to that block; stand up an
      // independent one for this isolated assertion.
      const port = 18174;
      const server = createServer(app);
      await new Promise<void>((resolve, reject) => {
        server.listen(port, "127.0.0.1", () => resolve());
        server.once("error", reject);
      });

      try {
        const resp = await fetch(`http://127.0.0.1:${port}/store`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: TEST_USER_ID,
            idempotency_key: `no-content-http-${randomUUID()}`,
            entities: [
              {
                entity_type: CONTENT_FIELD_ENTITY_TYPE,
                name: probeName,
              },
            ],
          }),
        });

        // EDGE-1 (neotoma#2165 QA plan): the field is not `required`, so the
        // entity must PERSIST with 200 + the warning — never a 4xx and never
        // a crash. "No crash alone is not sufficient" per the QA plan, so
        // assert the warning code explicitly, not just its absence of error.
        expect(resp.status).toBe(200);
        const body = (await resp.json()) as {
          error_code?: string;
          entities?: Array<{ entity_id?: string; id?: string }>;
          store_warnings?: Array<{ code: string; entity_id?: string }>;
        };
        expect(body.error_code).toBeUndefined();
        expect(body.entities?.length).toBeGreaterThan(0);
        const entityId = body.entities?.[0]?.entity_id ?? body.entities?.[0]?.id;
        const warningForEntity = body.store_warnings?.find((w) => w.entity_id === entityId);
        expect(warningForEntity?.code).toBe("MISSING_CONTENT_FIELD");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    // EDGE-2 (neotoma#2165 QA plan): content present but an empty string.
    // Arch's decision states truthiness covers undefined/null/"" — empty
    // string DOES fire MISSING_CONTENT_FIELD, same as absent content.
    it("EDGE-2: content as an empty string fires MISSING_CONTENT_FIELD, same as absent content", async () => {
      const probeName = `empty-content-${randomUUID()}`;
      const result = await storeStructuredForApi({
        userId: TEST_USER_ID,
        entities: [
          {
            entity_type: CONTENT_FIELD_ENTITY_TYPE,
            name: probeName,
            content: "",
          },
        ],
        sourcePriority: 100,
        idempotencyKey: `malformed-rule-guard-empty-content-${randomUUID()}`,
      });

      expect(result.entities.length).toBeGreaterThan(0);
      const entityId =
        (result.entities[0] as { entity_id?: string; id?: string }).entity_id ??
        (result.entities[0] as { entity_id?: string; id?: string }).id;
      expect(entityId).toBeTruthy();

      const snapshotFields = await readSnapshotFields(entityId as string);
      expect(snapshotFields.name).toBe(probeName);

      const warnings = (
        result as unknown as {
          store_warnings?: Array<{ code: string; entity_id: string }>;
        }
      ).store_warnings;
      const warningForEntity = warnings?.find((w) => w.entity_id === entityId);
      expect(warningForEntity?.code).toBe("MISSING_CONTENT_FIELD");
    });
  });

  // ---------------------------------------------------------------------
  // Second entity type declaring store_warnings (neotoma#2165 acceptance
  // criterion: "at least one other entity type that declares store_warnings
  // can be stored without this TypeError"). Waxwing's arch section names
  // `product_feedback` (schema_definitions.ts: a well-formed `fields`-shaped
  // rule, code MISSING_IDENTITY_FIELDS) as the confirmed second type.
  //
  // This block deliberately does NOT store a real `product_feedback` entity.
  // `product_feedback`'s ACTIVE schema is whatever the instance under test
  // holds, not what `schema_definitions.ts` declares: the seeded local test
  // DB carries schema_version 1.0 WITH the store_warnings rule, while a
  // long-lived instance carries a later version (observed: 1.21.0, 35
  // fields) with NO store_warnings block at all — the rule having been
  // dropped by subsequent schema evolution. Asserting MISSING_IDENTITY_FIELDS
  // against the bare type therefore passes or fails according to which
  // database the process resolves, which is an unstated precondition living
  // in the environment rather than in the test. That is precisely what
  // policy fixed_means_behavior_verified_not_contract_accepted
  // (ent_db0b7855d47012084477fb00) excludes: a green result that is evidence
  // about the runner, not about the code.
  //
  // So the precondition is seeded here instead. This suite owns a second
  // entity type whose schema declares the canonical well-formed
  // `fields`-shaped rule verbatim as `product_feedback` declares it, and
  // asserts the fire/suppress behaviour against that. The assertion is
  // unchanged in substance — a well-formed rule still fires when no listed
  // field is present and stays silent when one is — but its outcome now
  // depends only on this file.
  // ---------------------------------------------------------------------
  describe("second store_warnings-declaring type: well-formed fields-shaped rule", () => {
    const WELL_FORMED_ENTITY_TYPE = "store_warning_malformed_rule_guard_test_wellformed";

    // Byte-for-byte the rule `product_feedback` declares in
    // src/services/schema_definitions.ts, so this fixture tracks the shape
    // arch's ruling names rather than a paraphrase of it.
    const WELL_FORMED_STORE_WARNINGS_RULE = {
      code: "MISSING_IDENTITY_FIELDS",
      fields: ["feedback_source", "reporter_email", "reporter_name", "reporter_id"],
      message:
        "product_feedback stored without identity fields " +
        "(feedback_source, reporter_email, reporter_name, reporter_id); " +
        "consider adding at least one to distinguish internal from external feedback",
    };

    beforeAll(async () => {
      if (!(await schemaRegistry.loadActiveSchema(WELL_FORMED_ENTITY_TYPE, TEST_USER_ID))) {
        await schemaRegistry.register({
          entity_type: WELL_FORMED_ENTITY_TYPE,
          schema_version: "1.0",
          schema_definition: {
            fields: {
              title: { type: "string", required: false },
              content: { type: "string", required: false },
              feedback_source: { type: "string", required: false },
              reporter_email: { type: "string", required: false },
              reporter_name: { type: "string", required: false },
              reporter_id: { type: "string", required: false },
            },
            identity_opt_out: "heuristic_canonical_name",
            store_warnings: [WELL_FORMED_STORE_WARNINGS_RULE],
          },
          reducer_config: { merge_policies: {} },
          user_id: TEST_USER_ID,
          user_specific: true,
          activate: true,
        });
      }
    });

    afterAll(async () => {
      await cleanupEntityType(WELL_FORMED_ENTITY_TYPE, TEST_USER_ID);
      await cleanupTestSchema(WELL_FORMED_ENTITY_TYPE, TEST_USER_ID);
    });

    it("stores cleanly and fires MISSING_IDENTITY_FIELDS when no identity field is present", async () => {
      const result = await storeStructuredForApi({
        userId: TEST_USER_ID,
        entities: [
          {
            entity_type: WELL_FORMED_ENTITY_TYPE,
            content: `well-formed rule probe ${randomUUID()}`,
          },
        ],
        sourcePriority: 100,
        idempotencyKey: `well-formed-probe-${randomUUID()}`,
      });

      expect(result.entities.length).toBeGreaterThan(0);
      const warnings = (
        result as unknown as {
          store_warnings?: Array<{ code: string }>;
        }
      ).store_warnings;
      expect(warnings?.some((w) => w.code === "MISSING_IDENTITY_FIELDS")).toBe(true);
    });

    it("stores cleanly and does NOT fire MISSING_IDENTITY_FIELDS when an identity field is present", async () => {
      const result = await storeStructuredForApi({
        userId: TEST_USER_ID,
        entities: [
          {
            entity_type: WELL_FORMED_ENTITY_TYPE,
            content: `well-formed rule probe with identity ${randomUUID()}`,
            feedback_source: "internal",
          },
        ],
        sourcePriority: 100,
        idempotencyKey: `well-formed-probe-identity-${randomUUID()}`,
      });

      expect(result.entities.length).toBeGreaterThan(0);
      const warnings = (
        result as unknown as {
          store_warnings?: Array<{ code: string }>;
        }
      ).store_warnings;
      expect(warnings?.some((w) => w.code === "MISSING_IDENTITY_FIELDS")).toBeFalsy();
    });
  });

  // ---------------------------------------------------------------------
  // Control case for the ACTIVE-schema hazard above, asserted rather than
  // assumed: a type whose active schema declares NO store_warnings block
  // emits no schema-driven identity warning. This is the real behaviour of
  // `product_feedback` on a long-lived instance (observed: schema_version
  // 1.21.0, no store_warnings), and EDGE-4's control case. It is stated here
  // against a seeded type so the control is verified rather than inherited
  // from whatever the environment happens to hold.
  // ---------------------------------------------------------------------
  describe("EDGE-4 control: a type declaring NO store_warnings fires no identity warning", () => {
    const NO_RULES_ENTITY_TYPE = "store_warning_malformed_rule_guard_test_norules";

    beforeAll(async () => {
      if (!(await schemaRegistry.loadActiveSchema(NO_RULES_ENTITY_TYPE, TEST_USER_ID))) {
        await schemaRegistry.register({
          entity_type: NO_RULES_ENTITY_TYPE,
          schema_version: "1.0",
          schema_definition: {
            fields: {
              title: { type: "string", required: false },
              content: { type: "string", required: false },
            },
            identity_opt_out: "heuristic_canonical_name",
            // No store_warnings key at all — deliberately.
          },
          reducer_config: { merge_policies: {} },
          user_id: TEST_USER_ID,
          user_specific: true,
          activate: true,
        });
      }
    });

    afterAll(async () => {
      await cleanupEntityType(NO_RULES_ENTITY_TYPE, TEST_USER_ID);
      await cleanupTestSchema(NO_RULES_ENTITY_TYPE, TEST_USER_ID);
    });

    it("stores cleanly and emits no MISSING_IDENTITY_FIELDS warning", async () => {
      const result = await storeStructuredForApi({
        userId: TEST_USER_ID,
        entities: [
          {
            entity_type: NO_RULES_ENTITY_TYPE,
            content: `no-rules probe ${randomUUID()}`,
          },
        ],
        sourcePriority: 100,
        idempotencyKey: `no-rules-probe-${randomUUID()}`,
      });

      expect(result.entities.length).toBeGreaterThan(0);
      const warnings = (
        result as unknown as {
          store_warnings?: Array<{ code: string }>;
        }
      ).store_warnings;
      expect(warnings?.some((w) => w.code === "MISSING_IDENTITY_FIELDS")).toBeFalsy();
    });
  });

  // ---------------------------------------------------------------------
  // Guard-shape coverage the surface-level tests above cannot reach: an
  // EMPTY `fields` array, and a MIXED rule list where a malformed rule sits
  // alongside a well-formed one. The guard skips on
  // `!Array.isArray(rule.fields) || rule.fields.length === 0`, so the
  // zero-length case is a distinct branch from the absent-array case, and a
  // mixed list proves `continue` skips only the offending rule rather than
  // abandoning the remaining ones.
  // ---------------------------------------------------------------------
  describe("guard branches: empty fields array, and a mixed rule list", () => {
    const EMPTY_FIELDS_ENTITY_TYPE = "store_warning_malformed_rule_guard_test_emptyfields";
    const MIXED_ENTITY_TYPE = "store_warning_malformed_rule_guard_test_mixed";

    beforeAll(async () => {
      if (!(await schemaRegistry.loadActiveSchema(EMPTY_FIELDS_ENTITY_TYPE, TEST_USER_ID))) {
        await schemaRegistry.register({
          entity_type: EMPTY_FIELDS_ENTITY_TYPE,
          schema_version: "1.0",
          schema_definition: {
            fields: {
              title: { type: "string", required: false },
              content: { type: "string", required: false },
            },
            identity_opt_out: "heuristic_canonical_name",
            store_warnings: [
              {
                code: "EMPTY_FIELDS_RULE",
                fields: [],
                message: "a rule declaring an empty fields array cannot evaluate anything",
              },
            ],
          },
          reducer_config: { merge_policies: {} },
          user_id: TEST_USER_ID,
          user_specific: true,
          activate: true,
        });
      }

      if (!(await schemaRegistry.loadActiveSchema(MIXED_ENTITY_TYPE, TEST_USER_ID))) {
        await schemaRegistry.register({
          entity_type: MIXED_ENTITY_TYPE,
          schema_version: "1.0",
          schema_definition: {
            fields: {
              title: { type: "string", required: false },
              content: { type: "string", required: false },
              feedback_source: { type: "string", required: false },
            },
            identity_opt_out: "heuristic_canonical_name",
            // Malformed FIRST, so a guard that threw or bailed out of the
            // loop entirely would suppress the well-formed rule behind it.
            store_warnings: [
              MALFORMED_STORE_WARNINGS_RULE,
              {
                code: "MIXED_BATCH_WELL_FORMED",
                fields: ["feedback_source"],
                message: "well-formed rule sharing a rule list with a malformed one",
              },
            ],
          },
          reducer_config: { merge_policies: {} },
          user_id: TEST_USER_ID,
          user_specific: true,
          activate: true,
        });
      }
    });

    afterAll(async () => {
      await cleanupEntityType(EMPTY_FIELDS_ENTITY_TYPE, TEST_USER_ID);
      await cleanupTestSchema(EMPTY_FIELDS_ENTITY_TYPE, TEST_USER_ID);
      await cleanupEntityType(MIXED_ENTITY_TYPE, TEST_USER_ID);
      await cleanupTestSchema(MIXED_ENTITY_TYPE, TEST_USER_ID);
    });

    it("a rule with an EMPTY fields array is skipped, not evaluated, and never throws", async () => {
      const result = await storeStructuredForApi({
        userId: TEST_USER_ID,
        entities: [
          {
            entity_type: EMPTY_FIELDS_ENTITY_TYPE,
            content: `empty-fields probe ${randomUUID()}`,
          },
        ],
        sourcePriority: 100,
        idempotencyKey: `empty-fields-probe-${randomUUID()}`,
      });

      expect(result.entities.length).toBeGreaterThan(0);
      const warnings = (
        result as unknown as {
          store_warnings?: Array<{ code: string }>;
        }
      ).store_warnings;
      // An empty `fields` list vacuously has no present field, so an
      // UNGUARDED evaluator would fire the warning. The guard must skip it.
      expect(warnings?.some((w) => w.code === "EMPTY_FIELDS_RULE")).toBeFalsy();
    });

    it("mixed batch: the malformed rule is skipped while the well-formed rule behind it still fires", async () => {
      const result = await storeStructuredForApi({
        userId: TEST_USER_ID,
        entities: [
          {
            entity_type: MIXED_ENTITY_TYPE,
            content: `mixed-batch probe ${randomUUID()}`,
          },
        ],
        sourcePriority: 100,
        idempotencyKey: `mixed-batch-probe-${randomUUID()}`,
      });

      expect(result.entities.length).toBeGreaterThan(0);
      const warnings = (
        result as unknown as {
          store_warnings?: Array<{ code: string }>;
        }
      ).store_warnings;
      // The malformed rule contributes nothing...
      expect(warnings?.some((w) => w.code === "MISSING_CONTENT_FIELD")).toBeFalsy();
      // ...and the well-formed rule that follows it is still evaluated,
      // which only holds if the guard used `continue` rather than `break` or
      // an early return out of the rule loop.
      expect(warnings?.some((w) => w.code === "MIXED_BATCH_WELL_FORMED")).toBe(true);
    });

    it("mixed batch: the well-formed rule still SUPPRESSES correctly when its field is present", async () => {
      const result = await storeStructuredForApi({
        userId: TEST_USER_ID,
        entities: [
          {
            entity_type: MIXED_ENTITY_TYPE,
            content: `mixed-batch suppress probe ${randomUUID()}`,
            feedback_source: "internal",
          },
        ],
        sourcePriority: 100,
        idempotencyKey: `mixed-batch-suppress-${randomUUID()}`,
      });

      expect(result.entities.length).toBeGreaterThan(0);
      const warnings = (
        result as unknown as {
          store_warnings?: Array<{ code: string }>;
        }
      ).store_warnings;
      expect(warnings?.some((w) => w.code === "MIXED_BATCH_WELL_FORMED")).toBeFalsy();
    });
  });

  // ---------------------------------------------------------------------
  // REG-5 (neotoma#2165 QA plan, full realistic payload): repeats the
  // reporter's full payload shape — name, slug, description, content,
  // triggers[], supported_harnesses[], user_invocable, enabled, version,
  // file_path, repository_name — across MCP, HTTP, and CLI. A minimal
  // {name, content} payload passing does not exclude a bug that only
  // manifests on the full shape or on one particular field (e.g. an array
  // or boolean field tripping something the warning evaluator or the
  // reducer does differently under load). Asserts the same effects as the
  // minimal-payload tests: entity created, retrievable, content persisted,
  // no DB_QUERY_FAILED, no throw.
  // ---------------------------------------------------------------------
  describe("REG-5: full realistic payload (all 11 reporter fields) across all three surfaces", () => {
    function fullPayload(probeName: string) {
      return {
        entity_type: ENTITY_TYPE,
        name: probeName,
        slug: `slug-${probeName}`,
        description: "REG-5 full-payload probe description",
        content: "REG-5 full-payload probe body",
        triggers: ["probe", "reg-5"],
        supported_harnesses: ["claude-code", "cursor"],
        user_invocable: true,
        enabled: true,
        version: "1.0.0",
        file_path: "skills/probe/SKILL.md",
        repository_name: "neotoma",
      };
    }

    it("MCP store(): full payload resolves without throwing, entity created and retrievable", async () => {
      const probeName = `reg5-mcp-${randomUUID()}`;
      const server = new NeotomaServer();
      (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;
      const storeMethod = (
        server as unknown as {
          store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
        }
      ).store.bind(server);

      const result = await storeMethod({
        user_id: TEST_USER_ID,
        idempotency_key: `reg5-mcp-${randomUUID()}`,
        entities: [fullPayload(probeName)],
      });

      const parsed = JSON.parse(result.content[0]!.text) as {
        entities: Array<{ entity_id?: string; id?: string }>;
      };
      const entityId = parsed.entities[0]?.entity_id ?? parsed.entities[0]?.id;
      expect(entityId).toBeTruthy();

      const snapshotFields = await readSnapshotFields(entityId as string);
      expect(snapshotFields.name).toBe(probeName);
      expect(snapshotFields.content).toBe("REG-5 full-payload probe body");
    });

    it("HTTP POST /store: full payload is 200, not 500, error_code never DB_QUERY_FAILED, entity created and retrievable", async () => {
      const probeName = `reg5-http-${randomUUID()}`;
      const port = 18176;
      const server = createServer(app);
      await new Promise<void>((resolve, reject) => {
        server.listen(port, "127.0.0.1", () => resolve());
        server.once("error", reject);
      });

      try {
        const resp = await fetch(`http://127.0.0.1:${port}/store`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: TEST_USER_ID,
            idempotency_key: `reg5-http-${randomUUID()}`,
            entities: [fullPayload(probeName)],
          }),
        });

        expect(resp.status).toBe(200);
        const body = (await resp.json()) as {
          error_code?: string;
          entities?: Array<{ entity_id?: string; id?: string }>;
        };
        expect(body.error_code).toBeUndefined();
        expect(body.entities?.length).toBeGreaterThan(0);

        const entityId = body.entities![0]!.entity_id ?? body.entities![0]!.id;
        expect(entityId).toBeTruthy();

        const snapshotFields = await readSnapshotFields(entityId as string);
        expect(snapshotFields.name).toBe(probeName);
        expect(snapshotFields.content).toBe("REG-5 full-payload probe body");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("CLI `neotoma store --entities`: full payload exits 0, entity created and retrievable", async () => {
      const probeName = `reg5-cli-${randomUUID()}`;
      const entitiesJson = JSON.stringify([fullPayload(probeName)]).replace(/"/g, '\\"');

      const { stdout, stderr } = await execAsync(
        `${CLI_PATH} store --entities "${entitiesJson}" --user-id "${TEST_USER_ID}" --idempotency-key "reg5-cli-${randomUUID()}" --json`,
        { env: cliEnv() }
      );

      expect(stderr).not.toMatch(/error|exception|fail(ed)?|TypeError/i);

      const result = JSON.parse(stdout) as {
        entities?: Array<{ entity_id?: string; id?: string }>;
      };
      expect(Array.isArray(result.entities)).toBe(true);
      expect(result.entities!.length).toBeGreaterThan(0);

      const entityId = result.entities![0]!.entity_id ?? result.entities![0]!.id;
      expect(entityId).toBeTruthy();

      const snapshotFields = await readSnapshotFields(entityId as string);
      expect(snapshotFields.name).toBe(probeName);
      expect(snapshotFields.content).toBe("REG-5 full-payload probe body");
    });
  });

  // ---------------------------------------------------------------------
  // Error-classification contract (neotoma#2165 acceptance criterion: "a
  // TypeError in the warning evaluator is not reported as DB_QUERY_FAILED").
  //
  // End-to-end: the known malformed condition-shaped rule (the exact shape
  // that used to throw) must resolve as a real 200 with no error_code at
  // all — i.e. it never reaches the generic 500 DB_QUERY_FAILED catch-all in
  // handleStorePost. This is asserted above in every HTTP test in this file
  // (each checks `body.error_code` is undefined and status is 200), so it is
  // not repeated here.
  //
  // Structural: the shipped fix guards the ONE known-malformed shape found
  // in prod (no `fields` array). It does not add a new dedicated error code
  // for evaluator faults in general — Waxwing's arch ruling on #2165
  // explicitly leaves the exact `error_code` for evaluator failures as an
  // open call for whoever lands/adapts this PR. So the guarantee this test
  // suite can make today is narrower than "no evaluator throw can ever
  // become DB_QUERY_FAILED" — it is "the guard exists before the loop body
  // that used to throw, and skips rather than executes on a malformed
  // rule." Assert that structurally against the source, the same technique
  // tests/integration/instance_policy_db_enforcement.test.ts uses for the
  // sibling REST/store error-classification regression (UNAVAILABLE vs
  // DB_QUERY_FAILED), so a future edit that removes the guard — even one
  // that keeps every existing test green because it doesn't happen to hit
  // the exact malformed fixture path this suite uses — cannot silently
  // regress the class of fix rather than just the one instance.
  // ---------------------------------------------------------------------
  describe("error classification: malformed-rule guard prevents DB_QUERY_FAILED misclassification", () => {
    const actionsSource = readFileSync(new URL("../../src/actions.ts", import.meta.url), "utf-8");
    const serverSource = readFileSync(new URL("../../src/server.ts", import.meta.url), "utf-8");

    function extractStoreWarningsLoop(source: string): string {
      const marker = "Schema-driven store_warnings:";
      const start = source.indexOf(marker);
      expect(
        start,
        "store_warnings loop marker not found — did it move or get renamed?"
      ).toBeGreaterThan(-1);
      // Bound the excerpt generously past both the malformed-rule guard and
      // the `.some(` call it protects; large enough to contain both without
      // pulling in unrelated code. The marker sits well before the guard
      // (past several lines of response-type declarations), so this window
      // must clear that gap — measured empirically at ~2450-2750 chars in
      // both files.
      return source.slice(start, start + 3500);
    }

    it("src/actions.ts: the Array.isArray guard sits BEFORE `.some(` in the store_warnings loop", () => {
      const loop = extractStoreWarningsLoop(actionsSource);
      const guardIndex = loop.indexOf("Array.isArray(rule.fields)");
      const someIndex = loop.indexOf(".some(");
      expect(
        guardIndex,
        "the malformed-rule guard (Array.isArray check) was not found"
      ).toBeGreaterThan(-1);
      expect(someIndex, "the `.some(` call the guard protects was not found").toBeGreaterThan(-1);
      expect(
        guardIndex,
        "the guard must run before `.some(` is ever reached, or a malformed rule still throws"
      ).toBeLessThan(someIndex);
    });

    it("src/actions.ts: a malformed rule is skipped (continue), not merely logged", () => {
      const loop = extractStoreWarningsLoop(actionsSource);
      const guardIndex = loop.indexOf("Array.isArray(rule.fields)");
      const nextBraceRegion = loop.slice(guardIndex, guardIndex + 400);
      expect(
        nextBraceRegion.includes("continue"),
        "the malformed-rule branch must `continue` past the `.some(` call, not merely warn and fall through into it"
      ).toBe(true);
    });

    it("src/server.ts: the Array.isArray guard sits BEFORE `.some(` in the store_warnings loop (MCP path)", () => {
      const loop = extractStoreWarningsLoop(serverSource);
      const guardIndex = loop.indexOf("Array.isArray(rule.fields)");
      const someIndex = loop.indexOf(".some(");
      expect(
        guardIndex,
        "the malformed-rule guard (Array.isArray check) was not found"
      ).toBeGreaterThan(-1);
      expect(someIndex, "the `.some(` call the guard protects was not found").toBeGreaterThan(-1);
      expect(
        guardIndex,
        "the guard must run before `.some(` is ever reached, or a malformed rule still throws"
      ).toBeLessThan(someIndex);
    });

    it("src/server.ts: a malformed rule is skipped (continue), not merely logged (MCP path)", () => {
      const loop = extractStoreWarningsLoop(serverSource);
      const guardIndex = loop.indexOf("Array.isArray(rule.fields)");
      const nextBraceRegion = loop.slice(guardIndex, guardIndex + 400);
      expect(
        nextBraceRegion.includes("continue"),
        "the malformed-rule branch must `continue` past the `.some(` call, not merely warn and fall through into it"
      ).toBe(true);
    });

    it("HTTP: the known malformed condition-shaped rule resolves 200 with no error_code (never DB_QUERY_FAILED)", async () => {
      const port = 18175;
      const server = createServer(app);
      await new Promise<void>((resolve, reject) => {
        server.listen(port, "127.0.0.1", () => resolve());
        server.once("error", reject);
      });

      try {
        const resp = await fetch(`http://127.0.0.1:${port}/store`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: TEST_USER_ID,
            idempotency_key: `err-classification-${randomUUID()}`,
            entities: [
              {
                entity_type: ENTITY_TYPE,
                name: `err-classification-${randomUUID()}`,
              },
            ],
          }),
        });

        expect(resp.status).not.toBe(500);
        expect(resp.status).toBe(200);
        const body = (await resp.json()) as { error_code?: string };
        expect(body.error_code).toBeUndefined();
        expect(body.error_code).not.toBe("DB_QUERY_FAILED");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("no-overcorrection guard: the generic DB_QUERY_FAILED catch-all still exists in handleStorePost for genuine faults", () => {
      // This fix must narrow WHEN the generic 500 fires (skip before the
      // throw), not remove the generic catch-all itself — real DB-layer
      // faults unrelated to store_warnings (e.g. a raw driver failure) still
      // need somewhere to land. Confirms the fallback line this PR does not
      // touch is still present and unconditional at the end of the handler,
      // guarding against a hypothetical future edit deleting the fallback
      // entirely rather than narrowing it.
      const start = actionsSource.indexOf("async function handleStorePost");
      expect(start, "handleStorePost not found — did it get renamed?").toBeGreaterThan(-1);
      const end = actionsSource.indexOf('app.post("/store"', start);
      expect(end, "could not bound handleStorePost").toBeGreaterThan(start);
      const handler = actionsSource.slice(start, end);
      expect(handler.includes('sendError(res, 500, "DB_QUERY_FAILED"')).toBe(true);
    });
  });
});
