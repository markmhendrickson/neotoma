/**
 * Backend-independent cases for the entity_snapshots.search_text backfill
 * (src/services/entity_search_text_backfill.ts). Registered by
 * tests/integration/entity_search_text_backfill.test.ts (sqlite backend) and
 * tests/integration/entity_search_text_backfill_libsql.test.ts (libsql worker).
 *
 * Invariant under test: after any run, every row's search_text is NULL or
 * exactly the text lexical search would build right now.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import { config } from "../../src/config.js";
import { storeStructuredForApi } from "../../src/actions.js";
import { getDb } from "../../src/repositories/db/connection.js";
import type { DbDatabase } from "../../src/repositories/db/driver.js";
import {
  buildEntityLexicalSearchText,
  loadRawFragmentTextByEntityId,
} from "../../src/shared/entity_search_text.js";
import {
  isSearchTextBackfillEnabled,
  nextBackfillPauseMs,
  runEntitySearchTextBackfill,
  searchTextBackfillSettingsFromEnv,
  validateSearchTextBackfillLimits,
  type SearchTextBackfillPhaseEvent,
  DEFAULT_SEARCH_TEXT_BACKFILL_SETTINGS,
} from "../../src/services/entity_search_text_backfill.js";
import { lexicalSearchEntityIds } from "../../src/shared/action_handlers/entity_handlers.js";
import type { EntityReadTrace } from "../../src/shared/entity_read_contract.js";

const RUN = randomUUID().replace(/-/g, "").slice(0, 8);
const NOTE = `synthetic_backfill_${RUN}_note`;

/** No pauses, so a test run finishes at once. */
const FAST = { rowsPerSecond: 1_000_000, batchSize: 3 };
const noSleep = async () => {};

async function storeNotes(userId: string, count: number, prefix: string): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const result = await storeStructuredForApi({
      userId,
      entities: [{ entity_type: NOTE, title: `${prefix} synthetic backfill note ${i}` }],
      sourcePriority: 100,
      idempotencyKey: "backfill-" + randomUUID(),
    });
    expect(result.success).toBe(true);
    ids.push((result.entities as Array<{ entity_id: string }>)[0].entity_id);
  }
  return ids;
}

async function nullAll(userId: string): Promise<void> {
  const conn = await getDb();
  await conn
    .prepare("UPDATE entity_snapshots SET search_text = NULL WHERE user_id = ?")
    .run(userId);
}

async function textsOf(userId: string): Promise<Map<string, string | null>> {
  const conn = await getDb();
  const rows = (await conn
    .prepare("SELECT entity_id, search_text FROM entity_snapshots WHERE user_id = ?")
    .all(userId)) as Array<{ entity_id: string; search_text: string | null }>;
  return new Map(rows.map((r) => [r.entity_id, r.search_text]));
}

async function freshText(entityId: string): Promise<string> {
  const entity = await db.from("entities").select("canonical_name").eq("id", entityId).single();
  const snapshot = await db
    .from("entity_snapshots")
    .select("snapshot")
    .eq("entity_id", entityId)
    .single();
  const fragments = await loadRawFragmentTextByEntityId([entityId]);
  return buildEntityLexicalSearchText(
    (entity.data as { canonical_name: string }).canonical_name,
    (snapshot.data as { snapshot: unknown }).snapshot,
    fragments.get(entityId)
  );
}

async function expectAllFresh(userId: string): Promise<void> {
  const texts = await textsOf(userId);
  expect(texts.size).toBeGreaterThan(0);
  for (const [id, text] of texts) expect(text).toBe(await freshText(id));
}

async function withPrepareIntercept<T>(
  intercept: (sql: string, original: DbDatabase["prepare"]) => void,
  action: () => Promise<T>
): Promise<T> {
  const conn = (await getDb()) as DbDatabase & { prepare: DbDatabase["prepare"] };
  const original = conn.prepare.bind(conn);
  const hadOwn = Object.prototype.hasOwnProperty.call(conn, "prepare");
  const previous = conn.prepare;
  conn.prepare = ((sql: string) => {
    intercept(sql, original);
    return original(sql);
  }) as DbDatabase["prepare"];
  try {
    return await action();
  } finally {
    if (hadOwn) conn.prepare = previous;
    else delete (conn as { prepare?: unknown }).prepare;
  }
}

