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
    for (const table of ["observations", "entities"])
      await db.from(table).delete().eq("user_id", user);
  events.length = 0;
  substrateEventBus.onSubstrateEvent(listener);
});
afterEach(async () => {
  substrateEventBus.removeListener("substrate_event", listener);
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
  it("durably binds each new key without changing the original revocation time", async () => {
    const s = await seed();
    const first = await tokens.revokeGuestAccessToken(owner, s.id, s.request);
    const nextRequest = { ...s.request, idempotency_key: "another-key" };
    const next = await tokens.revokeGuestAccessToken(owner, s.id, nextRequest);
    expect(next.revoked_at).toBe(first.revoked_at);
    expect(next.revocation_observation_id).not.toBe(first.revocation_observation_id);
    expect(await rows(s.id)).toHaveLength(3);
    expect(await tokens.revokeGuestAccessToken(owner, s.id, nextRequest)).toEqual({
      ...next,
      replayed: true,
    });
    expect(await rows(s.id)).toHaveLength(3);
    const second = await seed();
    await expect(
      tokens.revokeGuestAccessToken(owner, second.id, {
        ...second.request,
        idempotency_key: nextRequest.idempotency_key,
      })
    ).rejects.toMatchObject({ status: 409 });
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
    });
    await expect(
      tokens.revokeGuestAccessToken(owner, s.id, { ...s.request, expected_observation_id: "stale" })
    ).rejects.toMatchObject({ status: 409 });
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
  it.each([{}, { revoked_at: "2026-01-01T00:00:00.000Z" }, { token_hash: "ambiguous" }])(
    "refuses incomplete or ambiguous raw history",
    async (fields) => {
      const s = await seed();
      await db.from("observations").insert({ ...s.original, id: randomUUID(), fields });
      await expect(tokens.revokeGuestAccessToken(owner, s.id, s.request)).rejects.toMatchObject({
        status: 409,
      });
      expect(await rows(s.id)).toHaveLength(2);
      expect(events).toHaveLength(0);
    }
  );
});
