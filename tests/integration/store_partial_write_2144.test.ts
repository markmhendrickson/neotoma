/**
 * Regression tests for #2144: a `/store` whose write loop is interrupted part
 * way must never be reported as a plain success afterwards.
 *
 * The defect, end to end:
 *   1. `storeRawContent` persists the `sources` row carrying the idempotency key
 *      BEFORE any observation exists, and nothing recorded completion.
 *   2. The entity resolution pass creates every entity row up front, so an
 *      interrupted loop left the remaining entities as empty shells.
 *   3. A replay of the same key compared only `content_hash` and answered
 *      `success: true, replayed: true` with however many observations existed.
 *
 * The interruption is injected as a DB-level fault (a trigger that refuses the
 * observation insert for entities past a cut-off). That is the same shape as a
 * client abort rejecting a read inside the loop: the call throws part way
 * through, with the first N observations committed and the rest not. The abort
 * signal itself is covered by `store_abort_context_2144.test.ts`, because the
 * default test backend ignores abort contexts entirely.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { storeStructuredForApi } from "../../src/actions.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { NeotomaServer } from "../../src/server.js";

const ENTITY_TYPE = "store_partial_write_2144_note";
const TOTAL = 24;
const CUT_OFF = 11;

let userId: string;
let batch: string;
let triggerName: string;

function makeEntities(count: number = TOTAL) {
  return Array.from({ length: count }, (_, seq) => ({
    entity_type: ENTITY_TYPE,
    title: `partial write ${batch} ${seq}`,
    batch,
    seq,
  }));
}

/** Refuse observation inserts for entities at or past `cutOff` in this batch. */
async function installInterruption(cutOff: number): Promise<void> {
  const conn = await getDb();
  await conn.exec(
    `CREATE TRIGGER ${triggerName} BEFORE INSERT ON observations ` +
      `WHEN json_extract(NEW.fields, '$.batch') = '${batch}' ` +
      `AND json_extract(NEW.fields, '$.seq') >= ${cutOff} ` +
      `BEGIN SELECT RAISE(ABORT, 'injected interruption'); END`
  );
}

async function removeInterruption(): Promise<void> {
  const conn = await getDb();
  await conn.exec(`DROP TRIGGER IF EXISTS ${triggerName}`);
}

async function observationCount(): Promise<number> {
  const { data } = await db.from("observations").select("id").eq("user_id", userId);
  return (data ?? []).length;
}

/** Entities of this test's type that have no observation at all. */
async function emptyShellCount(): Promise<number> {
  const { data: ents } = await db
    .from("entities")
    .select("id")
    .eq("user_id", userId)
    .eq("entity_type", ENTITY_TYPE);
  const { data: obs } = await db.from("observations").select("entity_id").eq("user_id", userId);
  const withObs = new Set((obs ?? []).map((o: { entity_id: string }) => o.entity_id));
  return (ents ?? []).filter((e: { id: string }) => !withObs.has(e.id)).length;
}

async function entityCount(): Promise<number> {
  const { data } = await db
    .from("entities")
    .select("id")
    .eq("user_id", userId)
    .eq("entity_type", ENTITY_TYPE);
  return (data ?? []).length;
}

async function cleanup(): Promise<void> {
  await removeInterruption();
  const { data: sources } = await db.from("sources").select("id").eq("user_id", userId);
  const sourceIds = (sources ?? []).map((s: { id: string }) => s.id);
  const { data: ents } = await db.from("entities").select("id").eq("user_id", userId);
  const entityIds = (ents ?? []).map((e: { id: string }) => e.id);
  if (entityIds.length > 0) {
    await db.from("entity_snapshots").delete().in("entity_id", entityIds);
  }
  await db.from("observations").delete().eq("user_id", userId);
  await db.from("interpretations").delete().eq("user_id", userId);
  if (sourceIds.length > 0) {
    await db.from("raw_fragments").delete().in("source_id", sourceIds);
    await db.from("sources").delete().in("id", sourceIds);
  }
  if (entityIds.length > 0) {
    await db.from("entities").delete().in("id", entityIds);
  }
}

