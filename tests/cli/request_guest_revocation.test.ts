import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startIsolatedNeotomaServer,
  type IsolatedServer,
} from "../../packages/eval-harness/src/isolated_server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
const exec = promisify(execFile);
let server: IsolatedServer;
let database: Database.Database;
const entityId = "ent_synthetic_guest_revocation_cli";
function seed(owner = LOCAL_DEV_USER_ID) {
  const token = randomUUID();
  const hash = createHash("sha256").update(token).digest("hex");
  const id = `guest_token_${hash.slice(0, 16)}`;
  const observation = randomUUID();
  const now = new Date().toISOString();
  const fields = {
    token_hash: hash,
    entity_ids: [entityId],
    thumbprint: null,
    created_at: now,
    ttl_seconds: 3600,
    revoked_at: null,
    optional_fixture: { preserved: true },
  };
  database
    .prepare(
      "INSERT INTO entities (id,entity_type,canonical_name,user_id) VALUES (?, 'guest_access_token', ?, ?)"
    )
    .run(id, id, owner);
  database
    .prepare(
      "INSERT INTO observations (id,entity_id,entity_type,schema_version,user_id,fields,observed_at) VALUES (?,?,'guest_access_token','1.0',?,?,?)"
    )
    .run(observation, id, owner, JSON.stringify(fields), now);
  return {
    token,
    id,
    observation,
    fields,
    body: { idempotency_key: randomUUID(), expected_observation_id: observation },
  };
}
async function request(id: string, body: unknown, token = server.token, suffix = "") {
  return fetch(`${server.baseUrl}/guest-access-tokens/${id}/revoke${suffix}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function read(token: string) {
  return fetch(`${server.baseUrl}/entities/${entityId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}
beforeAll(async () => {
  server = await startIsolatedNeotomaServer({
    useTsx: false,
    env: { NEOTOMA_ENV: "test", NEOTOMA_INSPECTOR_LIVE_BUILD: "0" },
  });
  database = new Database(join(server.dataDir, "neotoma.db"));
  database
    .prepare(
      "INSERT INTO entities (id,entity_type,canonical_name,user_id) VALUES (?, 'issue', 'Synthetic fixture', ?)"
    )
    .run(entityId, LOCAL_DEV_USER_ID);
  database
    .prepare(
      "INSERT INTO entity_snapshots (entity_id,entity_type,schema_version,snapshot,user_id,observation_count) VALUES (?, 'issue','1.0', ?, ?, 0)"
    )
    .run(entityId, JSON.stringify({ title: "Synthetic fixture" }), LOCAL_DEV_USER_ID);
}, 30000);
afterAll(async () => {
  database?.close();
  await server?.stop();
});
describe("owner revocation through actual HTTP, SQLite and built generic CLI", () => {
  it("has owner and guest read positives, then revokes only the selected token", async () => {
    const s = seed();
    const other = seed();
    expect((await read(server.token)).status).toBe(200);
    expect((await read(s.token)).status).toBe(200);
    const response = await request(s.id, s.body);
    expect(response.status).toBe(200);
    const receipt = await response.json();
    expect(receipt).toMatchObject({ revoked: true, replayed: false, token_entity_id: s.id });
    expect((await read(s.token)).status).toBe(401);
    expect((await read(other.token)).status).toBe(200);
    expect((await read(server.token)).status).toBe(200);
    expect(await (await request(s.id, s.body)).json()).toEqual({ ...receipt, replayed: true });
    const rows = database
      .prepare("SELECT * FROM observations WHERE entity_id=?")
      .all(s.id) as Array<{ id: string; fields: string }>;
    expect(rows).toHaveLength(2);
    expect(JSON.parse(rows.find((r) => r.id === s.observation)!.fields)).toEqual(s.fields);
    expect(
      JSON.parse(rows.find((r) => r.id === receipt.revocation_observation_id)!.fields)
    ).toEqual({ ...s.fields, revoked_at: receipt.revoked_at });
  });
  it("uses the built generic request operation and retains exact replay metadata", async () => {
    const s = seed();
    async function cli() {
      const { stdout } = await exec(
        process.execPath,
        [
          "dist/cli/index.js",
          "--no-log-file",
          "--json",
          "--base-url",
          server.baseUrl,
          "request",
          "--operation",
          "revokeGuestAccessToken",
          "--params",
          JSON.stringify({ params: { path: { id: s.id } }, body: s.body }),
        ],
        {
          env: {
            ...process.env,
            NEOTOMA_ENV: "test",
            NEOTOMA_BEARER_TOKEN: server.token,
            NEOTOMA_FORCE_LOCAL_TRANSPORT: "false",
          },
        }
      );
      return JSON.parse(stdout);
    }
    const first = await cli();
    expect(first.revoked).toBe(true);
    expect(await cli()).toEqual({ ...first, replayed: true });
    expect((await read(s.token)).status).toBe(401);
    expect(
      database.prepare("SELECT COUNT(*) AS n FROM observations WHERE entity_id=?").get(s.id)
    ).toEqual({ n: 2 });
  }, 30000);
  it("rejects wrong owner, guest, unresolved auth, stale original and owner substitution without effects", async () => {
    const s = seed();
    const foreign = seed("synthetic-other-owner");
    expect((await request(foreign.id, foreign.body)).status).toBe(404);
    expect((await request(s.id, s.body, s.token)).status).toBe(401);
    expect((await request(s.id, s.body, "invalid-synthetic-bearer")).status).toBe(401);
    expect((await request(s.id, { ...s.body, expected_observation_id: "stale" })).status).toBe(409);
    expect((await request(s.id, { ...s.body, user_id: LOCAL_DEV_USER_ID })).status).toBe(400);
    expect(
      (await request(s.id, s.body, server.token, "?user_id=synthetic-other-owner")).status
    ).toBe(400);
    expect(
      database.prepare("SELECT COUNT(*) AS n FROM observations WHERE entity_id=?").get(s.id)
    ).toEqual({ n: 1 });
    expect((await read(s.token)).status).toBe(200);
  });
  it("serializes real HTTP replay and rolls back a post-insert readback failure", async () => {
    const s = seed();
    const responses = await Promise.all([request(s.id, s.body), request(s.id, s.body)]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const receipts = await Promise.all(responses.map((r) => r.json()));
    expect(receipts.map((r) => r.replayed).sort()).toEqual([false, true]);
    expect(receipts[0].revocation_observation_id).toBe(receipts[1].revocation_observation_id);
    const failed = seed();
    database.exec(
      "CREATE TRIGGER synthetic_revoke_readback_failure AFTER INSERT ON observations WHEN NEW.idempotency_key IS NOT NULL BEGIN UPDATE observations SET entity_type='invalid' WHERE id=NEW.id; END"
    );
    try {
      expect((await request(failed.id, failed.body)).status).toBe(503);
      expect(
        database.prepare("SELECT COUNT(*) AS n FROM observations WHERE entity_id=?").get(failed.id)
      ).toEqual({ n: 1 });
      expect((await read(failed.token)).status).toBe(200);
    } finally {
      database.exec("DROP TRIGGER synthetic_revoke_readback_failure");
    }
  });
  it("returns the existing instance-policy refusal before effects, then allows the same request when permitted", async () => {
    const s = seed();
    const policyId = "ent_synthetic_guest_revoke_http_policy";
    database
      .prepare(
        "INSERT INTO entities(id,entity_type,canonical_name,user_id) VALUES (?, 'instance_policy','Synthetic revocation policy',?)"
      )
      .run(policyId, LOCAL_DEV_USER_ID);
    database
      .prepare(
        "INSERT INTO entity_snapshots(entity_id,entity_type,schema_version,snapshot,user_id,observation_count) VALUES (?, 'instance_policy','1.0',?,?,1)"
      )
      .run(
        policyId,
        JSON.stringify({
          enforcement: "enforced",
          out_of_scope_entity_types: ["guest_access_token"],
        }),
        LOCAL_DEV_USER_ID
      );
    try {
      const response = await request(s.id, s.body);
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("ERR_STORE_POLICY_DENIED");
      expect(
        database.prepare("SELECT COUNT(*) AS n FROM observations WHERE entity_id=?").get(s.id)
      ).toEqual({ n: 1 });
      expect((await read(s.token)).status).toBe(200);
    } finally {
      database.prepare("DELETE FROM entity_snapshots WHERE entity_id=?").run(policyId);
      database.prepare("DELETE FROM entities WHERE id=?").run(policyId);
    }
    expect((await request(s.id, s.body)).status).toBe(200);
    expect((await read(s.token)).status).toBe(401);
  });
});
