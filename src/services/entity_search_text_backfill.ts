/**
 * Throttled, resumable backfill of `entity_snapshots.search_text` for rows
 * written before the column existed (or cleared since by the triggers in
 * `sqlite_client.ts`).
 *
 * Each batch takes the next `search_text IS NULL` rows in entity_id order and
 * fills them inside one short write transaction, using the same guarded fill
 * the write path uses (`refreshEntitySearchText`). That fill writes only when
 * the snapshot, canonical_name and raw fragments still equal what it read, so a
 * write racing the backfill leaves the row NULL, never stale.
 *
 * Resumable and idempotent: progress is the column itself. A stopped run leaves
 * filled rows filled, and the next run starts over at the first NULL row; a run
 * over a fully filled table reads one empty batch and changes nothing. A row the
 * fill cannot fill (no entities row, column encryption on) stays NULL, and the
 * entity_id cursor moves past it so a run always ends.
 *
 * Throttling is adaptive: after a normal batch it pauses so the run averages
 * `rowsPerSecond`; after a slow batch it pauses `slowPauseFactor` times that
 * batch's duration; after `stopAfterSlowBatches` consecutive batches slower than
 * `stopBatchMs` it stops and says why. A busy instance should see the backfill
 * back off, not add to the load.
 *
 * Bounded verification mode: pass `limits` (CLI: --max-batches,
 * --max-active-seconds, --max-init-seconds) to cap a run before a long fill.
 * The caps are enforced inside this loop, not by a supervisor's signals:
 * - maxBatches: checked before each write transaction begins, so at most that
 *   many batches ever commit.
 * - maxActiveMs: the active window starts immediately before the first batch's
 *   transaction begins (after database init and the initial NULL count). No
 *   batch begins at or after the deadline, and a batch still running at the
 *   deadline is rolled back: the check runs after each row and again right
 *   before COMMIT. The residual is the COMMIT statement itself, which runs
 *   after the last check.
 * - maxInitMs: database open/schema init plus the initial count are timed; if
 *   they took longer, the run stops before any batch ("init_limit"). A blocked
 *   init cannot be interrupted from here; it simply never reaches a batch.
 * Bounded mode also reports phase events (init, active, final count) with
 * timings and counts only, never row content.
 *
 * Started in the background by the HTTP server when
 * NEOTOMA_SEARCH_TEXT_BACKFILL is on (default off), and by
 * `neotoma snapshots search-text-backfill`.
 */
import { getDb } from "../repositories/db/connection.js";
import { getDataKey, refreshEntitySearchText } from "../repositories/sqlite/local_db_adapter.js";
import { runtimeEnv } from "../config_embedded.js";
import { logger } from "../utils/logger.js";

/** Upper bound on rows per batch, whatever the env says. */
export const MAX_SEARCH_TEXT_BACKFILL_BATCH = 200;

export interface SearchTextBackfillSettings {
  /** Rows read and filled per write transaction. */
  batchSize: number;
  /** Target average rate; sets the pause after a normal batch. */
  rowsPerSecond: number;
  /** A batch slower than this is "slow". */
  slowBatchMs: number;
  /** Pause after a slow batch = its duration times this. */
  slowPauseFactor: number;
  /** A batch slower than this counts toward stopping the run. */
  stopBatchMs: number;
  /** Stop after this many consecutive batches slower than stopBatchMs. */
  stopAfterSlowBatches: number;
}

export const DEFAULT_SEARCH_TEXT_BACKFILL_SETTINGS: SearchTextBackfillSettings = {
  batchSize: 50,
  rowsPerSecond: 50,
  slowBatchMs: 1000,
  slowPauseFactor: 10,
  stopBatchMs: 10_000,
  stopAfterSlowBatches: 2,
};