async function storeAll(
  key: string,
  entities = makeEntities(),
  extra: Record<string, unknown> = {}
) {
  return storeStructuredForApi({
    userId,
    entities,
    sourcePriority: 100,
    idempotencyKey: key,
    ...extra,
  });
}

describe("store: an interrupted write is never reported as a plain success (#2144)", () => {
  beforeEach(() => {
    userId = randomUUID();
    batch = randomUUID().replace(/-/g, "").slice(0, 12);
    triggerName = `interrupt_2144_${batch}`;
  });
  afterEach(cleanup);

  it("leaves the interrupted state the bug describes (precondition, not the fix)", async () => {
    await installInterruption(CUT_OFF);
    await expect(storeAll(`pre-${randomUUID()}`)).rejects.toThrow(/injected interruption/);

    // Without this the tests below could pass vacuously.
    expect(await observationCount()).toBe(CUT_OFF);
    expect(await entityCount()).toBe(TOTAL);
    expect(await emptyShellCount()).toBe(TOTAL - CUT_OFF);
  });

  it("completes the write on a same-key replay: all entities end up with observations", async () => {
    const key = `resume-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(storeAll(key)).rejects.toThrow(/injected interruption/);
    await removeInterruption();

    const replay = await storeAll(key);

    expect(await observationCount()).toBe(TOTAL);
    expect(await emptyShellCount()).toBe(0);
    expect(replay.success).toBe(true);
    expect(replay.entities).toHaveLength(TOTAL);
    // Every reported entity carries an observation and a populated snapshot.
    for (const entry of replay.entities as Array<{
      observation_id: string | null;
      entity_snapshot_after: Record<string, unknown> | null;
    }>) {
      expect(entry.observation_id).toBeTruthy();
      expect(entry.entity_snapshot_after).toBeTruthy();
    }
  });

  it("never reports plain success with fewer observations than requested", async () => {
    const key = `never-plain-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(storeAll(key)).rejects.toThrow(/injected interruption/);

    // Replay while the fault persists: the write cannot finish, so the call
    // must say so rather than answer success for the 11 that landed.
    const outcome = await storeAll(key).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error })
    );
    if (outcome.ok) {
      const replay = outcome.value as { observations_created: number; entities: unknown[] };
      expect(replay.observations_created).toBe(TOTAL);
      expect(replay.entities).toHaveLength(TOTAL);
    } else {
      expect(String((outcome.error as Error).message)).toMatch(/injected interruption/);
    }
    expect(await observationCount()).toBeLessThanOrEqual(TOTAL);

    // And once the fault clears, the same key finishes the job.
    await removeInterruption();
    await storeAll(key);
    expect(await observationCount()).toBe(TOTAL);
  });

  it("repairs a key already stranded by the old behaviour (no completion marker on the source)", async () => {
    const key = `legacy-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(storeAll(key)).rejects.toThrow(/injected interruption/);
    await removeInterruption();

    // Rows written before this fix carry no marker. Strip it so the source
    // looks exactly like one the old code left behind.
    const { data: source } = await db
      .from("sources")
      .select("id, provenance")
      .eq("user_id", userId)
      .eq("idempotency_key", key)
      .single();
    const provenance = { ...((source?.provenance as Record<string, unknown>) ?? {}) };
    delete provenance.store_write;
    await db.from("sources").update({ provenance }).eq("id", source!.id);

    await storeAll(key);

    expect(await observationCount()).toBe(TOTAL);
    expect(await emptyShellCount()).toBe(0);

    // The repaired key now replays as an ordinary, complete replay.
    const again = await storeAll(key);
    expect(again.replayed).toBe(true);
    expect(again.observations_created).toBe(TOTAL);
  });

  it("does not duplicate observations when resuming", async () => {
    const key = `no-dup-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(storeAll(key)).rejects.toThrow(/injected interruption/);
    await removeInterruption();

    await storeAll(key);
    await storeAll(key);

    expect(await observationCount()).toBe(TOTAL);
  });

  it("refuses to resume an interpretation write it cannot make idempotent", async () => {
    const key = `interp-${randomUUID()}`;
    const interpretation = { source_ref: "structured" as const };
    await installInterruption(CUT_OFF);
    await expect(storeAll(key, makeEntities(), { interpretation })).rejects.toThrow(
      /injected interruption/
    );
    await removeInterruption();

    // A resumed write would mint a fresh interpretation run, so observation ids
    // differ from the ones already written and the 11 would be duplicated.
    // The honest answer is an explicit error, never a plain success.
    await expect(storeAll(key, makeEntities(), { interpretation })).rejects.toMatchObject({
      code: "ERR_STORE_WRITE_INCOMPLETE",
    });
    expect(await observationCount()).toBe(CUT_OFF);
  });

  it("still rejects a changed payload under the key of an unfinished write", async () => {
    const key = `mismatch-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(storeAll(key)).rejects.toThrow(/injected interruption/);
    await removeInterruption();

    // The unfinished state must not let a different payload resume under the
    // old key: the content-hash guard comes first.
    await expect(storeAll(key, makeEntities(3))).rejects.toMatchObject({
      code: "ERR_IDEMPOTENCY_MISMATCH",
    });
    expect(await observationCount()).toBe(CUT_OFF);
  });

  it("serialises a replay that arrives while the original write is still running", async () => {
    const key = `concurrent-${randomUUID()}`;
    const [first, second] = await Promise.all([storeAll(key), storeAll(key)]);

    expect(await observationCount()).toBe(TOTAL);
    expect(await emptyShellCount()).toBe(0);
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    // Exactly one of the two did the writing; the other saw the finished write.
    const replayed = [first, second].filter((r) => r.replayed === true);
    expect(replayed).toHaveLength(1);
    expect(replayed[0].observations_created).toBe(TOTAL);
  });

  it("MCP store path: a same-key replay completes an interrupted write", async () => {
    const server = new NeotomaServer();
    (server as unknown as { authenticatedUserId: string }).authenticatedUserId = userId;
    const mcpStore = async (key: string) => {
      const response = await (
        server as unknown as {
          store: (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
        }
      ).store({
        user_id: userId,
        idempotency_key: key,
        entities: makeEntities(),
        source_priority: 100,
      });
      return JSON.parse(response.content[0].text) as {
        entities: Array<{ observation_id: string | null }>;
      };
    };
    const key = `mcp-resume-${randomUUID()}`;

    await installInterruption(CUT_OFF);
    await expect(mcpStore(key)).rejects.toThrow(/injected interruption/);
    await removeInterruption();
    expect(await observationCount()).toBe(CUT_OFF);

    const replay = await mcpStore(key);

    expect(replay.entities).toHaveLength(TOTAL);
    expect(replay.entities.every((entry) => entry.observation_id)).toBe(true);
    expect(await observationCount()).toBe(TOTAL);
    expect(await emptyShellCount()).toBe(0);

    // And the finished key is an ordinary replay afterwards: nothing re-written.
    await mcpStore(key);
    expect(await observationCount()).toBe(TOTAL);
  });

  it("leaves the replay of a complete write unchanged", async () => {
    const key = `complete-${randomUUID()}`;
    const entities = makeEntities(3);
    const first = await storeAll(key, entities);
    expect(first.replayed).not.toBe(true);
    expect(first.observations_created).toBe(3);

    const replay = await storeAll(key, entities);

    expect(replay.success).toBe(true);
    expect(replay.replayed).toBe(true);
    expect(replay.entities_created).toBe(0);
    expect(replay.observations_created).toBe(3);
    expect((replay.entities as Array<{ deduplicated: boolean }>).every((e) => e.deduplicated)).toBe(
      true
    );
    expect(await observationCount()).toBe(3);
  });
});
