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

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { db } from "../../src/db.js";
import { app, storeStructuredForApi } from "../../src/actions.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { NeotomaServer } from "../../src/server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { incompleteStoreHint } from "../../src/services/store_write_state.js";

const ENTITY_TYPE = "store_partial_write_2144_note";
const TOTAL = 24;
const CUT_OFF = 11;

let userId: string;
let batch: string;
let triggerName: string;

function makeEntities(count: number = TOTAL, entityType: string = ENTITY_TYPE) {
  return Array.from({ length: count }, (_, seq) => ({
    entity_type: entityType,
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

// ---------------------------------------------------------------------------
// Resume of requests the resolver would otherwise refuse (strict, create_new,
// name_collision_policy: reject), and the guards a resume must keep.
// ---------------------------------------------------------------------------

type StoreHttpBody = {
  replayed?: boolean;
  error_code?: string;
  message?: string;
  details?: {
    hint?: string;
    source_id?: string;
    entities_requested?: number;
    entities_written?: number;
    missing_entity_indexes?: number[];
  };
};

type McpStoreResult = {
  entities: Array<{ observation_id: string | null }>;
};

function mcpStoreFor(server: NeotomaServer, uid: string) {
  return async (
    key: string,
    extra: Record<string, unknown> = {},
    entities: unknown[] = makeEntities()
  ): Promise<McpStoreResult> => {
    const response = await (
      server as unknown as {
        store: (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
      }
    ).store({
      user_id: uid,
      idempotency_key: key,
      entities,
      source_priority: 100,
      ...extra,
    });
    return JSON.parse(response.content[0].text) as McpStoreResult;
  };
}

function newMcpServer(uid: string): NeotomaServer {
  const server = new NeotomaServer();
  (server as unknown as { authenticatedUserId: string }).authenticatedUserId = uid;
  return server;
}

/**
 * Register a user-scoped note type. By default its identity is the heuristic
 * title; pass `identity` to declare `canonical_name_fields` instead (a payload
 * that lacks those fields then falls back to the title heuristic).
 */
async function registerNoteType(
  entityType: string,
  extra: Record<string, unknown> = {},
  identity: Record<string, unknown> = { identity_opt_out: "heuristic_canonical_name" }
) {
  await schemaRegistry.register({
    entity_type: entityType,
    schema_version: "1.0",
    schema_definition: {
      fields: {
        title: { type: "string", required: false },
        external_id: { type: "string", required: false },
        batch: { type: "string", required: false },
        seq: { type: "number", required: false },
      },
      ...identity,
      ...extra,
    },
    reducer_config: {
      merge_policies: {
        title: { strategy: "last_write" },
        batch: { strategy: "last_write" },
        seq: { strategy: "last_write" },
      },
    },
    user_id: userId,
    user_specific: true,
    activate: true,
  });
}

describe("store: resuming an interrupted write under identity-refusing requests (#2144)", () => {
  beforeEach(() => {
    userId = randomUUID();
    batch = randomUUID().replace(/-/g, "").slice(0, 12);
    triggerName = `interrupt_2144_${batch}`;
  });
  afterEach(cleanup);

  it("HTTP core: strict: true resumes to all observations (it used to refuse every entity)", async () => {
    const key = `strict-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(storeAll(key, makeEntities(), { strict: true })).rejects.toThrow(
      /injected interruption/
    );
    await removeInterruption();
    expect(await observationCount()).toBe(CUT_OFF);

    const replay = await storeAll(key, makeEntities(), { strict: true });

    expect(replay.success).toBe(true);
    expect(await observationCount()).toBe(TOTAL);
    expect(await emptyShellCount()).toBe(0);
    expect(replay.entities).toHaveLength(TOTAL);
  });

  it('HTTP core: intent: "create_new" resumes to all observations', async () => {
    const key = `create-new-${randomUUID()}`;
    const entities = makeEntities().map((e) => ({ ...e, intent: "create_new" }));
    await installInterruption(CUT_OFF);
    await expect(storeAll(key, entities)).rejects.toThrow(/injected interruption/);
    await removeInterruption();
    expect(await observationCount()).toBe(CUT_OFF);

    const replay = await storeAll(key, entities);

    expect(replay.success).toBe(true);
    expect(await observationCount()).toBe(TOTAL);
    expect(await emptyShellCount()).toBe(0);
  });

  it("HTTP core: a name_collision_policy: reject type resumes to all observations", async () => {
    const rejectType = `store_partial_write_2144_reject_${batch}`;
    // Identity is declared on a field the payload does not carry, so resolution
    // falls back to the title heuristic, which this policy refuses to merge into.
    await registerNoteType(
      rejectType,
      { name_collision_policy: "reject" },
      { canonical_name_fields: ["external_id"] }
    );
    const key = `reject-${randomUUID()}`;
    const entities = makeEntities(TOTAL, rejectType);
    await installInterruption(CUT_OFF);
    await expect(storeAll(key, entities)).rejects.toThrow(/injected interruption/);
    await removeInterruption();
    expect(await observationCount()).toBe(CUT_OFF);

    const replay = await storeAll(key, entities);

    expect(replay.success).toBe(true);
    expect(await observationCount()).toBe(TOTAL);
  });

  it("MCP: strict: true resumes to all observations (it used to fail 'no entities were written')", async () => {
    const mcpStore = mcpStoreFor(newMcpServer(userId), userId);
    const key = `mcp-strict-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(mcpStore(key, { strict: true })).rejects.toThrow(/injected interruption/);
    await removeInterruption();
    expect(await observationCount()).toBe(CUT_OFF);

    const replay = await mcpStore(key, { strict: true });

    expect(replay.entities).toHaveLength(TOTAL);
    expect(replay.entities.every((entry) => entry.observation_id)).toBe(true);
    expect(await observationCount()).toBe(TOTAL);
    expect(await emptyShellCount()).toBe(0);
  });

  // The skip is for the write's OWN entities only. If an entity also carries an
  // observation from another source it is a real merge target, and strict must
  // still refuse it.
  it("HTTP core: strict still refuses an entity that carries another source's observation", async () => {
    const key = `strict-neg-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(storeAll(key, makeEntities(), { strict: true })).rejects.toThrow(
      /injected interruption/
    );
    await removeInterruption();

    // Another write (different key, no batch tag) lands an observation on the
    // identity of entity 20, which the interrupted attempt left as a shell.
    await storeAll(`other-${randomUUID()}`, [
      { entity_type: ENTITY_TYPE, title: `partial write ${batch} 20` },
    ]);
    const before = await observationCount();

    await expect(storeAll(key, makeEntities(), { strict: true })).rejects.toMatchObject({
      code: "ERR_STORE_RESOLUTION_FAILED",
    });
    expect(await observationCount()).toBe(before);
  });

  it("MCP: strict still refuses an entity that carries another source's observation", async () => {
    const mcpStore = mcpStoreFor(newMcpServer(userId), userId);
    const key = `mcp-strict-neg-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(mcpStore(key, { strict: true })).rejects.toThrow(/injected interruption/);
    await removeInterruption();

    await mcpStore(`mcp-other-${randomUUID()}`, {}, [
      { entity_type: ENTITY_TYPE, title: `partial write ${batch} 20` },
    ]);
    const before = await observationCount();

    await expect(mcpStore(key, { strict: true })).rejects.toThrow(
      /Strict mode|MERGE_REFUSED|merge/i
    );
    expect(await observationCount()).toBe(before);
  });

  it("two simultaneous replays of an interrupted key both succeed with one set of observations", async () => {
    const key = `concurrent-resume-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(storeAll(key)).rejects.toThrow(/injected interruption/);
    await removeInterruption();

    const [a, b] = await Promise.allSettled([storeAll(key), storeAll(key)]);

    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("fulfilled");
    expect(await observationCount()).toBe(TOTAL);
    expect(await storeWriteStateOf(key)).toBe("complete");
  });

  it("records `complete` on the source after a normal HTTP-core store and after a resume", async () => {
    const plain = `state-plain-${randomUUID()}`;
    await storeAll(plain, makeEntities(3));
    expect(await storeWriteStateOf(plain)).toBe("complete");

    const resumed = `state-resumed-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(storeAll(resumed)).rejects.toThrow(/injected interruption/);
    expect(await storeWriteStateOf(resumed)).toBe("in_progress");
    await removeInterruption();
    await storeAll(resumed);
    expect(await storeWriteStateOf(resumed)).toBe("complete");
  });

  it("MCP: records `complete` after a normal store, a resume, and an interpretation store", async () => {
    const mcpStore = mcpStoreFor(newMcpServer(userId), userId);
    const mcpType = `store_partial_write_2144_mcp_${batch}`;
    await registerNoteType(mcpType);

    const plain = `mcp-state-plain-${randomUUID()}`;
    await mcpStore(plain, {}, makeEntities(3));
    expect(await storeWriteStateOf(plain)).toBe("complete");

    const resumed = `mcp-state-resumed-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(mcpStore(resumed)).rejects.toThrow(/injected interruption/);
    expect(await storeWriteStateOf(resumed)).toBe("in_progress");
    await removeInterruption();
    await mcpStore(resumed);
    expect(await storeWriteStateOf(resumed)).toBe("complete");

    // The interpretation branch returns from a different place than the plain
    // one; it must record completion too.
    const withInterpretation = `mcp-state-interp-${randomUUID()}`;
    // A payload that differs from the plain store above: an identical payload
    // under a new key would dedupe onto that first source.
    await mcpStore(
      withInterpretation,
      { interpretation: { source_ref: "structured" } },
      makeEntities(4, mcpType)
    );
    expect(await storeWriteStateOf(withInterpretation)).toBe("complete");
  });

  it("MCP: an interrupted write replayed with an interpretation is refused and names what is missing", async () => {
    const mcpStore = mcpStoreFor(newMcpServer(userId), userId);
    const mcpType = `store_partial_write_2144_mcpi_${batch}`;
    await registerNoteType(mcpType);
    const entities = makeEntities(TOTAL, mcpType);
    const key = `mcp-interp-${randomUUID()}`;
    const interpretation = { source_ref: "structured" as const };
    await installInterruption(CUT_OFF);
    await expect(mcpStore(key, { interpretation }, entities)).rejects.toThrow(
      /injected interruption/
    );
    await removeInterruption();

    const outcome = await mcpStore(key, { interpretation }, entities).then(
      () => undefined,
      (error: unknown) => error as Error & { data?: Record<string, unknown> }
    );

    expect(outcome?.message).toMatch(/^MCP error -32602: ERR_STORE_WRITE_INCOMPLETE/);
    expect(outcome?.message).toContain("Resend ONLY");
    expect(outcome?.data).toMatchObject({
      code: "ERR_STORE_WRITE_INCOMPLETE",
      entities_requested: TOTAL,
      entities_written: CUT_OFF,
      missing_entity_indexes: Array.from({ length: TOTAL - CUT_OFF }, (_, i) => CUT_OFF + i),
    });
    expect(await observationCount()).toBe(CUT_OFF);
  });

  it("HTTP core: ERR_STORE_WRITE_INCOMPLETE lists the entities still missing", async () => {
    const key = `incomplete-detail-${randomUUID()}`;
    const interpretation = { source_ref: "structured" as const };
    await installInterruption(CUT_OFF);
    await expect(storeAll(key, makeEntities(), { interpretation })).rejects.toThrow(
      /injected interruption/
    );
    await removeInterruption();

    const error = await storeAll(key, makeEntities(), { interpretation }).then(
      () => undefined,
      (e: unknown) =>
        e as Error & { code?: string; hint?: string; details?: Record<string, unknown> }
    );

    expect(error?.code).toBe("ERR_STORE_WRITE_INCOMPLETE");
    expect(error?.details).toMatchObject({
      entities_requested: TOTAL,
      entities_written: CUT_OFF,
      missing_entity_indexes: Array.from({ length: TOTAL - CUT_OFF }, (_, i) => CUT_OFF + i),
    });
    expect(error?.hint).toContain("Resend ONLY");
    expect(error?.hint).toContain("new idempotency_key");
  });

  it("MCP: a changed payload under an unfinished key is still ERR_IDEMPOTENCY_MISMATCH", async () => {
    const mcpStore = mcpStoreFor(newMcpServer(userId), userId);
    const key = `mcp-mismatch-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(mcpStore(key)).rejects.toThrow(/injected interruption/);
    await removeInterruption();

    await expect(mcpStore(key, {}, makeEntities(3))).rejects.toThrow(/ERR_IDEMPOTENCY_MISMATCH/);
    expect(await observationCount()).toBe(CUT_OFF);
  });

  // A legacy key (no marker) whose write finished, but whose observations live
  // on a different source than the keyed one, cannot be counted from the keyed
  // source. It must replay as it always did, not be read as incomplete (which,
  // with an interpretation, would turn into a permanent 409).
  it("HTTP core: a legacy key whose observations live on another source replays as complete", async () => {
    const hostKey = `host-${randomUUID()}`;
    await storeAll(hostKey, makeEntities(3));
    const { data: host } = await db
      .from("sources")
      .select("id")
      .eq("user_id", userId)
      .eq("idempotency_key", hostKey)
      .single();

    const key = `legacy-other-source-${randomUUID()}`;
    const entities = [
      { entity_type: ENTITY_TYPE, title: `other-source ${batch} a` },
      { entity_type: ENTITY_TYPE, title: `other-source ${batch} b` },
    ];
    const interpretation = { source_id: host!.id as string };
    await storeAll(key, entities, { interpretation });

    const { data: keyed } = await db
      .from("sources")
      .select("id, provenance")
      .eq("user_id", userId)
      .eq("idempotency_key", key)
      .single();
    const provenance = { ...((keyed?.provenance as Record<string, unknown>) ?? {}) };
    delete provenance.store_write;
    await db.from("sources").update({ provenance }).eq("id", keyed!.id);

    const replay = await storeAll(key, entities, { interpretation });

    expect(replay.success).toBe(true);
    expect(replay.replayed).toBe(true);
  });
});

async function storeWriteStateOf(key: string): Promise<string | undefined> {
  const { data } = await db
    .from("sources")
    .select("provenance")
    .eq("user_id", userId)
    .eq("idempotency_key", key)
    .single();
  return (data?.provenance as { store_write?: { state?: string } } | undefined)?.store_write?.state;
}

// ---------------------------------------------------------------------------
// The Express route: status, error envelope, and the full resume over HTTP.
// ---------------------------------------------------------------------------

describe("POST /store: unfinished keyed writes over HTTP (#2144)", () => {
  let httpServer: Server;
  let base: string;
  const routeUser = LOCAL_DEV_USER_ID;
  let routeBatch: string;
  let routeType: string;
  let routeTrigger: string;

  const routeEntities = (count: number = TOTAL) =>
    Array.from({ length: count }, (_, seq) => ({
      entity_type: routeType,
      title: `route write ${routeBatch} ${seq}`,
      batch: routeBatch,
      seq,
    }));

  async function post(body: unknown) {
    const res = await fetch(`${base}/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as StoreHttpBody };
  }

  async function routeObservationCount(): Promise<number> {
    const { data: ents } = await db
      .from("entities")
      .select("id")
      .eq("user_id", routeUser)
      .eq("entity_type", routeType);
    const ids = (ents ?? []).map((e: { id: string }) => e.id);
    if (ids.length === 0) return 0;
    const { data } = await db.from("observations").select("id").in("entity_id", ids);
    return (data ?? []).length;
  }

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, "127.0.0.1", () => resolve());
    });
    base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });
  beforeEach(() => {
    routeBatch = randomUUID().replace(/-/g, "").slice(0, 12);
    routeType = `store_partial_write_2144_route_${routeBatch}`;
    routeTrigger = `interrupt_2144_route_${routeBatch}`;
  });
  afterEach(async () => {
    const conn = await getDb();
    await conn.exec(`DROP TRIGGER IF EXISTS ${routeTrigger}`);
    const { data: ents } = await db
      .from("entities")
      .select("id")
      .eq("user_id", routeUser)
      .eq("entity_type", routeType);
    const ids = (ents ?? []).map((e: { id: string }) => e.id);
    if (ids.length > 0) {
      await db.from("observations").delete().in("entity_id", ids);
      await db.from("entity_snapshots").delete().in("entity_id", ids);
      await db.from("entities").delete().in("id", ids);
    }
  });

  async function interrupt() {
    const conn = await getDb();
    await conn.exec(
      `CREATE TRIGGER ${routeTrigger} BEFORE INSERT ON observations ` +
        `WHEN json_extract(NEW.fields, '$.batch') = '${routeBatch}' ` +
        `AND json_extract(NEW.fields, '$.seq') >= ${CUT_OFF} ` +
        `BEGIN SELECT RAISE(ABORT, 'injected interruption'); END`
    );
  }
  async function uninterrupt() {
    const conn = await getDb();
    await conn.exec(`DROP TRIGGER IF EXISTS ${routeTrigger}`);
  }

  it("answers 409 ERR_STORE_WRITE_INCOMPLETE in the standard error envelope, naming the missing entities", async () => {
    const key = `route-incomplete-${randomUUID()}`;
    const interpretation = { source_ref: "structured" };
    await interrupt();
    const first = await post({ idempotency_key: key, entities: routeEntities(), interpretation });
    expect(first.status).toBeGreaterThanOrEqual(400);
    await uninterrupt();

    const replay = await post({ idempotency_key: key, entities: routeEntities(), interpretation });

    expect(replay.status).toBe(409);
    expect(replay.json.error_code).toBe("ERR_STORE_WRITE_INCOMPLETE");
    expect(typeof replay.json.message).toBe("string");
    expect(replay.json.details).toMatchObject({
      entities_requested: TOTAL,
      entities_written: CUT_OFF,
      missing_entity_indexes: Array.from({ length: TOTAL - CUT_OFF }, (_, i) => CUT_OFF + i),
    });
    expect(replay.json.details?.hint).toContain("Resend ONLY");
    expect(typeof replay.json.details?.source_id).toBe("string");
    expect(await routeObservationCount()).toBe(CUT_OFF);
  });

  it("finishes an interrupted write on a same-key replay and then replays it as complete", async () => {
    const key = `route-resume-${randomUUID()}`;
    await interrupt();
    const first = await post({ idempotency_key: key, entities: routeEntities() });
    expect(first.status).toBeGreaterThanOrEqual(400);
    await uninterrupt();
    expect(await routeObservationCount()).toBe(CUT_OFF);

    const resumed = await post({ idempotency_key: key, entities: routeEntities() });
    expect(resumed.status).toBe(200);
    expect(resumed.json.replayed).not.toBe(true);
    expect(await routeObservationCount()).toBe(TOTAL);

    const again = await post({ idempotency_key: key, entities: routeEntities() });
    expect(again.status).toBe(200);
    expect(again.json.replayed).toBe(true);
    expect(await routeObservationCount()).toBe(TOTAL);
  });

  it("finishes an interrupted strict write over HTTP", async () => {
    const key = `route-strict-${randomUUID()}`;
    await interrupt();
    await post({ idempotency_key: key, entities: routeEntities(), strict: true });
    await uninterrupt();

    const resumed = await post({ idempotency_key: key, entities: routeEntities(), strict: true });

    expect(resumed.status).toBe(200);
    expect(await routeObservationCount()).toBe(TOTAL);
  });
});

// ---------------------------------------------------------------------------
// The resume exemption is judged per WRITE, not per entity row (#2144).
//
// A same-key replay may skip the strict / create_new / reject refusals only for
// an entity row this very write's interrupted attempt created. Everything else
// that resolves to an existing row is a real merge target: a second payload of
// the same request, a row that pre-dates the keyed source, a merged-away row,
// and a row whose evidence cannot be read.
// ---------------------------------------------------------------------------

describe("store: the resume exemption is decided per write, not per entity row (#2144)", () => {
  beforeEach(() => {
    userId = randomUUID();
    batch = randomUUID().replace(/-/g, "").slice(0, 12);
    triggerName = `interrupt_2144_${batch}`;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  /** Two payloads of ONE request that resolve to ONE heuristic (title) identity. */
  function collidingPair(entityType: string = ENTITY_TYPE) {
    return [
      { entity_type: entityType, title: `same title ${batch}`, seq: 0 },
      { entity_type: entityType, title: `same title ${batch}`, seq: 1 },
    ];
  }

  async function entityIdByTitleSuffix(suffix: string): Promise<string> {
    const { data } = await db
      .from("entities")
      .select("id, canonical_name")
      .eq("user_id", userId)
      .eq("entity_type", ENTITY_TYPE);
    const row = (data ?? []).find((e: { canonical_name: string }) =>
      e.canonical_name.endsWith(suffix)
    );
    if (!row) throw new Error(`no entity with canonical name ending ${suffix}`);
    return (row as { id: string }).id;
  }

  /**
   * Make the evidence read that backs the resume exemption return an error,
   * for as long as the returned spy is installed. Only that one query is
   * touched (observations filtered on "a source other than X").
   */
  function failOtherSourceEvidenceRead() {
    const realFrom = db.from.bind(db);
    function wrap<T extends object>(target: T): T {
      return new Proxy(target, {
        get(t, prop, receiver) {
          const value = Reflect.get(t, prop, receiver);
          if (prop === "or") {
            return (clause: string, ...rest: unknown[]) => {
              if (typeof clause === "string" && clause.includes("source_id.neq.")) {
                return {
                  limit: () =>
                    Promise.resolve({ data: null, error: { message: "injected read error" } }),
                };
              }
              return wrap((value as (...a: unknown[]) => object).call(t, clause, ...rest));
            };
          }
          if (typeof value === "function") {
            return (...args: unknown[]) => {
              const out = (value as (...a: unknown[]) => unknown).apply(t, args);
              return out && typeof out === "object" && !(out instanceof Promise)
                ? wrap(out as object)
                : out;
            };
          }
          return value;
        },
      });
    }
    return vi.spyOn(db, "from").mockImplementation(((table: string) => {
      const builder = realFrom(table as never);
      return table === "observations" ? wrap(builder as object) : builder;
    }) as typeof db.from);
  }

  /**
   * Make the keyed-source timestamp read behind the ownership check return an
   * error, for as long as the returned spy is installed. Only that one query is
   * touched: the `sources` select of `created_at` alone, which nothing else in
   * the store path issues.
   */
  function failKeyedSourceRowRead() {
    const realFrom = db.from.bind(db);
    return vi.spyOn(db, "from").mockImplementation(((table: string) => {
      const builder = realFrom(table as never) as unknown as {
        select: (...a: unknown[]) => unknown;
      };
      if (table !== "sources") return builder;
      return new Proxy(builder, {
        get(t, prop, receiver) {
          if (prop === "select") {
            return (...args: unknown[]) => {
              if (args.length === 1 && args[0] === "created_at") {
                return {
                  eq: () => ({
                    maybeSingle: () =>
                      Promise.resolve({ data: null, error: { message: "injected read error" } }),
                  }),
                };
              }
              return t.select(...args);
            };
          }
          const value = Reflect.get(t, prop, receiver);
          return typeof value === "function" ? value.bind(t) : value;
        },
      });
    }) as typeof db.from);
  }

  // -- 1. Two payloads of one request that collide on identity ---------------

  it("HTTP core: strict batch with two payloads on one title is refused, and refused again on a same-key replay", async () => {
    const key = `collide-http-strict-${randomUUID()}`;
    const entities = collidingPair();

    await expect(storeAll(key, entities, { strict: true })).rejects.toMatchObject({
      code: "ERR_STORE_RESOLUTION_FAILED",
    });
    const afterFirst = await observationCount();

    await expect(storeAll(key, entities, { strict: true })).rejects.toMatchObject({
      code: "ERR_STORE_RESOLUTION_FAILED",
    });
    expect(await observationCount()).toBe(afterFirst);
    expect(afterFirst).toBe(0);
  });

  it("HTTP core: a name_collision_policy: reject batch with two payloads on one title is refused again on replay", async () => {
    const rejectType = `store_partial_write_2144_collide_${batch}`;
    await registerNoteType(
      rejectType,
      { name_collision_policy: "reject" },
      { canonical_name_fields: ["external_id"] }
    );
    const key = `collide-http-reject-${randomUUID()}`;
    const entities = collidingPair(rejectType);

    await expect(storeAll(key, entities)).rejects.toMatchObject({
      code: "ERR_STORE_RESOLUTION_FAILED",
    });
    const afterFirst = await observationCount();

    await expect(storeAll(key, entities)).rejects.toMatchObject({
      code: "ERR_STORE_RESOLUTION_FAILED",
    });
    expect(await observationCount()).toBe(afterFirst);
    expect(afterFirst).toBe(0);
  });

  it("MCP: strict batch with two payloads on one title is refused, and refused again on a same-key replay", async () => {
    const mcpStore = mcpStoreFor(newMcpServer(userId), userId);
    const key = `collide-mcp-strict-${randomUUID()}`;
    const entities = collidingPair();

    await expect(mcpStore(key, { strict: true }, entities)).rejects.toThrow(/merge|strict/i);
    // The commit loop wrote the first payload before refusing the second.
    const afterFirst = await observationCount();
    expect(afterFirst).toBe(1);

    await expect(mcpStore(key, { strict: true }, entities)).rejects.toThrow(/merge|strict/i);
    expect(await observationCount()).toBe(afterFirst);
  });

  it("MCP: a name_collision_policy: reject batch with two payloads on one title is refused again on replay", async () => {
    const rejectType = `store_partial_write_2144_collide_mcp_${batch}`;
    await registerNoteType(
      rejectType,
      { name_collision_policy: "reject" },
      { canonical_name_fields: ["external_id"] }
    );
    const mcpStore = mcpStoreFor(newMcpServer(userId), userId);
    const key = `collide-mcp-reject-${randomUUID()}`;
    const entities = collidingPair(rejectType);

    await expect(mcpStore(key, {}, entities)).rejects.toThrow(/merge|reject/i);
    const afterFirst = await observationCount();

    await expect(mcpStore(key, {}, entities)).rejects.toThrow(/merge|reject/i);
    expect(await observationCount()).toBe(afterFirst);
  });

  // -- 2. Observation-less rows that are not this write's own ---------------

  /** Leave an observation-less entity row for `title`, created long before any keyed source. */
  async function preExistingShell(title: string): Promise<string> {
    await storeAll(`shell-seed-${randomUUID()}`, [{ entity_type: ENTITY_TYPE, title }]);
    // The seed store is the only write for this user so far: one entity.
    const { data: ents } = await db
      .from("entities")
      .select("id")
      .eq("user_id", userId)
      .eq("entity_type", ENTITY_TYPE);
    expect(ents).toHaveLength(1);
    const id = (ents as Array<{ id: string }>)[0].id;
    expect(id).toBeTruthy();
    await db.from("observations").delete().eq("entity_id", id);
    await db.from("entity_snapshots").delete().eq("entity_id", id);
    await db.from("entities").update({ created_at: "2000-01-01T00:00:00.000Z" }).eq("id", id);
    expect(await observationCount()).toBe(0);
    return id;
  }

  // HTTP refuses a pre-existing row before it stores the keyed source at all, so
  // a replay there never reaches the resume. What the resume must still refuse
  // is a row that pre-dates the keyed source: the interrupted attempt's own
  // empty row, rewound to before the source was stored.
  it("HTTP core: an observation-less row that pre-dates the keyed source is refused on replay", async () => {
    const key = `predates-http-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(storeAll(key, makeEntities(), { strict: true })).rejects.toThrow(
      /injected interruption/
    );
    await removeInterruption();
    const shellId = await entityIdByTitleSuffix(` ${CUT_OFF + 2}`);
    await db.from("entities").update({ created_at: "2000-01-01T00:00:00.000Z" }).eq("id", shellId);
    const before = await observationCount();

    await expect(storeAll(key, makeEntities(), { strict: true })).rejects.toMatchObject({
      code: "ERR_STORE_RESOLUTION_FAILED",
    });
    expect(await observationCount()).toBe(before);
  });

  it("MCP: a pre-existing observation-less row is refused, also on a same-key replay", async () => {
    const title = `pre-existing shell mcp ${batch}`;
    await preExistingShell(title);
    const mcpStore = mcpStoreFor(newMcpServer(userId), userId);
    const key = `shell-mcp-${randomUUID()}`;
    const entities = [{ entity_type: ENTITY_TYPE, title }];

    await expect(mcpStore(key, { strict: true }, entities)).rejects.toThrow(/merge|strict/i);
    await expect(mcpStore(key, { strict: true }, entities)).rejects.toThrow(/merge|strict/i);
    expect(await observationCount()).toBe(0);
  });

  it("HTTP core: a row the interrupted attempt created that was merged away since is refused", async () => {
    const key = `merged-away-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(storeAll(key, makeEntities(), { strict: true })).rejects.toThrow(
      /injected interruption/
    );
    await removeInterruption();
    const shellId = await entityIdByTitleSuffix(` ${CUT_OFF + 2}`.toLowerCase());
    await db
      .from("entities")
      .update({ merged_to_entity_id: await entityIdByTitleSuffix(" 0") })
      .eq("id", shellId);
    const before = await observationCount();

    await expect(storeAll(key, makeEntities(), { strict: true })).rejects.toMatchObject({
      code: "ERR_STORE_RESOLUTION_FAILED",
    });
    expect(await observationCount()).toBe(before);
  });

  it("HTTP core: a row the interrupted attempt created is still resumed (the exemption is not dead)", async () => {
    const key = `own-rows-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(storeAll(key, makeEntities(), { strict: true })).rejects.toThrow(
      /injected interruption/
    );
    await removeInterruption();

    const replay = await storeAll(key, makeEntities(), { strict: true });

    expect(replay.success).toBe(true);
    expect(await observationCount()).toBe(TOTAL);
  });

  // -- 3. The evidence read errors -------------------------------------------

  it("HTTP core: strict resume is refused when the other-source evidence read errors", async () => {
    const key = `read-error-http-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(storeAll(key, makeEntities(), { strict: true })).rejects.toThrow(
      /injected interruption/
    );
    await removeInterruption();
    const before = await observationCount();

    const spy = failOtherSourceEvidenceRead();
    await expect(storeAll(key, makeEntities(), { strict: true })).rejects.toMatchObject({
      code: "ERR_STORE_RESOLUTION_FAILED",
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();

    expect(await observationCount()).toBe(before);
    // Control: with the read healthy again the very same replay completes.
    const replay = await storeAll(key, makeEntities(), { strict: true });
    expect(replay.success).toBe(true);
    expect(await observationCount()).toBe(TOTAL);
  });

  it("MCP: strict resume is refused when the other-source evidence read errors", async () => {
    const mcpStore = mcpStoreFor(newMcpServer(userId), userId);
    const key = `read-error-mcp-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(mcpStore(key, { strict: true })).rejects.toThrow(/injected interruption/);
    await removeInterruption();
    const before = await observationCount();

    const spy = failOtherSourceEvidenceRead();
    await expect(mcpStore(key, { strict: true })).rejects.toThrow(/merge|strict/i);
    spy.mockRestore();

    expect(await observationCount()).toBe(before);
  });

  it("HTTP core: strict resume is refused when the keyed source row cannot be read", async () => {
    const key = `source-read-error-http-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(storeAll(key, makeEntities(), { strict: true })).rejects.toThrow(
      /injected interruption/
    );
    await removeInterruption();
    const before = await observationCount();

    const spy = failKeyedSourceRowRead();
    await expect(storeAll(key, makeEntities(), { strict: true })).rejects.toMatchObject({
      code: "ERR_STORE_RESOLUTION_FAILED",
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();

    expect(await observationCount()).toBe(before);
    // Control: with the read healthy again the very same replay completes.
    const replay = await storeAll(key, makeEntities(), { strict: true });
    expect(replay.success).toBe(true);
    expect(await observationCount()).toBe(TOTAL);
  });

  it("HTTP core: strict resume is refused when an entity row's created_at does not parse", async () => {
    const key = `bad-created-at-http-${randomUUID()}`;
    await installInterruption(CUT_OFF);
    await expect(storeAll(key, makeEntities(), { strict: true })).rejects.toThrow(
      /injected interruption/
    );
    await removeInterruption();
    const shellId = await entityIdByTitleSuffix(` ${CUT_OFF + 2}`);
    await db.from("entities").update({ created_at: "not-a-timestamp" }).eq("id", shellId);
    const before = await observationCount();

    await expect(storeAll(key, makeEntities(), { strict: true })).rejects.toMatchObject({
      code: "ERR_STORE_RESOLUTION_FAILED",
    });
    expect(await observationCount()).toBe(before);

    // Control: with a parsable timestamp restored the same replay completes.
    await db.from("entities").update({ created_at: new Date().toISOString() }).eq("id", shellId);
    const replay = await storeAll(key, makeEntities(), { strict: true });
    expect(replay.success).toBe(true);
    expect(await observationCount()).toBe(TOTAL);
  });
});

describe("incompleteStoreHint: recovery advice (#2144)", () => {
  const summary = (written: number, missing: number[]) => ({
    source_id: "src",
    entities_requested: written + missing.length,
    entities_written: written,
    missing_entity_indexes: missing,
  });

  it("says the original request's relationships were not written and must be recreated by entity id", () => {
    const hint = incompleteStoreHint(summary(3, [3, 4]));
    expect(hint).toContain("[3, 4]");
    expect(hint).toContain("relationships were not written");
    expect(hint).toContain("entity id");
    expect(hint).toContain("does not return the ids");
    expect(hint).toContain("identifying fields");
    expect(hint).toContain("second set of observations");
    expect(hint).not.toContain("duplicates the");
  });

  it("says all entities are stored when none are missing, rather than naming an empty set", () => {
    const hint = incompleteStoreHint(summary(5, []));
    expect(hint).toContain("All of the request's entities are stored");
    expect(hint).toContain("only its relationships may be missing");
    expect(hint).toContain("identifying fields");
    expect(hint).not.toContain("Resend ONLY");
    expect(hint).not.toContain("no observation");
  });
});
