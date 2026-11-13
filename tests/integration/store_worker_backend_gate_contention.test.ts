/**
 * A `/store` that commits must report success, with a populated snapshot, even
 * while another client keeps the database's write gate busy.
 *
 * The defect: on the worker (libsql) backend a non-transaction write awaited a
 * snapshot of the gate, and a transaction queued after that snapshot (another
 * client's correction) began on the single writer connection first. The write
 * then executed inside that transaction: its promise resolved before COMMIT, so
 * the next read, which goes to a reader worker, did not see it. In the store
 * path that surfaced as `Store write completion marker did not persist for
 * source ...` (HTTP 500 DB_QUERY_FAILED) after the observations had landed, and
 * as an empty `snapshot: {}` because the snapshot recompute read the
 * observations through a reader.
 *
 * This file forces the worker backend (the default test backend is sqlite, which
 * has one connection and cannot show the fault) and keeps a second client's
 * transactions queueing behind the store for its whole duration.
 */

import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dataDir = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("node:os") as typeof import("node:os");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const p = require("node:path") as typeof import("node:path");
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), "neotoma-store-gate-"));
  process.env.NEOTOMA_DB_BACKEND = "libsql";
  process.env.NEOTOMA_DB_URL = "";
  process.env.NEOTOMA_SQLITE_PATH = p.join(dir, "neotoma.db");
  return dir;
});

import { db } from "../../src/db.js";
import { storeStructuredForApi } from "../../src/actions.js";
import { getDb } from "../../src/repositories/db/connection.js";
import {
  confirmStoreWriteComplete,
  readStoreWriteState,
} from "../../src/services/store_write_state.js";

const ENTITY_TYPE = "store_gate_contention_note";

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("store under write-gate contention on the worker backend", () => {
  let stopContender = false;
  let contenders: Array<Promise<void>> = [];

  beforeAll(async () => {
    // Fail loudly if the premise (worker backend) does not hold; otherwise the
    // tests below would pass vacuously on the sqlite backend.
    const conn = await getDb();
    expect(typeof (conn as { readerPoolStats?: unknown }).readerPoolStats).toBe("function");
  });

  /**
   * Other clients issuing transactions back to back, each holding the gate. Several
   * of them, so a transaction is always queued behind the open one: that is what
   * lets a new one enqueue between a write's gate check and its dispatch.
   */
  async function startContenders(count = 3): Promise<void> {
    stopContender = false;
    const conn = await getDb();
    await conn.exec("CREATE TABLE IF NOT EXISTS gate_contender (id INTEGER PRIMARY KEY, v TEXT)");
    contenders = Array.from({ length: count }, () =>
      (async () => {
        while (!stopContender) {
          await conn.transaction(async (tx) => {
            await tx.prepare("INSERT INTO gate_contender (v) VALUES (?)").run("x");
            await new Promise((resolve) => setTimeout(resolve, 5));
          });
        }
      })()
    );
  }

  async function stopContenderAndWait(): Promise<void> {
    stopContender = true;
    await Promise.all(contenders);
    contenders = [];
  }

  it("returns success, a complete marker and a non-empty snapshot for every store", async () => {
    const userId = randomUUID();
    await startContenders();
    try {
      for (let i = 0; i < 12; i += 1) {
        const key = `gate-${randomUUID()}`;
        const result = await storeStructuredForApi({
          userId,
          entities: [{ entity_type: ENTITY_TYPE, title: `gate contention ${key}`, seq: i }],
          sourcePriority: 100,
          idempotencyKey: key,
        });
        expect(result.success).toBe(true);
        expect((result as { write_committed?: boolean }).write_committed).toBeUndefined();
        const entry = (
          result.entities as Array<{
            entity_snapshot_after: Record<string, unknown> | null;
          }>
        )[0];
        expect(Object.keys(entry.entity_snapshot_after ?? {}).length).toBeGreaterThan(0);

        const { data: source } = await db
          .from("sources")
          .select("provenance")
          .eq("user_id", userId)
          .eq("idempotency_key", key)
          .maybeSingle();
        expect(readStoreWriteState(source?.provenance)).toBe("complete");
      }
    } finally {
      await stopContenderAndWait();
    }
  }, 120_000);
});

describe("confirmStoreWriteComplete", () => {
  it("reports unconfirmed instead of throwing when the source row cannot be found", async () => {
    const outcome = await confirmStoreWriteComplete(randomUUID(), randomUUID());
    expect(outcome.state).toBe("unconfirmed");
    if (outcome.state === "unconfirmed") {
      expect(outcome.reason).toMatch(/not found/);
    }
  });
});