const GUARDED_UPDATE = "UPDATE entity_snapshots SET search_text = ?";
const NULL_COUNT = "SELECT COUNT(*) AS n FROM entity_snapshots WHERE search_text IS NULL";

/** One-row batches with no rate pause: the acceptance shape for verification. */
const ONE_ROW = { batchSize: 1, rowsPerSecond: 1_000_000 };

/** Fill the rest of the table, then NULL this user's rows: they are all that is NULL. */
async function isolateNulls(userId: string, count: number, prefix: string): Promise<string[]> {
  const ids = await storeNotes(userId, count, prefix);
  await runEntitySearchTextBackfill({ settings: FAST, sleep: noSleep });
  await nullAll(userId);
  return ids;
}

async function nullCountOf(userId: string): Promise<number> {
  return [...(await textsOf(userId)).values()].filter((t) => t === null).length;
}

function phasesOf(events: SearchTextBackfillPhaseEvent[]): string[] {
  return events.map((e) => e.phase);
}

const ALL_PHASES = [
  "init_start",
  "init_done",
  "active_start",
  "active_end",
  "final_count_start",
  "final_count_done",
];

export function registerEntitySearchTextBackfillCases(backend: "sqlite" | "libsql"): void {
  describe(`search_text backfill (${backend})`, () => {
    it("runs on the intended backend", () => {
      expect(config.dbBackend).toBe(backend);
    });

    it("fills every NULL row with the text search would build", async () => {
      const userId = randomUUID();
      await storeNotes(userId, 7, "fill");
      await nullAll(userId);
      expect([...(await textsOf(userId)).values()].every((t) => t === null)).toBe(true);

      const progress: number[] = [];
      const report = await runEntitySearchTextBackfill({
        settings: FAST,
        sleep: noSleep,
        onProgress: (p) => progress.push(p.batches),
      });
      expect(report.stopped_reason).toBe("done");
      expect(report.filled).toBeGreaterThanOrEqual(7);
      expect(report.null_at_start).toBeGreaterThanOrEqual(7);
      expect(progress.length).toBe(report.batches);
      expect(report.batches).toBeGreaterThanOrEqual(3);
      await expectAllFresh(userId);
    });

    it("a second run changes nothing", async () => {
      const userId = randomUUID();
      await storeNotes(userId, 4, "twice");
      await nullAll(userId);
      await runEntitySearchTextBackfill({ settings: FAST, sleep: noSleep });
      const before = await textsOf(userId);
      const second = await runEntitySearchTextBackfill({ settings: FAST, sleep: noSleep });
      expect(second.stopped_reason).toBe("done");
      expect(second.filled).toBe(0);
      expect(second.null_remaining).toBe(second.null_at_start);
      expect(await textsOf(userId)).toEqual(before);
      await expectAllFresh(userId);
    });

    it("an interrupted run resumes where it left off", async () => {
      const userId = randomUUID();
      await storeNotes(userId, 6, "resume");
      // Clear the rest of the table first so this user's rows are all that is NULL.
      await runEntitySearchTextBackfill({ settings: FAST, sleep: noSleep });
      await nullAll(userId);

      const controller = new AbortController();
      const first = await runEntitySearchTextBackfill({
        settings: { ...FAST, batchSize: 2 },
        sleep: noSleep,
        signal: controller.signal,
        onProgress: () => controller.abort(),
      });
      expect(first.stopped_reason).toBe("aborted");
      expect(first.batches).toBe(1);
      const afterFirst = [...(await textsOf(userId)).values()];
      expect(afterFirst.filter((t) => t !== null).length).toBe(2);
      expect(afterFirst.filter((t) => t === null).length).toBe(4);

      const second = await runEntitySearchTextBackfill({
        settings: { ...FAST, batchSize: 2 },
        sleep: noSleep,
      });
      expect(second.stopped_reason).toBe("done");
      expect(second.filled).toBe(4);
      await expectAllFresh(userId);
    });

    it("a write during a batch leaves the row NULL or fresh, never stale", async () => {
      const userId = randomUUID();
      const [id] = await storeNotes(userId, 1, "race");
      await runEntitySearchTextBackfill({ settings: FAST, sleep: noSleep });
      await nullAll(userId);

      let fired = 0;
      const pendingWrites: Array<Promise<unknown>> = [];
      await withPrepareIntercept(
        (sql, original) => {
          if (!sql.startsWith(GUARDED_UPDATE)) return;
          fired++;
          // A concurrent writer adds a fragment between the fill's read and its
          // guarded UPDATE, inside the backfill's open batch.
          pendingWrites.push(
            original(
              "INSERT INTO raw_fragments (id, entity_id, entity_type, fragment_key, fragment_value, user_id) VALUES (?, ?, ?, ?, ?, ?)"
            ).run(randomUUID(), id, NOTE, "race_key_" + fired, '"synthetic race value"', userId)
          );
        },
        () => runEntitySearchTextBackfill({ settings: FAST, sleep: noSleep })
      );
      await Promise.all(pendingWrites);
      expect(fired).toBeGreaterThan(0);
      const raced = (await textsOf(userId)).get(id) ?? null;
      if (raced !== null) expect(raced).toBe(await freshText(id));
      expect(raced).toBeNull();

      // Without the concurrent writer the next run fills it, including the fragment.
      await runEntitySearchTextBackfill({ settings: FAST, sleep: noSleep });
      const filled = (await textsOf(userId)).get(id);
      expect(filled).toBe(await freshText(id));
      expect(filled).toContain("synthetic race value");
    });

    it("stops after two batches slower than the stop threshold", async () => {
      const userId = randomUUID();
      await storeNotes(userId, 5, "slow");
      await nullAll(userId);
      // Fake clock: every batch appears to take 11 seconds.
      let clock = 0;
      let reads = 0;
      const pauses: number[] = [];
      const report = await runEntitySearchTextBackfill({
        settings: { batchSize: 2 },
        now: () => {
          reads++;
          if (reads % 2 === 0) clock += 11_000;
          return clock;
        },
        sleep: async (ms) => {
          pauses.push(ms);
        },
      });
      expect(report.stopped_reason).toBe("too_slow");
      expect(report.batches).toBe(2);
      expect(report.stop_detail).toContain("10000 ms");
      // The first slow batch paused ten times its duration.
      expect(pauses).toEqual([110_000]);
      await runEntitySearchTextBackfill({ settings: FAST, sleep: noSleep });
      await expectAllFresh(userId);
    });

    describe("bounded verification mode", () => {
      it("commits at most maxBatches batches, with no progress consumer", async () => {
        const userId = randomUUID();
        await isolateNulls(userId, 5, "capbatches");
        const events: SearchTextBackfillPhaseEvent[] = [];
        const report = await runEntitySearchTextBackfill({
          settings: ONE_ROW,
          sleep: noSleep,
          limits: { maxBatches: 2, maxActiveMs: 20_000, maxInitMs: 60_000 },
          onPhase: (e) => events.push(e),
        });
        expect(report.stopped_reason).toBe("batch_limit");
        expect(report.batches).toBe(2);
        expect(report.scanned).toBe(2);
        expect(report.filled).toBe(2);
        expect(report.discarded_batches).toBe(0);
        expect(report.null_at_start).toBe(5);
        expect(report.null_remaining).toBe(3);
        expect(await nullCountOf(userId)).toBe(3);
        expect(phasesOf(events)).toEqual(ALL_PHASES);
        const end = events.find((e) => e.phase === "active_end");
        expect(end).toMatchObject({ stopped_reason: "batch_limit", batches: 2, filled: 2 });
        // Metadata only: no event carries an entity id or text.
        expect(JSON.stringify(events)).not.toMatch(/ent_|capbatches/);
        // The filled rows are fresh; a normal run finishes the rest.
        await runEntitySearchTextBackfill({ settings: FAST, sleep: noSleep });
        await expectAllFresh(userId);
      });

      it("ends as done, not batch_limit, when the rows run out first", async () => {
        const userId = randomUUID();
        await isolateNulls(userId, 2, "capdone");
        const report = await runEntitySearchTextBackfill({
          settings: { ...ONE_ROW, batchSize: 3 },
          sleep: noSleep,
          limits: { maxBatches: 20 },
        });
        expect(report.stopped_reason).toBe("done");
        expect(report.batches).toBe(1);
        expect(report.null_remaining).toBe(0);
      });

      it("begins no batch once the active deadline has passed", async () => {
        const userId = randomUUID();
        await isolateNulls(userId, 5, "capclock");
        let clock = 0;
        const report = await runEntitySearchTextBackfill({
          settings: ONE_ROW,
          sleep: noSleep,
          now: () => clock,
          // Each committed batch appears to take 6 s of active time.
          onProgress: () => {
            clock += 6_000;
          },
          limits: { maxActiveMs: 10_000 },
        });
        expect(report.stopped_reason).toBe("time_limit");
        expect(report.batches).toBe(2);
        expect(report.filled).toBe(2);
        expect(report.discarded_batches).toBe(0);
        expect(await nullCountOf(userId)).toBe(3);
      });

      it("rolls back a first batch still running at the deadline", async () => {
        const userId = randomUUID();
        await isolateNulls(userId, 3, "capinflight");
        let clock = 0;
        const events: SearchTextBackfillPhaseEvent[] = [];
        const report = await withPrepareIntercept(
          (sql) => {
            // The guarded write inside the first batch is where time runs out.
            if (sql.startsWith(GUARDED_UPDATE)) clock += 25_000;
          },
          () =>
            runEntitySearchTextBackfill({
              settings: ONE_ROW,
              sleep: noSleep,
              now: () => clock,
              limits: { maxBatches: 20, maxActiveMs: 20_000 },
              onPhase: (e) => events.push(e),
            })
        );
        expect(report.stopped_reason).toBe("time_limit");
        expect(report.stop_detail).toContain("rolled back");
        expect(report.batches).toBe(0);
        expect(report.filled).toBe(0);
        expect(report.discarded_batches).toBe(1);
        expect(await nullCountOf(userId)).toBe(3);
        expect(report.null_remaining).toBe(3);
        expect(phasesOf(events)).toEqual(ALL_PHASES);
      });

      it("stops before any batch when init took longer than maxInitMs", async () => {
        const userId = randomUUID();
        await isolateNulls(userId, 2, "capinit");
        let clock = 0;
        let counts = 0;
        const events: SearchTextBackfillPhaseEvent[] = [];
        const report = await withPrepareIntercept(
          (sql) => {
            if (!sql.startsWith(NULL_COUNT)) return;
            // The initial count is slow; the final one is not.
            if (counts++ === 0) clock += 61_000;
          },
          () =>
            runEntitySearchTextBackfill({
              settings: ONE_ROW,
              sleep: noSleep,
              now: () => clock,
              limits: { maxBatches: 20, maxActiveMs: 20_000, maxInitMs: 60_000 },
              onPhase: (e) => events.push(e),
            })
        );
        expect(report.stopped_reason).toBe("init_limit");
        expect(report.timing.init_ms).toBe(61_000);
        expect(report.batches).toBe(0);
        expect(report.timing.active_ms).toBe(0);
        expect(await nullCountOf(userId)).toBe(2);
        // Counts are not skipped: both are taken and reported.
        expect(report.null_at_start).toBe(2);
        expect(report.null_remaining).toBe(2);
        expect(phasesOf(events)).not.toContain("active_start");
        expect(phasesOf(events).at(-1)).toBe("final_count_done");
      });

      it("times a slow final count separately from active work", async () => {
        const userId = randomUUID();
        await isolateNulls(userId, 2, "capfinal");
        let clock = 0;
        let counts = 0;
        const events: SearchTextBackfillPhaseEvent[] = [];
        const report = await withPrepareIntercept(
          (sql) => {
            if (!sql.startsWith(NULL_COUNT)) return;
            if (counts++ === 1) clock += 45_000;
          },
          () =>
            runEntitySearchTextBackfill({
              settings: ONE_ROW,
              sleep: noSleep,
              now: () => clock,
              limits: { maxBatches: 1, maxActiveMs: 20_000 },
              onPhase: (e) => events.push(e),
            })
        );
        expect(report.stopped_reason).toBe("batch_limit");
        expect(report.batches).toBe(1);
        expect(report.timing.active_ms).toBe(0);
        expect(report.timing.final_count_ms).toBe(45_000);
        const end = events.find((e) => e.phase === "active_end");
        expect(end?.active_ms).toBe(0);
        expect(events.at(-1)).toMatchObject({ phase: "final_count_done", null_remaining: 1 });
      });

      it("an interrupt stops between batches and still reports every phase", async () => {
        const userId = randomUUID();
        await isolateNulls(userId, 4, "capsignal");
        const controller = new AbortController();
        const events: SearchTextBackfillPhaseEvent[] = [];
        const report = await runEntitySearchTextBackfill({
          settings: ONE_ROW,
          sleep: noSleep,
          signal: controller.signal,
          onProgress: () => controller.abort(),
          limits: { maxBatches: 20 },
          onPhase: (e) => events.push(e),
        });
        expect(report.stopped_reason).toBe("aborted");
        expect(report.batches).toBe(1);
        expect(await nullCountOf(userId)).toBe(3);
        expect(phasesOf(events)).toEqual(ALL_PHASES);
      });

      it("fails closed on a bad cap or with counts switched off, before any work", async () => {
        for (const limits of [
          { maxBatches: 0 },
          { maxBatches: 1.5 },
          { maxActiveMs: -1 },
          { maxInitMs: Number.NaN },
          { maxActiveMs: Number.POSITIVE_INFINITY },
        ]) {
          expect(() => validateSearchTextBackfillLimits(limits)).toThrow();
          await expect(runEntitySearchTextBackfill({ limits, sleep: noSleep })).rejects.toThrow();
        }
        await expect(
          runEntitySearchTextBackfill({ limits: { maxBatches: 1 }, countRemaining: false })
        ).rejects.toThrow(/counts/);
        expect(validateSearchTextBackfillLimits({})).toBeNull();
        expect(validateSearchTextBackfillLimits(undefined)).toBeNull();
      });

      it("a normal run is unchanged: no limits, no phase timings", async () => {
        const events: SearchTextBackfillPhaseEvent[] = [];
        const report = await runEntitySearchTextBackfill({
          settings: FAST,
          sleep: noSleep,
          onPhase: (e) => events.push(e),
        });
        expect(report.limits).toBeNull();
        expect(report.timing).toEqual({ init_ms: null, active_ms: null, final_count_ms: null });
        expect(events).toEqual([]);
      });

      it("the CLI enforces --max-batches and prints metadata-only phase lines", async () => {
        const userId = randomUUID();
        await isolateNulls(userId, 4, "capcli");
        const { runCli } = await import("../../src/cli/index.js");
        const out: string[] = [];
        const err: string[] = [];
        const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => {
          out.push(String(c));
          return true;
        });
        const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((c: unknown) => {
          err.push(String(c));
          return true;
        });
        const previousExit = process.exitCode;
        try {
          await runCli([
            "node",
            "neotoma",
            "snapshots",
            "search-text-backfill",
            "--batch-size",
            "1",
            "--rows-per-second",
            "1000000",
            "--max-batches",
            "2",
            "--max-active-seconds",
            "20",
            "--max-init-seconds",
            "60",
            "--json",
          ]);
        } finally {
          outSpy.mockRestore();
          errSpy.mockRestore();
        }
        expect(process.exitCode ?? 0).toBe(previousExit ?? 0);
        const report = JSON.parse(out.join("")) as Record<string, unknown>;
        expect(report).toMatchObject({
          stopped_reason: "batch_limit",
          batches: 2,
          filled: 2,
          limits: { maxBatches: 2, maxActiveMs: 20_000, maxInitMs: 60_000 },
        });
        expect(await nullCountOf(userId)).toBe(2);
        const phaseLines = err
          .join("")
          .split("\n")
          .filter((l) => l.includes("search_text_backfill_phase"))
          .map((l) => JSON.parse(l) as { phase: string; pid: number });
        expect(phaseLines.map((l) => l.phase)).toEqual(ALL_PHASES);
        expect(phaseLines.every((l) => l.pid === process.pid)).toBe(true);
      });

      it("the CLI rejects a bad cap before opening the database", async () => {
        const { runCli } = await import("../../src/cli/index.js");
        const err: string[] = [];
        const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((c: unknown) => {
          err.push(String(c));
          return true;
        });
        const previousExit = process.exitCode;
        let counts = 0;
        try {
          await withPrepareIntercept(
            (sql) => {
              if (sql.startsWith(NULL_COUNT)) counts++;
            },
            () =>
              runCli([
                "node",
                "neotoma",
                "snapshots",
                "search-text-backfill",
                "--max-batches",
                "2.5",
              ])
          );
          expect(process.exitCode).toBe(1);
        } finally {
          errSpy.mockRestore();
          process.exitCode = previousExit;
        }
        expect(err.join("")).toContain("--max-batches must be a positive integer");
        expect(counts).toBe(0);
      });
    });

    it("the search trace reports the NULL rows left in scope", async () => {
      const userId = randomUUID();
      await storeNotes(userId, 3, "tracecheck");
      await nullAll(userId);
      const search = async () => {
        const readTrace: EntityReadTrace = { reasons: new Set() };
        const result = await lexicalSearchEntityIds({
          userId,
          entityType: NOTE,
          search: "tracecheck",
          readTrace,
        });
        return { ids: result.entityIds.length, nulls: readTrace.search_text_null_remaining };
      };
      expect(await search()).toEqual({ ids: 3, nulls: 3 });
      await runEntitySearchTextBackfill({ settings: FAST, sleep: noSleep });
      expect(await search()).toEqual({ ids: 3, nulls: 0 });
    });
  });

  describe("search_text backfill settings", () => {
    it("is off unless the switch is set to an on value", () => {
      expect(isSearchTextBackfillEnabled({})).toBe(false);
      expect(isSearchTextBackfillEnabled({ NEOTOMA_SEARCH_TEXT_BACKFILL: "" })).toBe(false);
      expect(isSearchTextBackfillEnabled({ NEOTOMA_SEARCH_TEXT_BACKFILL: "0" })).toBe(false);
      expect(isSearchTextBackfillEnabled({ NEOTOMA_SEARCH_TEXT_BACKFILL: "1" })).toBe(true);
      expect(isSearchTextBackfillEnabled({ NEOTOMA_SEARCH_TEXT_BACKFILL: "true" })).toBe(true);
    });

    it("reads rates from env with documented defaults", () => {
      expect(searchTextBackfillSettingsFromEnv({})).toEqual({
        batchSize: 50,
        rowsPerSecond: 50,
        slowBatchMs: 1000,
        slowPauseFactor: 10,
        stopBatchMs: 10_000,
        stopAfterSlowBatches: 2,
      });
      expect(
        searchTextBackfillSettingsFromEnv({
          NEOTOMA_SEARCH_TEXT_BACKFILL_BATCH_SIZE: "20",
          NEOTOMA_SEARCH_TEXT_BACKFILL_ROWS_PER_SECOND: "not-a-number",
        })
      ).toMatchObject({ batchSize: 20, rowsPerSecond: 50 });
    });

    it("paces normal batches to the target rate and backs off after slow ones", () => {
      const s = DEFAULT_SEARCH_TEXT_BACKFILL_SETTINGS;
      expect(nextBackfillPauseMs(s, 200, 50)).toBe(800);
      expect(nextBackfillPauseMs(s, 1000, 50)).toBe(0);
      expect(nextBackfillPauseMs(s, 1500, 50)).toBe(15_000);
    });
  });
}
