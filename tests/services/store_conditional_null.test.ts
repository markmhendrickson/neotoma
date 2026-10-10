/** Synthetic native wire evidence: registration/readback, originals and immutable replay. */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { promisify } from "node:util";
import { modernPost, toolResultJson } from "../helpers/mcp_http_modern.js";
import { execFile, execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import {
  startIsolatedNeotomaServer,
  type IsolatedServer,
} from "../../packages/eval-harness/src/isolated_server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { storeConditionRequestHash } from "../../src/services/store_condition_keys.js";
let server: IsolatedServer;
const type = "conditional_null_test";
const definition = {
  fields: {
    code: { type: "string", required: true },
    text: { type: "string", required: true },
    amount: { type: "number" },
    enabled: { type: "boolean" },
    at: { type: "date" },
    items: { type: "array" },
    detail: { type: "object" },
    converted: {
      type: "string",
      converters: [
        { from: "number", to: "string", function: "number_to_string", deterministic: true },
      ],
    },
    constrained: { type: "string", constraints: { enum: ["allowed"] } },
    ["__proto__"]: { type: "string" },
  },
  canonical_name_fields: ["code"],
};
const registration = {
  entity_type: type,
  schema_version: "1.0",
  user_specific: true,
  activate: true,
  schema_definition: definition,
  reducer_config: {
    merge_policies: Object.fromEntries(
      Object.keys(definition.fields).map((k) => [k, { strategy: "last_write" }])
    ),
  },
};
const evidence: Record<string, unknown> = {
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  registration_request: registration,
  schema_readback: null,
  cases: [],
};
async function call(route: string, body?: unknown) {
  const response = await fetch(server.baseUrl + route, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${server.token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
async function store(code: string, fields: Record<string, unknown> = {}, key = code) {
  return call("/store", {
    entities: [{ entity_type: type, code, ...fields }],
    expected_entity_absent: true,
    idempotency_key: key,
    strict: true,
  });
}
async function nativeCounts() {
  const connection = new AsyncSqliteDatabase(path.join(server.dataDir, "neotoma.db"), {
    existing: true,
    readOnly: true,
  });
  try {
    const result: Record<string, number> = {};
    for (const table of [
      "entities",
      "sources",
      "observations",
      "entity_snapshots",
      "raw_fragments",
      "store_condition_keys",
    ])
      result[table] = Number(
        ((await connection.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()) as { n: number }).n
      );
    return result;
  } finally {
    await connection.close();
  }
}
beforeAll(async () => {
  server = await startIsolatedNeotomaServer({
    useTsx: false,
    env: { NEOTOMA_ACTIONS_DISABLE_AUTOSTART: "0" },
  });
  const ack = await call("/register_schema", registration);
  expect(ack.status, JSON.stringify(ack.body)).toBe(200);
  const active = await call(`/schemas/${type}`);
  expect(active.status).toBe(200);
  expect(active.body.active).toBe(true);
  expect(active.body.schema_definition).toEqual(definition);
  expect(active.body.reducer_config).toEqual(registration.reducer_config);
  evidence.schema_readback = active.body;
});
afterAll(async () => {
  if (process.env.CONDITIONAL_NULL_EVIDENCE_PATH)
    writeFileSync(
      process.env.CONDITIONAL_NULL_EVIDENCE_PATH,
      JSON.stringify(evidence, null, 2) + "\n",
      { mode: 0o600 }
    );
  await server?.stop();
});
type ReadSurface = "HTTP" | "modern MCP" | "CLI body" | "CLI params";
const readSurfaces: ReadSurface[] = ["HTTP", "modern MCP", "CLI body", "CLI params"];
async function readSnapshot(
  surface: ReadSurface,
  entityId: string,
  option?: boolean,
  atIngested?: string
) {
  const args = {
    entity_id: entityId,
    ...(option === undefined ? {} : { include_cleared_fields: option }),
    ...(atIngested === undefined ? {} : { at_ingested: atIngested }),
  };
  if (surface === "HTTP") {
    const r = await call("/get_entity_snapshot", args);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return r.body;
  }
  if (surface === "modern MCP") {
    const r = await modernPost(
      server.baseUrl,
      {
        id: 1,
        method: "tools/call",
        params: { name: "retrieve_entity_snapshot", arguments: { ...args, format: "json" } },
      },
      { headers: { Authorization: `Bearer ${server.token}` } }
    );
    expect(r.status, r.text).toBe(200);
    expect(r.body?.result?.isError).not.toBe(true);
    return toolResultJson(r.body);
  }
  const flag = surface === "CLI body" ? "body" : "params";
  const out = await promisify(execFile)(
    process.execPath,
    [
      "dist/cli/index.js",
      "--no-log-file",
      "--json",
      "--base-url",
      server.baseUrl,
      "request",
      "--operation",
      "getEntitySnapshot",
      `--${flag}`,
      JSON.stringify(flag === "params" ? { body: args } : args),
    ],
    {
      timeout: 20000,
      env: {
        ...process.env,
        NEOTOMA_BEARER_TOKEN: server.token,
        NEOTOMA_FORCE_LOCAL_TRANSPORT: "false",
      },
    }
  );
  return JSON.parse(out.stdout);
}
function assertNullView(view: any, entityId: string, origin: string) {
  expect(view.entity_id).toBe(entityId);
  expect(view.cleared_fields_included).toBe(true);
  expect(Object.hasOwn(view.snapshot, "text")).toBe(true);
  expect(view.snapshot.text).toBeNull();
  expect(view.provenance.text).toBe(origin);
  expect(Object.hasOwn(view.snapshot, "amount")).toBe(false);
  expect(Object.hasOwn(view.provenance, "amount")).toBe(false);
}
async function assertDefaultViews(surface: ReadSurface, entityId: string, atIngested?: string) {
  const implicit = await readSnapshot(surface, entityId, undefined, atIngested);
  const explicitFalse = await readSnapshot(surface, entityId, false, atIngested);
  expect(explicitFalse).toEqual(implicit);
  expect(Object.hasOwn(implicit.snapshot, "text")).toBe(false);
  expect(Object.hasOwn(implicit.provenance, "text")).toBe(false);
  expect(Object.hasOwn(implicit.snapshot, "amount")).toBe(false);
  expect(Object.hasOwn(implicit, "cleared_fields_included")).toBe(false);
  return { implicit, explicitFalse };
}

describe("conditional original declared-null native HTTP", () => {
  it.each(readSurfaces)(
    "reads conditional original snapshot and its history via %s",
    async (surface) => {
      const code = "projection-" + surface.toLowerCase().replaceAll(" ", "-");
      const first = await store(code, { text: null });
      expect(first.status).toBe(200);
      const receipt = first.body.operation_receipt;
      const raw = await call("/observations/query", { observation_id: receipt.observation_id });
      expect(raw.status).toBe(200);
      expect(raw.body.observations).toHaveLength(1);
      const original = raw.body.observations[0];
      expect(original.entity_id).toBe(receipt.entity_id);
      expect(original.fields.text).toBeNull();
      expect(original.user_id).toBe(LOCAL_DEV_USER_ID);
      const current = await readSnapshot(surface, receipt.entity_id, true);
      assertNullView(current, receipt.entity_id, original.id);
      const historical = await readSnapshot(surface, receipt.entity_id, true, original.created_at);
      assertNullView(historical, receipt.entity_id, original.id);
      expect(historical.observation_count).toBe(1);
      const defaults = await assertDefaultViews(surface, receipt.entity_id);
      const historicalDefaults = await assertDefaultViews(
        surface,
        receipt.entity_id,
        original.created_at
      );
      (evidence.cases as unknown[]).push({
        conditional_original_projection_surface: surface,
        receipt,
        original,
        current,
        historical,
        defaults,
        historicalDefaults,
      });
    }
  );
  it.each(readSurfaces)(
    "does not relabel a later equal-null winner or nonnull winner on replay via %s",
    async (surface) => {
      const code = "winner-" + surface.toLowerCase().replaceAll(" ", "-");
      const first = await store(code, { text: null });
      expect(first.status).toBe(200);
      const receipt = first.body.operation_receipt;
      const raw = await call("/observations/query", { observation_id: receipt.observation_id });
      expect(raw.status).toBe(200);
      expect(raw.body.observations).toHaveLength(1);
      const original = raw.body.observations[0];
      expect(original.entity_id).toBe(receipt.entity_id);
      expect(original.user_id).toBe(LOCAL_DEV_USER_ID);
      const current = await readSnapshot(surface, receipt.entity_id, true);
      assertNullView(current, receipt.entity_id, original.id);
      const human = await call("/corrections/transaction", {
        idempotency_key: code + "-human-null",
        entities: [
          {
            entity_id: receipt.entity_id,
            entity_type: type,
            expected_observation_count: current.observation_count,
            expected_snapshot: current.snapshot,
            changes: [{ field: "text", value: null }],
          },
        ],
      });
      expect(human.status, JSON.stringify(human.body)).toBe(200);
      const laterRaw = await call("/observations/query", {
        entity_id: receipt.entity_id,
        limit: 10,
      });
      expect(laterRaw.body.observations).toHaveLength(2);
      const later = laterRaw.body.observations.find((o: any) => o.id !== original.id);
      expect(later).toBeDefined();
      expect(later.fields).toEqual({ text: null });
      expect(later.user_id).toBe(original.user_id);
      expect(Date.parse(later.created_at)).toBeGreaterThan(Date.parse(original.created_at));
      const winner = await readSnapshot(surface, receipt.entity_id, true);
      assertNullView(winner, receipt.entity_id, later.id);
      expect(winner.provenance.text).not.toBe(receipt.observation_id);
      const historical = await readSnapshot(surface, receipt.entity_id, true, original.created_at);
      assertNullView(historical, receipt.entity_id, original.id);
      expect(historical.observation_count).toBe(1);
      const defaultLater = await assertDefaultViews(surface, receipt.entity_id);
      const defaultHistorical = await assertDefaultViews(
        surface,
        receipt.entity_id,
        original.created_at
      );
      const beforeReplay = await nativeCounts();
      const replay = await store(code, { text: null });
      expect(replay.status).toBe(200);
      expect(replay.body.operation_receipt).toEqual({ ...receipt, status: "replayed" });
      expect(await nativeCounts()).toEqual(beforeReplay);
      const afterReplay = await readSnapshot(surface, receipt.entity_id, true);
      assertNullView(afterReplay, receipt.entity_id, later.id);
      const nonnull = await call("/corrections/transaction", {
        idempotency_key: code + "-human-nonnull",
        entities: [
          {
            entity_id: receipt.entity_id,
            entity_type: type,
            expected_observation_count: afterReplay.observation_count,
            expected_snapshot: afterReplay.snapshot,
            changes: [{ field: "text", value: "later human value" }],
          },
        ],
      });
      expect(nonnull.status, JSON.stringify(nonnull.body)).toBe(200);
      const finalRaw = await call("/observations/query", {
        entity_id: receipt.entity_id,
        limit: 10,
      });
      expect(finalRaw.body.observations).toHaveLength(3);
      const finalOrigin = finalRaw.body.observations.find(
        (o: any) => o.fields.text === "later human value"
      );
      expect(finalOrigin).toBeDefined();
      const final = await readSnapshot(surface, receipt.entity_id, true);
      expect(final.cleared_fields_included).toBe(true);
      expect(final.snapshot.text).toBe("later human value");
      expect(final.provenance.text).toBe(finalOrigin.id);
      expect(final.provenance.text).not.toBe(receipt.observation_id);
      const beforeFinalReplay = await nativeCounts();
      const finalReplay = await store(code, { text: null });
      expect(finalReplay.body.operation_receipt).toEqual({ ...receipt, status: "replayed" });
      expect(finalReplay.body.entities[0].entity_snapshot_after.text).toBe("later human value");
      expect(await nativeCounts()).toEqual(beforeFinalReplay);
      expect((await readSnapshot(surface, receipt.entity_id, true)).provenance.text).toBe(
        finalOrigin.id
      );
      (evidence.cases as unknown[]).push({
        conditional_later_winner_surface: surface,
        receipt,
        original,
        human,
        later,
        winner,
        historical,
        defaultLater,
        defaultHistorical,
        replay,
        afterReplay,
        nonnull,
        finalOrigin,
        final,
        finalReplay,
        beforeReplay,
        beforeFinalReplay,
      });
    }
  );

  it("retains own declared JSON keys in native original raw, digest and replay", async () => {
    const fields = JSON.parse('{"__proto__":null}');
    const original = await store("own-key", fields);
    expect(original.status).toBe(200);
    const receipt = original.body.operation_receipt;
    const expected = JSON.parse('{"code":"own-key","__proto__":null}');
    const raw = await call("/observations/query", {
      observation_id: receipt.observation_id,
      limit: 2,
    });
    (evidence.cases as unknown[]).push({ own_declared_key: true, original, raw, expected });
    expect(receipt.original_observation_fields).toEqual(expected);
    expect(Object.hasOwn(receipt.original_observation_fields, "__proto__")).toBe(true);
    expect(receipt.diagnostics.fields_sha256).toBe(storeConditionRequestHash(expected));
    expect(raw.body.observations).toHaveLength(1);
    expect(raw.body.observations[0].fields).toEqual(expected);
    const replay = await store("own-key", fields);
    expect(replay.status).toBe(200);
    expect(replay.body.operation_receipt).toEqual({ ...receipt, status: "replayed" });
    const after = await call("/observations/query", { entity_id: receipt.entity_id, limit: 10 });
    expect(after.body.observations).toHaveLength(1);
    (evidence.cases as unknown[]).push({ own_declared_key: true, replay, after });
  });
  it.each(["text", "amount", "enabled", "at", "items", "detail", "converted"])(
    "retains explicit %s null in original raw, receipt, digest and replay",
    async (field) => {
      const original = await store("null-" + field, { [field]: null });
      expect(original.status, JSON.stringify(original.body)).toBe(200);
      const receipt = original.body.operation_receipt;
      const expected = { code: "null-" + field, [field]: null };
      const raw = await call("/observations/query", {
        observation_id: receipt.observation_id,
        limit: 2,
      });
      (evidence.cases as unknown[]).push({
        field,
        expected,
        original: original.body,
        raw: raw.body,
      });
      expect(receipt.original_observation_fields).toEqual(expected);
      expect(receipt.unknown_fields_count).toBe(0);
      expect(receipt.diagnostics.unknown_fields).toEqual([]);
      expect(receipt.diagnostics.fields_sha256).toBe(storeConditionRequestHash(expected));
      expect(raw.status).toBe(200);
      expect(raw.body.observations).toHaveLength(1);
      expect(raw.body.observations[0].fields).toEqual(expected);
      const replay = await store("null-" + field, { [field]: null });
      expect(replay.status).toBe(200);
      expect(replay.body.operation_receipt).toEqual({ ...receipt, status: "replayed" });
      const after = await call("/observations/query", {
        entity_id: receipt.entity_id,
        limit: 10,
      });
      expect(after.body.observations).toHaveLength(1);
      const changed = await store("null-" + field, {});
      expect(changed.status).toBe(409);
      expect(changed.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
      (evidence.cases as unknown[]).push({
        field,
        expected,
        original: original.body,
        raw: raw.body,
        replay: replay.body,
        after: after.body,
        absent_same_key: changed.body,
      });
    }
  );
  it("keeps absent absent, converts nonnull and refuses identity null/constraint violations", async () => {
    const result = await store("absent", { converted: 42 });
    expect(result.status).toBe(200);
    expect(result.body.operation_receipt.original_observation_fields).toEqual({
      code: "absent",
      converted: "42",
    });
    expect(Object.hasOwn(result.body.operation_receipt.original_observation_fields, "text")).toBe(
      false
    );
    const before = await nativeCounts();
    const identity = await store(null as unknown as string, { text: null }, "null-identity");
    expect(identity.status).toBe(400);
    const constraint = await store("constraint", { constrained: null });
    expect(constraint.status).toBe(400);
    expect(constraint.body.error.code).toBe("ERR_CONSTRAINT_VIOLATION");
    expect(await nativeCounts()).toEqual(before);
    const next = await store("constraint", { constrained: "allowed" });
    expect(next.status).toBe(200);
    (evidence.cases as unknown[]).push({
      before_refusals: before,
      valid_same_key_after_refusal: next.body,
      absent: result.body,
      identity_null: identity.body,
      constraint_null: constraint.body,
    });
  });
  it("retains zero-growth malformed request refusals and does not promote undeclared fields", async () => {
    const before = await nativeCounts();
    const key = "shape-refusal";
    for (const entities of [
      null,
      [
        { entity_type: type, code: "shape" },
        { entity_type: type, code: "second" },
      ],
      [{ entity_type: type, code: "shape", target_id: null }],
    ]) {
      const result = await call("/store", {
        entities,
        expected_entity_absent: true,
        idempotency_key: key,
        strict: true,
      });
      expect(result.status).toBe(400);
      expect(await nativeCounts()).toEqual(before);
    }
    const after = await store("shape", {}, key);
    expect(after.status).toBe(200);
    const unknown = await store("undeclared", { undeclared: null });
    expect(unknown.status).toBe(200);
    expect(unknown.body.operation_receipt.original_observation_fields).toEqual({
      code: "undeclared",
    });
    expect(unknown.body.operation_receipt.diagnostics.unknown_fields).toContain("undeclared");
    (evidence.cases as unknown[]).push({
      malformed_refusal_zero_growth: true,
      unconsumed_key_after_refusals: after.body,
      undeclared_existing_behavior: unknown.body,
    });
  });
  it("preserves ordinary null omission and concurrent conditional replay without observation growth", async () => {
    const ordinary = await call("/store", {
      entities: [{ entity_type: type, code: "ordinary", text: null, at: null }],
      idempotency_key: "ordinary",
      strict: true,
    });
    expect(ordinary.status).toBe(200);
    const entityId = ordinary.body.entities[0].entity_id;
    const oldRaw = await call("/observations/query", {
      entity_id: entityId,
      limit: 10,
    });
    expect(oldRaw.body.observations).toHaveLength(1);
    expect(oldRaw.body.observations[0].fields).toEqual({ code: "ordinary", text: null, at: null });
    expect(ordinary.body.entities[0].entity_snapshot_after).toEqual({ code: "ordinary" });
    const pair = await Promise.all([
      store("concurrent", { text: null }),
      store("concurrent", { text: null }),
    ]);
    for (const response of pair) expect(response.status).toBe(200);
    expect(pair.map((x) => x.body.operation_receipt.status).sort()).toEqual([
      "applied",
      "replayed",
    ]);
    expect(pair[0].body.operation_receipt.original_observation_fields).toEqual({
      code: "concurrent",
      text: null,
    });
    const current = await call("/observations/query", {
      entity_id: pair[0].body.operation_receipt.entity_id,
      limit: 10,
    });
    expect(current.body.observations).toHaveLength(1);
    (evidence.cases as unknown[]).push({
      ordinary: ordinary.body,
      ordinary_raw: oldRaw.body,
      concurrent: pair.map((x) => x.body),
      current: current.body,
    });
  });
  it("retains original nulls through actual modern MCP and exact replay", async () => {
    const args = {
      expected_entity_absent: true,
      idempotency_key: "modern-null",
      entities: [
        {
          entity_type: type,
          code: "modern",
          text: null,
          at: null,
          converted: null,
          ...JSON.parse('{"__proto__":null}'),
        },
      ],
    };
    const send = () =>
      modernPost(
        server.baseUrl,
        { id: 1, method: "tools/call", params: { name: "store", arguments: args } },
        { headers: { Authorization: `Bearer ${server.token}` } }
      );
    const first = await send();
    expect(first.status, first.text).toBe(200);
    expect(first.body?.result?.isError).not.toBe(true);
    const receipt = toolResultJson(first.body).operation_receipt as Record<string, unknown>;
    expect(receipt.original_observation_fields).toEqual({
      code: "modern",
      text: null,
      at: null,
      converted: null,
      ...JSON.parse('{"__proto__":null}'),
    });
    const raw = await call("/observations/query", { observation_id: receipt.observation_id });
    expect(raw.body.observations).toHaveLength(1);
    expect(raw.body.observations[0].fields).toEqual(receipt.original_observation_fields);
    expect((receipt.diagnostics as Record<string, unknown>).fields_sha256).toBe(
      storeConditionRequestHash(receipt.original_observation_fields)
    );
    const before = await nativeCounts();
    expect(toolResultJson((await send()).body).operation_receipt).toEqual({
      ...receipt,
      status: "replayed",
    });
    expect(await nativeCounts()).toEqual(before);
    (evidence.cases as unknown[]).push({
      surface: "modern_MCP",
      receipt,
      raw: raw.body,
      replay_zero_growth: true,
    });
  });
  it.each(["body", "params"])(
    "retains originals through compiled generic CLI --%s",
    async (flag) => {
      const input = {
        expected_entity_absent: true,
        idempotency_key: "cli-null-" + flag,
        entities: [
          {
            entity_type: type,
            code: "cli-" + flag,
            text: null,
            at: null,
            converted: null,
            ...JSON.parse('{"__proto__":null}'),
          },
        ],
      };
      const run = promisify(execFile);
      async function send() {
        const out = await run(
          process.execPath,
          [
            "dist/cli/index.js",
            "--no-log-file",
            "--json",
            "--base-url",
            server.baseUrl,
            "request",
            "--operation",
            "store",
            `--${flag}`,
            JSON.stringify(flag === "params" ? { body: input } : input),
          ],
          {
            timeout: 20000,
            env: {
              ...process.env,
              NEOTOMA_BEARER_TOKEN: server.token,
              NEOTOMA_FORCE_LOCAL_TRANSPORT: "false",
            },
          }
        );
        return JSON.parse(out.stdout);
      }
      const first = await send();
      const receipt = first.operation_receipt;
      expect(receipt.original_observation_fields).toEqual({
        code: "cli-" + flag,
        text: null,
        at: null,
        converted: null,
        ...JSON.parse('{"__proto__":null}'),
      });
      expect(receipt.diagnostics.fields_sha256).toBe(
        storeConditionRequestHash(receipt.original_observation_fields)
      );
      const before = await nativeCounts();
      expect((await send()).operation_receipt).toEqual({ ...receipt, status: "replayed" });
      expect(await nativeCounts()).toEqual(before);
      const raw = await call("/observations/query", { observation_id: receipt.observation_id });
      expect(raw.body.observations).toHaveLength(1);
      expect(raw.body.observations[0].fields).toEqual(receipt.original_observation_fields);
      (evidence.cases as unknown[]).push({
        surface: "compiled_CLI_" + flag,
        receipt,
        raw: raw.body,
        replay_zero_growth: true,
      });
    }
  );
});