/** Env name for each setting; unset or unparseable values use the default. */
export const SEARCH_TEXT_BACKFILL_ENV = {
  enabled: "NEOTOMA_SEARCH_TEXT_BACKFILL",
  batchSize: "NEOTOMA_SEARCH_TEXT_BACKFILL_BATCH_SIZE",
  rowsPerSecond: "NEOTOMA_SEARCH_TEXT_BACKFILL_ROWS_PER_SECOND",
  slowBatchMs: "NEOTOMA_SEARCH_TEXT_BACKFILL_SLOW_BATCH_MS",
  slowPauseFactor: "NEOTOMA_SEARCH_TEXT_BACKFILL_SLOW_PAUSE_FACTOR",
  stopBatchMs: "NEOTOMA_SEARCH_TEXT_BACKFILL_STOP_BATCH_MS",
  stopAfterSlowBatches: "NEOTOMA_SEARCH_TEXT_BACKFILL_STOP_AFTER_SLOW_BATCHES",
} as const;

/** Only an explicit on value enables the background run; absent or anything else is off. */
export function isSearchTextBackfillEnabled(env: NodeJS.ProcessEnv = runtimeEnv()): boolean {
  const raw = (env[SEARCH_TEXT_BACKFILL_ENV.enabled] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function searchTextBackfillSettingsFromEnv(
  env: NodeJS.ProcessEnv = runtimeEnv()
): SearchTextBackfillSettings {
  const d = DEFAULT_SEARCH_TEXT_BACKFILL_SETTINGS;
  const e = SEARCH_TEXT_BACKFILL_ENV;
  return {
    batchSize: positiveNumber(env[e.batchSize], d.batchSize),
    rowsPerSecond: positiveNumber(env[e.rowsPerSecond], d.rowsPerSecond),
    slowBatchMs: positiveNumber(env[e.slowBatchMs], d.slowBatchMs),
    slowPauseFactor: positiveNumber(env[e.slowPauseFactor], d.slowPauseFactor),
    stopBatchMs: positiveNumber(env[e.stopBatchMs], d.stopBatchMs),
    stopAfterSlowBatches: positiveNumber(env[e.stopAfterSlowBatches], d.stopAfterSlowBatches),
  };
}

export type SearchTextBackfillStopReason =
  /** Every NULL row was visited. */
  | "done"
  /** The caller's signal stopped the run between batches. */
  | "aborted"
  /** Consecutive batches exceeded stopBatchMs. */
  | "too_slow"
  /** Column encryption is on: the column stays NULL by design. */
  | "encryption_on"
  /** Bounded mode: maxBatches batches committed. */
  | "batch_limit"
  /** Bounded mode: the active-time deadline was reached. */
  | "time_limit"
  /** Bounded mode: init took longer than maxInitMs; no batch ran. */
  | "init_limit";

/** Caps for a bounded verification run. Any cap set selects bounded mode. */
export interface SearchTextBackfillLimits {
  /** Most batches that may commit. Positive integer. */
  maxBatches?: number;
  /** Active-time budget in ms, from just before the first batch begins. */
  maxActiveMs?: number;
  /** Budget in ms for database init plus the initial NULL count. */
  maxInitMs?: number;
}

export type SearchTextBackfillPhase =
  | "init_start"
  | "init_done"
  | "active_start"
  | "active_end"
  | "final_count_start"
  | "final_count_done";

/** Metadata-only phase event: counts and timings, never row content. */
export interface SearchTextBackfillPhaseEvent {
  phase: SearchTextBackfillPhase;
  init_ms?: number;
  null_at_start?: number | null;
  active_ms?: number;
  stopped_reason?: SearchTextBackfillStopReason;
  batches?: number;
  scanned?: number;
  filled?: number;
  discarded_batches?: number;
  final_count_ms?: number;
  null_remaining?: number | null;
}

export interface SearchTextBackfillTiming {
  init_ms: number | null;
  active_ms: number | null;
  final_count_ms: number | null;
}

export interface SearchTextBackfillProgress {
  batches: number;
  /** NULL rows visited. */
  scanned: number;
  /** Visited rows that now hold their text. */
  filled: number;
  last_batch_ms: number;
  /** Pause before the next batch. */
  next_pause_ms: number;
}

export interface SearchTextBackfillReport extends SearchTextBackfillProgress {
  stopped_reason: SearchTextBackfillStopReason;
  /** Detail for too_slow and aborted. */
  stop_detail: string | null;
  /** NULL rows when the run started; null when not counted. */
  null_at_start: number | null;
  /** NULL rows when the run ended; null when not counted. */
  null_remaining: number | null;
  settings: SearchTextBackfillSettings;
  /** Caps in force; null for a normal (unbounded) run. */
  limits: SearchTextBackfillLimits | null;
  /** Batches rolled back because the active deadline passed mid-batch. */
  discarded_batches: number;
  /** Phase timings; null fields for a normal run. */
  timing: SearchTextBackfillTiming;
}

export interface SearchTextBackfillOptions {
  settings?: Partial<SearchTextBackfillSettings>;
  signal?: AbortSignal;
  onProgress?: (progress: SearchTextBackfillProgress) => void;
  /** Count NULL rows at start and end (one full count each). Default true. */
  countRemaining?: boolean;
  /** Bounded verification caps; validated before any work. */
  limits?: SearchTextBackfillLimits;
  /** Bounded mode only: called at each phase boundary. */
  onPhase?: (event: SearchTextBackfillPhaseEvent) => void;
  /** Test seams. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** NULL rows in the whole table. Not indexed: one scan, so call it rarely. */
export async function countNullSearchText(): Promise<number> {
  const conn = await getDb();
  const row = (await conn
    .prepare("SELECT COUNT(*) AS n FROM entity_snapshots WHERE search_text IS NULL")
    .get()) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** Pause before the next batch given this batch's duration and row count. */
export function nextBackfillPauseMs(
  settings: SearchTextBackfillSettings,
  batchMs: number,
  rows: number
): number {
  if (batchMs > settings.slowBatchMs) return Math.round(batchMs * settings.slowPauseFactor);
  const budgetMs = (rows / settings.rowsPerSecond) * 1000;
  return Math.max(0, Math.round(budgetMs - batchMs));
}

/**
 * Validate bounded-mode caps. Returns null when no cap is set (normal run) and
 * throws on any cap that is not a positive finite number (maxBatches: positive
 * integer), so a bad cap fails before any work instead of being ignored.
 */
export function validateSearchTextBackfillLimits(
  limits: SearchTextBackfillLimits | undefined
): SearchTextBackfillLimits | null {
  if (!limits) return null;
  const out: SearchTextBackfillLimits = {};
  for (const key of ["maxBatches", "maxActiveMs", "maxInitMs"] as const) {
    const value = limits[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`search_text backfill limit ${key} must be a positive number`);
    }
    if (key === "maxBatches" && !Number.isInteger(value)) {
      throw new Error("search_text backfill limit maxBatches must be a positive integer");
    }
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Thrown inside a batch transaction to roll it back at the active deadline. */
class ActiveDeadlineReached extends Error {
  constructor() {
    super("search_text backfill active deadline reached inside a batch");
  }
}

export async function runEntitySearchTextBackfill(
  options: SearchTextBackfillOptions = {}
): Promise<SearchTextBackfillReport> {
  const settings: SearchTextBackfillSettings = {
    ...searchTextBackfillSettingsFromEnv(),
    ...options.settings,
  };
  const batchSize = Math.max(
    1,
    Math.min(MAX_SEARCH_TEXT_BACKFILL_BATCH, Math.floor(settings.batchSize))
  );
  const now = options.now ?? (() => performance.now());
  const sleep = options.sleep ?? ((ms: number) => defaultSleep(ms, options.signal));
  const countRemaining = options.countRemaining ?? true;
  const limits = validateSearchTextBackfillLimits(options.limits);
  // Bounded mode reports both counts; it never runs with counts switched off.
  if (limits && !countRemaining) {
    throw new Error("bounded search_text backfill requires the start and end counts");
  }
  const phase = (event: SearchTextBackfillPhaseEvent) => {
    if (limits) options.onPhase?.(event);
  };

  const report: SearchTextBackfillReport = {
    batches: 0,
    scanned: 0,
    filled: 0,
    last_batch_ms: 0,
    next_pause_ms: 0,
    stopped_reason: "done",
    stop_detail: null,
    null_at_start: null,
    null_remaining: null,
    settings: { ...settings, batchSize },
    limits,
    discarded_batches: 0,
    timing: { init_ms: null, active_ms: null, final_count_ms: null },
  };

  // With encryption on the fill always leaves the column NULL, so a run would
  // only read every row and write nothing.
  if (getDataKey()) {
    report.stopped_reason = "encryption_on";
    report.stop_detail = "column encryption is on; search_text stays NULL by design";
    return report;
  }

  // Extra clock reads happen only in bounded mode, so a normal run reads the
  // clock exactly as before (twice per batch).
  const initStarted = limits ? now() : 0;
  phase({ phase: "init_start" });
  const conn = await getDb();
  if (countRemaining) report.null_at_start = await countNullSearchText();
  if (limits) {
    report.timing.init_ms = Math.round(Math.max(0, now() - initStarted));
    phase({
      phase: "init_done",
      init_ms: report.timing.init_ms,
      null_at_start: report.null_at_start,
    });
  }

  let deadline: number | null = null;
  let activeStarted: number | null = null;

  if (limits?.maxInitMs !== undefined && (report.timing.init_ms ?? 0) > limits.maxInitMs) {
    report.stopped_reason = "init_limit";
    report.stop_detail =
      `init took ${report.timing.init_ms} ms, over the ${limits.maxInitMs} ms limit; ` +
      "no batch ran";
  } else {
    if (limits) {
      activeStarted = now();
      if (limits.maxActiveMs !== undefined) deadline = activeStarted + limits.maxActiveMs;
      phase({ phase: "active_start" });
    }
    await runBatches();
  }

  if (limits) {
    report.timing.active_ms =
      activeStarted === null ? 0 : Math.round(Math.max(0, now() - activeStarted));
    phase({
      phase: "active_end",
      active_ms: report.timing.active_ms,
      stopped_reason: report.stopped_reason,
      batches: report.batches,
      scanned: report.scanned,
      filled: report.filled,
      discarded_batches: report.discarded_batches,
    });
  }

  if (countRemaining) {
    const finalStarted = limits ? now() : 0;
    phase({ phase: "final_count_start" });
    report.null_remaining = await countNullSearchText();
    if (limits) {
      report.timing.final_count_ms = Math.round(Math.max(0, now() - finalStarted));
      phase({
        phase: "final_count_done",
        final_count_ms: report.timing.final_count_ms,
        null_remaining: report.null_remaining,
      });
    }
  }
  return report;

  async function runBatches(): Promise<void> {
    let cursor = "";
    let consecutiveVerySlow = 0;
    const pastDeadline = () => deadline !== null && now() >= deadline;
    const stopAtBatchLimit = () => {
      report.stopped_reason = "batch_limit";
      report.stop_detail = `stopped at the ${limits?.maxBatches} batch limit`;
    };
    const stopAtTimeLimit = (detail: string) => {
      report.stopped_reason = "time_limit";
      report.stop_detail = detail;
    };
    for (;;) {
      if (options.signal?.aborted) {
        report.stopped_reason = "aborted";
        report.stop_detail = `stopped after ${report.batches} batches`;
        return;
      }
      // Both caps are checked before the next transaction begins.
      if (limits?.maxBatches !== undefined && report.batches >= limits.maxBatches) {
        stopAtBatchLimit();
        return;
      }
      if (pastDeadline()) {
        stopAtTimeLimit(`active deadline of ${limits?.maxActiveMs} ms reached between batches`);
        return;
      }
      const started = now();
      let batch: { ids: string[]; filled: number };
      try {
        batch = await conn.transaction(async () => {
          // Statements on the handle inside the callback join this transaction.
          const rows = (await conn
            .prepare(
              "SELECT entity_id FROM entity_snapshots WHERE search_text IS NULL AND entity_id > ? " +
                "ORDER BY entity_id LIMIT ?"
            )
            .all(cursor, batchSize)) as Array<{ entity_id: string }>;
          for (const row of rows) {
            await refreshEntitySearchText(conn, row.entity_id);
            if (pastDeadline()) throw new ActiveDeadlineReached();
          }
          let filled = 0;
          if (rows.length > 0) {
            const ids = rows.map((r) => r.entity_id);
            const counted = (await conn
              .prepare(
                `SELECT COUNT(*) AS n FROM entity_snapshots WHERE entity_id IN (${ids
                  .map(() => "?")
                  .join(", ")}) AND search_text IS NOT NULL`
              )
              .get(...ids)) as { n: number } | undefined;
            filled = Number(counted?.n ?? 0);
          }
          // Last check before COMMIT: a batch that ran past the deadline rolls back.
          if (rows.length > 0 && pastDeadline()) throw new ActiveDeadlineReached();
          return { ids: rows.map((r) => r.entity_id), filled };
        });
      } catch (error) {
        if (!(error instanceof ActiveDeadlineReached)) throw error;
        report.discarded_batches += 1;
        stopAtTimeLimit(
          `active deadline of ${limits?.maxActiveMs} ms reached inside batch ${report.batches + 1}; ` +
            "that batch was rolled back"
        );
        return;
      }
      const batchMs = Math.max(0, now() - started);
      if (batch.ids.length === 0) return;

      cursor = batch.ids[batch.ids.length - 1];
      report.batches += 1;
      report.scanned += batch.ids.length;
      report.filled += batch.filled;
      report.last_batch_ms = Math.round(batchMs);
      report.next_pause_ms = nextBackfillPauseMs(settings, batchMs, batch.ids.length);

      consecutiveVerySlow = batchMs > settings.stopBatchMs ? consecutiveVerySlow + 1 : 0;
      if (consecutiveVerySlow >= settings.stopAfterSlowBatches) {
        report.next_pause_ms = 0;
        options.onProgress?.({ ...report });
        report.stopped_reason = "too_slow";
        report.stop_detail =
          `${consecutiveVerySlow} consecutive batches took longer than ${settings.stopBatchMs} ms ` +
          `(last ${report.last_batch_ms} ms); stopping so the backfill does not add to the load`;
        return;
      }
      options.onProgress?.({ ...report });
      if (batch.ids.length < batchSize) return;
      if (limits?.maxBatches !== undefined && report.batches >= limits.maxBatches) {
        stopAtBatchLimit();
        return;
      }
      if (deadline !== null && now() + report.next_pause_ms >= deadline) {
        stopAtTimeLimit(
          `active deadline of ${limits?.maxActiveMs} ms would pass during the ${report.next_pause_ms} ms pause`
        );
        return;
      }
      await sleep(report.next_pause_ms);
    }
  }
}

let backgroundRun: { controller: AbortController; done: Promise<void> } | null = null;

/**
 * Start the backfill in the background when NEOTOMA_SEARCH_TEXT_BACKFILL is on.
 * Returns false (and does nothing) when it is off or a run is already going.
 * Never throws: a failure is logged and the server carries on.
 */
export function startEntitySearchTextBackfillIfEnabled(
  env: NodeJS.ProcessEnv = runtimeEnv()
): boolean {
  if (!isSearchTextBackfillEnabled(env) || backgroundRun) return false;
  const controller = new AbortController();
  const settings = searchTextBackfillSettingsFromEnv(env);
  logger.info(
    `[search_text_backfill] starting: batch ${settings.batchSize}, ${settings.rowsPerSecond} rows/s, ` +
      `slow > ${settings.slowBatchMs} ms pauses x${settings.slowPauseFactor}, ` +
      `stops after ${settings.stopAfterSlowBatches} batches > ${settings.stopBatchMs} ms`
  );
  const done = runEntitySearchTextBackfill({
    settings,
    signal: controller.signal,
    countRemaining: false,
    onProgress: (p) => {
      if (p.batches % 100 === 0) {
        logger.info(
          `[search_text_backfill] ${p.batches} batches, ${p.filled}/${p.scanned} rows filled`
        );
      }
    },
  })
    .then((report) => {
      const line =
        `[search_text_backfill] ${report.stopped_reason}: ${report.batches} batches, ` +
        `${report.filled}/${report.scanned} rows filled` +
        (report.stop_detail ? ` (${report.stop_detail})` : "");
      if (report.stopped_reason === "too_slow") logger.warn(line);
      else logger.info(line);
    })
    .catch((error: unknown) => {
      logger.warn(
        `[search_text_backfill] stopped on error: ${error instanceof Error ? error.message : String(error)}`
      );
    })
    .finally(() => {
      backgroundRun = null;
    });
  backgroundRun = { controller, done };
  return true;
}

/** Stop a background run between batches and wait for it to end. */
export async function stopEntitySearchTextBackfill(): Promise<void> {
  const run = backgroundRun;
  if (!run) return;
  run.controller.abort();
  await run.done;
}
