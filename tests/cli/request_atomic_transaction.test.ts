import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { createClient } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startIsolatedNeotomaServer,
  type IsolatedServer,
} from "../../packages/eval-harness/src/isolated_server.js";

const execFileAsync = promisify(execFile);
let server: IsolatedServer;
const type = "eval_atomic_cli";
async function post(path: string, body: unknown) {
  const response = await fetch(`${server.baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${server.token}` },
    body: JSON.stringify(body),
  });
  expect(response.ok).toBe(true);
  return response.json();
}
async function cli(flag: "body" | "params", body: unknown) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "dist/cli/index.js",
      "--no-log-file",
      "--json",
      "--base-url",
      server.baseUrl,
      "request",
      "--operation",
      "correctTransaction",
      `--${flag}`,
      JSON.stringify(flag === "params" ? { body } : body),
    ],
    {
      env: {
        ...process.env,
        NEOTOMA_BEARER_TOKEN: server.token,
        NEOTOMA_FORCE_LOCAL_TRANSPORT: "false",
      },
    }
  );
  return JSON.parse(stdout);
}
async function transaction(surface: "http" | "body" | "params", body: unknown) {
  if (surface !== "http") return cli(surface, body);
  const response = await fetch(`${server.baseUrl}/corrections/transaction`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${server.token}` },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(result)}`);
  return result;
}
async function physicalState(entityId: string) {
  const connection = createClient({ url: `file:${join(server.dataDir, "neotoma.db")}` });
  try {
    const observations = await connection.execute({
      sql: "SELECT id FROM observations WHERE entity_id = ? ORDER BY id",
      args: [entityId],
    });
    const snapshots = await connection.execute({
      sql: "SELECT * FROM entity_snapshots WHERE entity_id = ?",
      args: [entityId],
    });
    expect(snapshots.rows).toHaveLength(1); // instrument positive: the physical row exists
    return {
      observationIds: observations.rows.map((row) => String(row.id)),
      snapshotRows: JSON.stringify(snapshots.rows),
    };
  } finally {
    connection.close();
  }
}
beforeAll(async () => {
  server = await startIsolatedNeotomaServer();
  await post("/register_schema", {
    entity_type: type,
    schema_version: "1.0",
    activate: true,
    schema_definition: {
      fields: {
        title: { type: "string", required: true },
        status: { type: "string" },
        remaining: { type: "number" },
      },
      canonical_name_fields: ["title"],
    },
    reducer_config: {
      merge_policies: Object.fromEntries(
        ["title", "status", "remaining"].map((field) => [
          field,
          { strategy: "highest_priority", tie_breaker: "observed_at" },
        ])
      ),
    },
  });
});
afterAll(async () => {
  await server?.stop();
});

