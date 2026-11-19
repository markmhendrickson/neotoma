import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../db.js";
import { getDb } from "../repositories/db/connection.js";
import * as tokens from "./guest_access_token.js";
import { substrateEventBus } from "../events/substrate_event_bus.js";
const owner = "test-guest-revoke-owner";
const other = "test-guest-revoke-other";
const events: unknown[] = [];
const listener = (event: unknown) => events.push(event);
async function seed(user = owner) {
  const token = await tokens.generateGuestAccessToken({
    userId: user,
    entityIds: ["ent_test_guest_revoke"],
  });
  const id = `guest_token_${tokens.hashGuestAccessToken(token).slice(0, 16)}`;
  const result = await db.from("observations").select("*").eq("entity_id", id).eq("user_id", user);
  expect(result.error).toBeNull();
  const original = result.data![0];
  return {
    token,
    id,
    original,
    request: { idempotency_key: randomUUID(), expected_observation_id: original.id },
  };
}
async function rows(id: string, user = owner) {
  const r = await db.from("observations").select("*").eq("entity_id", id).eq("user_id", user);
  expect(r.error).toBeNull();
  return r.data!;
}
beforeEach(async () => {
  for (const user of [owner, other])
    for (const table of ["observations", "entity_snapshots", "entities"])
      await db.from(table).delete().eq("user_id", user);
  events.length = 0;
  substrateEventBus.onSubstrateEvent(listener);
});
afterEach(async () => {
  substrateEventBus.removeListener("substrate_event", listener);
  await db
    .from("entity_snapshots")
    .delete()
    .eq("entity_id", "ent_test_guest_revoke_policy")
    .eq("user_id", owner);
  await db.from("entities").delete().eq("id", "ent_test_guest_revoke_policy").eq("user_id", owner);
  await (await getDb()).exec("DROP TRIGGER IF EXISTS reject_guest_revocation");
  await (await getDb()).exec("DROP TRIGGER IF EXISTS corrupt_guest_revocation");
});
describe("immutable owner guest-token revocation", () => {
  it("does not resurrect a fully revoked token behind a newer grant-shaped row", async () => {
    const s = await seed();
    expect(await tokens.validateGuestAccessToken(s.token)).not.toBeNull();
    await db.from("observations").insert({
      ...s.original,
      id: randomUUID(),
      fields: { ...s.original.fields, revoked_at: new Date().toISOString() },
      observed_at: "2098-01-01T00:00:00.000Z",
    });
    await db
      .from("observations")
      .insert({ ...s.original, id: randomUUID(), observed_at: "2099-01-01T00:00:00.000Z" });
    expect(await tokens.validateGuestAccessToken(s.token)).toBeNull();
  });
  it("preserves the entire original record, denies the old token, and replays without growth", async () => {
    const s = await seed();
    const unaffected = await seed();
    const first = await tokens.revokeGuestAccessToken(owner, s.id, s.request);
    expect(first).toMatchObject({ revoked: true, replayed: false, token_entity_id: s.id });
    const stored = await rows(s.id);
    expect(stored).toHaveLength(2);
    expect(stored.find((r) => r.id === s.original.id)).toEqual(s.original);
    expect(stored.find((r) => r.id === first.revocation_observation_id)?.fields).toEqual({
      ...s.original.fields,
      revoked_at: first.revoked_at,
    });
    expect(await tokens.validateGuestAccessToken(s.token)).toBeNull();
    expect(await tokens.validateGuestAccessToken(unaffected.token)).not.toBeNull();
    expect(await tokens.revokeGuestAccessToken(owner, s.id, s.request)).toEqual({
      ...first,
      replayed: true,
    });
    expect(await rows(s.id)).toHaveLength(2);
    expect(events).toHaveLength(1);
    expect(Object.keys(first).sort()).toEqual([
      "replayed",
      "revocation_observation_id",
      "revoked",
      "revoked_at",
      "token_entity_id",
    ]);
  });
  it("replays an already revoked token under a new key without another witness", async () => {
    const s = await seed();
    const first = await tokens.revokeGuestAccessToken(owner, s.id, s.request);
    const nextRequest = { ...s.request, idempotency_key: "another-key" };
    expect(await tokens.revokeGuestAccessToken(owner, s.id, nextRequest)).toEqual({
      ...first,
      replayed: true,
    });
    expect(await rows(s.id)).toHaveLength(2);
    const second = await seed();
    await expect(
      tokens.revokeGuestAccessToken(owner, second.id, {
        ...second.request,
        idempotency_key: s.request.idempotency_key,
      })
    ).rejects.toMatchObject({ status: 409, code: "ERR_GUEST_TOKEN_IDEMPOTENCY_CONFLICT" });
    expect(await rows(second.id)).toHaveLength(1);
  });
  it("serializes concurrent identical calls into one append and one replay", async () => {
    const s = await seed();
    const results = await Promise.all([
      tokens.revokeGuestAccessToken(owner, s.id, s.request),
      tokens.revokeGuestAccessToken(owner, s.id, s.request),
    ]);
    expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
    expect(results[0].revocation_observation_id).toBe(results[1].revocation_observation_id);
    expect(await rows(s.id)).toHaveLength(2);
  });
  it("rejects another owner and stale original before any observation or event", async () => {
    const s = await seed();
    await expect(tokens.revokeGuestAccessToken(other, s.id, s.request)).rejects.toMatchObject({
      status: 404,
      code: "RESOURCE_NOT_FOUND",
    });
    await expect(
      tokens.revokeGuestAccessToken(owner, s.id, { ...s.request, expected_observation_id: "stale" })
    ).rejects.toMatchObject({ status: 409, code: "ERR_GUEST_TOKEN_ORIGINAL_STALE" });
    expect(await rows(s.id)).toHaveLength(1);
    expect(events).toHaveLength(0);
  });
  it("rolls back failed insert and failed whole-record readback", async () => {
    const s = await seed();
    const connection = await getDb();
    await connection.exec(
      "CREATE TRIGGER reject_guest_revocation BEFORE INSERT ON observations WHEN NEW.idempotency_key IS NOT NULL BEGIN SELECT RAISE(ABORT, 'synthetic insertion failure'); END"
    );
    await expect(tokens.revokeGuestAccessToken(owner, s.id, s.request)).rejects.toMatchObject({
      status: 503,
    });
    expect(await rows(s.id)).toHaveLength(1);
    await connection.exec("DROP TRIGGER reject_guest_revocation");
    await connection.exec(
      "CREATE TRIGGER corrupt_guest_revocation AFTER INSERT ON observations WHEN NEW.idempotency_key IS NOT NULL BEGIN UPDATE observations SET entity_type = 'invalid' WHERE id = NEW.id; END"
    );
    await expect(tokens.revokeGuestAccessToken(owner, s.id, s.request)).rejects.toMatchObject({
      status: 503,
    });
    expect(await rows(s.id)).toHaveLength(1);
    expect(await tokens.validateGuestAccessToken(s.token)).not.toBeNull();
    expect(events).toHaveLength(0);
  });
  it.each([
    [{ token_hash: "f".repeat(64) }, "a different token hash"],
    ["{not json", "an unreadable record"],
  ])("refuses a history row with %s", async (fields) => {
    const s = await seed();
    await db.from("observations").insert({ ...s.original, id: randomUUID(), fields });
    await expect(tokens.revokeGuestAccessToken(owner, s.id, s.request)).rejects.toMatchObject({
      status: 409,
      code: "ERR_GUEST_TOKEN_HISTORY_UNREADABLE",
    });
    expect(await rows(s.id)).toHaveLength(2);
    expect(events).toHaveLength(0);
  });
  it("revokes a token narrowed by a partial correction row", async () => {
    const s = await seed();
    await db.from("observations").insert({
      ...s.original,
      id: randomUUID(),
      fields: { ttl_seconds: 600 },
      observed_at: "2098-01-01T00:00:00.000Z",
    });
    expect(await tokens.validateGuestAccessToken(s.token)).toMatchObject({ ttl_seconds: 600 });
    const receipt = await tokens.revokeGuestAccessToken(owner, s.id, s.request);
    expect(receipt).toMatchObject({ revoked: true, replayed: false, token_entity_id: s.id });
    expect(await rows(s.id)).toHaveLength(3);
    expect(await tokens.validateGuestAccessToken(s.token)).toBeNull();
    expect(events).toHaveLength(1);
  });
  it("replays a token already revoked by a correction as an idempotent receipt", async () => {
    const s = await seed();
    const correctionId = randomUUID();
    await db.from("observations").insert({
      ...s.original,
      id: correctionId,
      fields: { revoked_at: "2026-01-01T00:00:00.000Z" },
      observed_at: "2098-01-01T00:00:00.000Z",
    });
    const receipt = await tokens.revokeGuestAccessToken(owner, s.id, s.request);
    expect(receipt).toEqual({
      revoked: true,
      replayed: true,
      token_entity_id: s.id,
      revocation_observation_id: correctionId,
      revoked_at: "2026-01-01T00:00:00.000Z",
    });
    expect(await rows(s.id)).toHaveLength(2);
    expect(events).toHaveLength(0);
  });
  it("honours a lifecycle-deleted record: revocation is accepted and the token stays refused", async () => {
    const s = await seed();
    for (const [fields, observed_at] of [
      [{ _deleted: true, deleted_at: "2098-01-01T00:00:00.000Z" }, "2098-01-01T00:00:00.000Z"],
      [{ _deleted: false, restored_at: "2098-01-02T00:00:00.000Z" }, "2098-01-02T00:00:00.000Z"],
    ] as const)
      await db
        .from("observations")
        .insert({ ...s.original, id: randomUUID(), fields, observed_at });
    expect(await tokens.validateGuestAccessToken(s.token)).toBeNull();
    const receipt = await tokens.revokeGuestAccessToken(owner, s.id, s.request);
    expect(receipt).toMatchObject({ revoked: true, replayed: false });
    expect(await rows(s.id)).toHaveLength(4);
    expect(await tokens.validateGuestAccessToken(s.token)).toBeNull();
  });
  it("honors the real stored instance policy before a revocation witness or event", async () => {
    const s = await seed();
    const policyId = "ent_test_guest_revoke_policy";
    const policy = { enforcement: "enforced", out_of_scope_entity_types: ["guest_access_token"] };
    expect(
      (
        await db.from("entities").insert({
          id: policyId,
          entity_type: "instance_policy",
          canonical_name: "Synthetic revocation policy",
          user_id: owner,
        })
      ).error
    ).toBeNull();
    expect(
      (
        await db.from("entity_snapshots").insert({
          entity_id: policyId,
          entity_type: "instance_policy",
          schema_version: "1.0",
          snapshot: policy,
          user_id: owner,
        })
      ).error
    ).toBeNull();
    const { getInstancePolicyResult } = await import("./instance_policy.js");
    expect((await getInstancePolicyResult()).policy?.out_of_scope_entity_types).toEqual([
      "guest_access_token",
    ]);
    await expect(tokens.revokeGuestAccessToken(owner, s.id, s.request)).rejects.toMatchObject({
      code: "ERR_STORE_POLICY_DENIED",
    });
    expect(await rows(s.id)).toHaveLength(1);
    expect(events).toHaveLength(0);
    expect(await tokens.validateGuestAccessToken(s.token)).not.toBeNull();
    await db.from("entity_snapshots").delete().eq("entity_id", policyId).eq("user_id", owner);
    await db.from("entities").delete().eq("id", policyId).eq("user_id", owner);
    expect((await tokens.revokeGuestAccessToken(owner, s.id, s.request)).revoked).toBe(true);
    expect(await rows(s.id)).toHaveLength(2);
  });
});
