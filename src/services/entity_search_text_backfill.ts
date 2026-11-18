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
  | "encryption_on";

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
}

export interface SearchTextBackfillOptions {
  settings?: Partial<SearchTextBackfillSettings>;
  signal?: AbortSignal;
  onProgress?: (progress: SearchTextBackfillProgress) => void;
  /** Count NULL rows at start and end (one full count each). Default true. */
  countRemaining?: boolean;
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
  };

  // With encryption on the fill always leaves the column NULL, so a run would
  // only read every row and write nothing.
  if (getDataKey()) {
    report.stopped_reason = "encryption_on";
    report.stop_detail = "column encryption is on; search_text stays NULL by design";
    return report;
  }

  const conn = await getDb();
  if (countRemaining) report.null_at_start = await countNullSearchText();

  let cursor = "";
  let consecutiveVerySlow = 0;
  for (;;) {
    if (options.signal?.aborted) {
      report.stopped_reason = "aborted";
      report.stop_detail = `stopped after ${report.batches} batches`;
      break;
    }
    const started = now();
    const batch = await conn.transaction(async () => {
      // Statements on the handle inside the callback join this transaction.
      const rows = (await conn
        .prepare(
          "SELECT entity_id FROM entity_snapshots WHERE search_text IS NULL AND entity_id > ? " +
            "ORDER BY entity_id LIMIT ?"
        )
        .all(cursor, batchSize)) as Array<{ entity_id: string }>;
      for (const row of rows) await refreshEntitySearchText(conn, row.entity_id);
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
      return { ids: rows.map((r) => r.entity_id), filled };
    });
    const batchMs = Math.max(0, now() - started);
    if (batch.ids.length === 0) break;

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
      break;
    }
    options.onProgress?.({ ...report });
    if (batch.ids.length < batchSize) break;
    await sleep(report.next_pause_ms);
  }

  if (countRemaining) report.null_remaining = await countNullSearchText();
  return report;
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