describe("generic CLI correctTransaction actual transport effects", () => {
  it.each(["http", "body", "params"] as const)(
    "refuses a changed existing nonselected row through %s and applies a complete revision refresh",
    async (surface) => {
      const seed = await post("/store", {
        idempotency_key: `revision-seed-${surface}`,
        entities: [
          { entity_type: type, title: `Revision ${surface} draft`, status: "ready" },
          { entity_type: type, title: `Revision ${surface} source`, remaining: 1 },
          { entity_type: type, title: `Revision ${surface} unselected`, remaining: 1 },
        ],
      });
      const [draft, source, unselected] = seed.entities.map(
        (entity: { entity_id: string }) => entity.entity_id
      );
      const client = createClient({ url: `file:${join(server.dataDir, "neotoma.db")}` });
      try {
        const inventory = await client.execute({
          sql: "SELECT e.id, s.observation_count FROM entities e JOIN entity_snapshots s ON s.entity_id = e.id WHERE e.entity_type = ? ORDER BY e.id",
          args: [type],
        });
        const expected_entity_ids = inventory.rows.map((row) => String(row.id));
        const expected_observation_counts = await Promise.all(
          inventory.rows.map(async (row) => {
            const current = await post("/get_entity_snapshot", { entity_id: String(row.id) });
            if (typeof current.content_revision !== "string")
              throw new Error("Missing content revision");
            return {
              entity_id: String(row.id),
              observation_count: Number(row.observation_count),
              content_revision: current.content_revision as string,
            };
          })
        );
        expect(expected_entity_ids).toContain(unselected);
        expect(expected_entity_ids).toContain(source);
        const stale = {
          idempotency_key: `revision-stale-${surface}`,
          entities: [
            {
              entity_id: draft,
              entity_type: type,
              expected_observation_count: 1,
              expected_snapshot: { status: "ready" },
              changes: [{ field: "status", value: "approved" }],
            },
            {
              entity_id: source,
              entity_type: type,
              expected_observation_count: 1,
              expected_snapshot: { remaining: 1 },
              changes: [],
            },
          ],
          populations: [{ entity_type: type, expected_entity_ids, expected_observation_counts }],
        };
        expect(
          (
            await transaction("http", {
              idempotency_key: `revision-edit-${surface}`,
              entities: [
                {
                  entity_id: unselected,
                  entity_type: type,
                  expected_observation_count: 1,
                  expected_snapshot: { remaining: 1 },
                  changes: [{ field: "remaining", value: 0 }],
                },
              ],
            })
          ).status
        ).toBe("applied");
        await expect(transaction(surface, stale)).rejects.toThrow(/409|CONFLICT|population/i);
        expect((await post("/get_entity_snapshot", { entity_id: draft })).snapshot.status).toBe(
          "ready"
        );
        const refreshed = {
          ...stale,
          idempotency_key: `revision-fresh-${surface}`,
          populations: [
            {
              entity_type: type,
              expected_entity_ids,
              expected_observation_counts: await Promise.all(
                expected_entity_ids.map(async (entity_id) => {
                  const current = await post("/get_entity_snapshot", { entity_id });
                  return {
                    entity_id,
                    observation_count: current.observation_count,
                    content_revision: current.content_revision,
                  };
                })
              ),
            },
          ],
        };
        expect((await transaction(surface, refreshed)).status).toBe("applied");
        expect((await transaction(surface, refreshed)).status).toBe("replayed");
        expect((await post("/get_entity_snapshot", { entity_id: draft })).observation_count).toBe(
          2
        );
      } finally {
        client.close();
      }
    },
    30_000
  );
  it.each(["http", "body", "params"] as const)(
    "refuses a newly inserted type member through %s and applies after a complete refresh",
    async (surface) => {
      const seed = await post("/store", {
        idempotency_key: `population-seed-${surface}`,
        entities: [
          { entity_type: type, title: `Population ${surface} draft`, status: "ready" },
          { entity_type: type, title: `Population ${surface} source`, remaining: 1 },
        ],
      });
      const [draft, source] = seed.entities.map(
        (entity: { entity_id: string }) => entity.entity_id
      );
      const client = createClient({ url: `file:${join(server.dataDir, "neotoma.db")}` });
      try {
        const inventory = await client.execute({
          sql: "SELECT id FROM entities WHERE entity_type = ? ORDER BY id",
          args: [type],
        });
        const expected_entity_ids = inventory.rows.map((row) => String(row.id));
        expect(expected_entity_ids).toContain(draft);
        expect(expected_entity_ids).toContain(source);
        const body = {
          idempotency_key: `population-claim-${surface}`,
          entities: [
            {
              entity_id: draft,
              entity_type: type,
              expected_observation_count: 1,
              expected_snapshot: { status: "ready" },
              changes: [{ field: "status", value: "approved" }],
            },
            {
              entity_id: source,
              entity_type: type,
              expected_observation_count: 1,
              expected_snapshot: { remaining: 1 },
              changes: [],
            },
          ],
          populations: [{ entity_type: type, expected_entity_ids }],
        };
        const inserted = await post("/store", {
          idempotency_key: `population-insert-${surface}`,
          entities: [
            { entity_type: type, title: `Population ${surface} new source`, remaining: 2 },
          ],
        });
        const newId = inserted.entities[0].entity_id as string;
        await expect(transaction(surface, body)).rejects.toThrow(/409|CONFLICT|population/i);
        const held = await post("/get_entity_snapshot", { entity_id: draft });
        expect(held.snapshot.status).toBe("ready");
        expect(held.observation_count).toBe(1);
        expect((await post("/get_entity_snapshot", { entity_id: source })).observation_count).toBe(
          1
        );
        const refreshed = {
          ...body,
          idempotency_key: `population-refresh-${surface}`,
          populations: [
            { entity_type: type, expected_entity_ids: [...expected_entity_ids, newId].sort() },
          ],
        };
        expect((await transaction(surface, refreshed)).status).toBe("applied");
        expect((await post("/get_entity_snapshot", { entity_id: draft })).snapshot.status).toBe(
          "approved"
        );
        expect((await post("/get_entity_snapshot", { entity_id: source })).observation_count).toBe(
          1
        );
      } finally {
        client.close();
      }
    },
    30_000
  );
  it("refuses a stale compare-only guard through HTTP before changing its writer", async () => {
    const title = "HTTP guarded source";
    const seed = await post("/store", {
      idempotency_key: "http-guard-seed",
      entities: [
        { entity_type: type, title: "HTTP guarded draft", status: "ready" },
        { entity_type: type, title, remaining: 1 },
      ],
    });
    const [draft, source] = seed.entities.map((entity: { entity_id: string }) => entity.entity_id);
    const body = {
      idempotency_key: "http-guard-stale",
      entities: [
        {
          entity_id: draft,
          entity_type: type,
          expected_observation_count: 1,
          expected_snapshot: { status: "ready" },
          changes: [{ field: "status", value: "approved" }],
        },
        {
          entity_id: source,
          entity_type: type,
          expected_observation_count: 1,
          expected_snapshot: { remaining: 1 },
          changes: [],
        },
      ],
    };
    await post("/store", {
      idempotency_key: "http-guard-advance",
      entities: [{ entity_type: type, title, remaining: 0 }],
    });
    const writerBefore = await physicalState(draft);
    const guardBefore = await physicalState(source);
    const response = await fetch(`${server.baseUrl}/corrections/transaction`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${server.token}` },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(409);
    const draftState = await post("/get_entity_snapshot", { entity_id: draft });
    expect(draftState.snapshot.status).toBe("ready");
    expect(draftState.observation_count).toBe(1);
    expect(await physicalState(draft)).toEqual(writerBefore);
    expect(await physicalState(source)).toEqual(guardBefore);
    const malformed = structuredClone(body);
    malformed.entities[1].expected_snapshot = {};
    const invalid = await fetch(`${server.baseUrl}/corrections/transaction`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${server.token}` },
      body: JSON.stringify(malformed),
    });
    expect(invalid.status).toBe(400);
  });
  it.each(["http", "body", "params"] as const)(
    "keeps a compare-only guard unchanged through %s success and replay",
    async (flag) => {
      const seed = await post("/store", {
        idempotency_key: `cli-guard-seed-${flag}`,
        entities: [
          { entity_type: type, title: `CLI guard ${flag} draft`, status: "ready" },
          { entity_type: type, title: `CLI guard ${flag} source`, remaining: 1 },
        ],
      });
      const [draft, source] = seed.entities.map(
        (entity: { entity_id: string }) => entity.entity_id
      );
      const body = {
        idempotency_key: `cli-guard-commit-${flag}`,
        entities: [
          {
            entity_id: draft,
            entity_type: type,
            expected_observation_count: 1,
            expected_snapshot: { status: "ready" },
            changes: [{ field: "status", value: "approved" }],
          },
          {
            entity_id: source,
            entity_type: type,
            expected_observation_count: 1,
            expected_snapshot: { remaining: 1 },
            changes: [],
          },
        ],
      };
      const guardBefore = await physicalState(source);
      expect((await transaction(flag, body)).status).toBe("applied");
      const writerAfter = await physicalState(draft);
      expect(writerAfter.observationIds).toHaveLength(2);
      expect(await physicalState(source)).toEqual(guardBefore);
      expect((await transaction(flag, body)).status).toBe("replayed");
      expect(await physicalState(draft)).toEqual(writerAfter);
      expect(await physicalState(source)).toEqual(guardBefore);
      const draftState = await post("/get_entity_snapshot", { entity_id: draft });
      const guardState = await post("/get_entity_snapshot", { entity_id: source });
      expect(draftState.snapshot.status).toBe("approved");
      expect(draftState.observation_count).toBe(2);
      expect(guardState.snapshot.remaining).toBe(1);
      expect(guardState.observation_count).toBe(1);
      const stale = { ...body, idempotency_key: `cli-guard-stale-${flag}` };
      await expect(transaction(flag, stale)).rejects.toThrow(/409|CONFLICT|precondition/);
      expect((await post("/get_entity_snapshot", { entity_id: draft })).observation_count).toBe(2);
      expect((await post("/get_entity_snapshot", { entity_id: source })).observation_count).toBe(1);
    },
    30_000
  );
  it.each(["http", "body", "params"] as const)(
    "refuses a stale compare-only guard through %s without changing its writer",
    async (flag) => {
      const title = `CLI stale guard ${flag} source`;
      const seed = await post("/store", {
        idempotency_key: `cli-stale-guard-seed-${flag}`,
        entities: [
          { entity_type: type, title: `CLI stale guard ${flag} draft`, status: "ready" },
          { entity_type: type, title, remaining: 1 },
        ],
      });
      const [draft, source] = seed.entities.map(
        (entity: { entity_id: string }) => entity.entity_id
      );
      await post("/store", {
        idempotency_key: `cli-stale-guard-advance-${flag}`,
        entities: [{ entity_type: type, title, remaining: 0 }],
      });
      const body = {
        idempotency_key: `cli-stale-guard-attempt-${flag}`,
        entities: [
          {
            entity_id: draft,
            entity_type: type,
            expected_observation_count: 1,
            expected_snapshot: { status: "ready" },
            changes: [{ field: "status", value: "approved" }],
          },
          {
            entity_id: source,
            entity_type: type,
            expected_observation_count: 1,
            expected_snapshot: { remaining: 1 },
            changes: [],
          },
        ],
      };
      await expect(transaction(flag, body)).rejects.toThrow(/409|CONFLICT|precondition/);
      const draftState = await post("/get_entity_snapshot", { entity_id: draft });
      const guardState = await post("/get_entity_snapshot", { entity_id: source });
      expect(draftState.snapshot.status).toBe("ready");
      expect(draftState.observation_count).toBe(1);
      expect(guardState.snapshot.remaining).toBe(0);
      expect(guardState.observation_count).toBe(2);
    },
    30_000
  );
  it.each(["http", "body", "params"] as const)(
    "rolls back %s writers when a later writer fails behind a compare-only guard",
    async (flag) => {
      const seed = await post("/store", {
        idempotency_key: `cli-guard-rollback-seed-${flag}`,
        entities: [
          { entity_type: type, title: `CLI rollback ${flag} first`, status: "ready" },
          { entity_type: type, title: `CLI rollback ${flag} second`, status: "ready" },
          { entity_type: type, title: `CLI rollback ${flag} guard`, remaining: 1 },
        ],
      });
      const [first, second] = seed.entities
        .slice(0, 2)
        .map((entity: { entity_id: string }) => entity.entity_id)
        .sort();
      const guard = seed.entities[2].entity_id as string;
      expect(second).toMatch(/^ent_[a-z0-9]+$/);
      const body = {
        idempotency_key: `cli-guard-rollback-attempt-${flag}`,
        entities: [
          ...[first, second].map((entity_id) => ({
            entity_id,
            entity_type: type,
            expected_observation_count: 1,
            expected_snapshot: { status: "ready" },
            changes: [{ field: "status", value: "approved" }],
          })),
          {
            entity_id: guard,
            entity_type: type,
            expected_observation_count: 1,
            expected_snapshot: { remaining: 1 },
            changes: [],
          },
        ],
      };
      const db = createClient({ url: `file:${join(server.dataDir, "neotoma.db")}` });
      await db.execute(
        `CREATE TRIGGER cli_guard_late_failure BEFORE INSERT ON observations WHEN NEW.entity_id = '${second}' BEGIN SELECT RAISE(ABORT, 'injected failure'); END`
      );
      try {
        await expect(transaction(flag, body)).rejects.toThrow();
        for (const entity_id of [first, second]) {
          const state = await post("/get_entity_snapshot", { entity_id });
          expect(state.snapshot.status).toBe("ready");
          expect(state.observation_count).toBe(1);
        }
        expect((await post("/get_entity_snapshot", { entity_id: guard })).observation_count).toBe(
          1
        );
      } finally {
        await db.execute("DROP TRIGGER cli_guard_late_failure");
        db.close();
      }
      expect((await transaction(flag, body)).status).toBe("applied");
      expect((await post("/get_entity_snapshot", { entity_id: guard })).observation_count).toBe(1);
    },
    30_000
  );
  it.each(["body", "params"] as const)(
    "preserves atomic state, replay and refusal using --%s",
    async (flag) => {
      const seed = await post("/store", {
        idempotency_key: `cli-seed-${flag}`,
        entities: [
          { entity_type: type, title: `CLI ${flag} draft`, status: "ready" },
          { entity_type: type, title: `CLI ${flag} source`, remaining: 1 },
        ],
      });
      const [draft, source] = seed.entities.map(
        (entity: { entity_id: string }) => entity.entity_id
      );
      const request = {
        idempotency_key: `cli-commit-${flag}`,
        entities: [
          {
            entity_id: draft,
            entity_type: type,
            expected_observation_count: 1,
            expected_snapshot: { status: "ready" },
            changes: [{ field: "status", value: "approved" }],
          },
          {
            entity_id: source,
            entity_type: type,
            expected_observation_count: 1,
            expected_snapshot: { remaining: 1 },
            changes: [{ field: "remaining", value: 0 }],
          },
        ],
      };
      expect((await cli(flag, request)).status).toBe("applied");
      expect((await cli(flag, request)).status).toBe("replayed");
      const changed = structuredClone(request);
      changed.entities[1].changes[0].value = -1;
      await expect(cli(flag, changed)).rejects.toThrow(/payload|idempotency/i);
      await expect(cli(flag, { ...request, idempotency_key: `cli-stale-${flag}` })).rejects.toThrow(
        /CONFLICT|precondition/
      );
      const draftState = await post("/get_entity_snapshot", { entity_id: draft });
      const sourceState = await post("/get_entity_snapshot", { entity_id: source });
      expect(draftState.snapshot.status).toBe("approved");
      expect(sourceState.snapshot.remaining).toBe(0);
      expect(draftState.observation_count).toBe(2);
      expect(sourceState.observation_count).toBe(2);
    },
    30_000
  );
});
