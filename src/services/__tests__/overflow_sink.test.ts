/**
 * Unit tests for the overflow sink service (#1604).
 *
 * Tests cover:
 * - NEOTOMA_OVERFLOW_SINK not configured → soft error (no throw)
 * - Directory mode: daily JSONL file created, receipt returned
 * - Explicit .jsonl path mode: uses path as-is
 * - Line offsets increment correctly across multiple writes
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeToOverflowSink } from "../overflow_sink.js";

const TEST_SINK_DIR = join(tmpdir(), `neotoma-overflow-test-${process.pid}`);

function cleanupSink(): void {
  if (existsSync(TEST_SINK_DIR)) {
    rmSync(TEST_SINK_DIR, { recursive: true, force: true });
  }
}

describe("writeToOverflowSink", () => {
  const originalEnv = process.env.NEOTOMA_OVERFLOW_SINK;

  beforeEach(() => {
    cleanupSink();
    delete process.env.NEOTOMA_OVERFLOW_SINK;
  });

  afterEach(() => {
    cleanupSink();
    if (originalEnv !== undefined) {
      process.env.NEOTOMA_OVERFLOW_SINK = originalEnv;
    } else {
      delete process.env.NEOTOMA_OVERFLOW_SINK;
    }
  });

  it("returns OVERFLOW_SINK_NOT_CONFIGURED error when env var is unset", () => {
    const result = writeToOverflowSink({ entity_type: "task", title: "Test task" });
    expect(result).toMatchObject({
      error: "OVERFLOW_SINK_NOT_CONFIGURED",
    });
    expect("overflowed" in result).toBe(false);
    // Hint should explain what to do
    expect((result as { hint: string }).hint).toContain("NEOTOMA_OVERFLOW_SINK");
  });

  it("does not throw when env is unset — soft error", () => {
    expect(() => writeToOverflowSink({ entity_type: "task" })).not.toThrow();
  });

  it("directory mode: creates a daily JSONL file and returns receipt", () => {
    process.env.NEOTOMA_OVERFLOW_SINK = TEST_SINK_DIR;

    const payload = { entity_type: "event", title: "Conference 2026" };
    const result = writeToOverflowSink(payload, "test reason");

    expect(result).toMatchObject({
      overflowed: true,
      line_offset: 0,
    });
    const receipt = result as { overflowed: true; sink_path: string; line_offset: number };
    expect(receipt.sink_path).toMatch(/overflow-\d{4}-\d{2}-\d{2}\.jsonl$/);
    expect(existsSync(receipt.sink_path)).toBe(true);

    const lines = readFileSync(receipt.sink_path, "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]) as {
      payload: unknown;
      reason: string;
      overflowed_at: string;
    };
    expect(parsed.payload).toMatchObject({ entity_type: "event" });
    expect(parsed.reason).toBe("test reason");
    expect(typeof parsed.overflowed_at).toBe("string");
  });

  it("explicit .jsonl path: uses the path as-is", () => {
    mkdirSync(TEST_SINK_DIR, { recursive: true });
    const explicitPath = join(TEST_SINK_DIR, "my-sink.jsonl");
    process.env.NEOTOMA_OVERFLOW_SINK = explicitPath;

    const result = writeToOverflowSink({ entity_type: "note", body: "hello" });
    const receipt = result as { overflowed: true; sink_path: string; line_offset: number };

    expect(receipt.overflowed).toBe(true);
    expect(receipt.sink_path).toBe(explicitPath);
    expect(existsSync(explicitPath)).toBe(true);
  });

  it("line_offset increments correctly across multiple writes", () => {
    process.env.NEOTOMA_OVERFLOW_SINK = TEST_SINK_DIR;

    const r1 = writeToOverflowSink({ n: 1 }) as {
      overflowed: true;
      sink_path: string;
      line_offset: number;
    };
    const r2 = writeToOverflowSink({ n: 2 }) as {
      overflowed: true;
      sink_path: string;
      line_offset: number;
    };
    const r3 = writeToOverflowSink({ n: 3 }) as {
      overflowed: true;
      sink_path: string;
      line_offset: number;
    };

    expect(r1.line_offset).toBe(0);
    expect(r2.line_offset).toBe(1);
    expect(r3.line_offset).toBe(2);

    const lines = readFileSync(r1.sink_path, "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(3);
  });

  it("reason is stored in the JSONL line", () => {
    process.env.NEOTOMA_OVERFLOW_SINK = TEST_SINK_DIR;
    writeToOverflowSink({ entity_type: "task" }, "bulk-import-2026");

    // Find the daily file
    const receipt = writeToOverflowSink({ entity_type: "task2" }, "another") as {
      overflowed: true;
      sink_path: string;
      line_offset: number;
    };
    const lines = readFileSync(receipt.sink_path, "utf8").split("\n").filter(Boolean);

    const firstLine = JSON.parse(lines[0]) as { reason: string };
    expect(firstLine.reason).toBe("bulk-import-2026");
  });

  it("reason is undefined when not provided", () => {
    process.env.NEOTOMA_OVERFLOW_SINK = TEST_SINK_DIR;
    const result = writeToOverflowSink({ entity_type: "task" }) as {
      overflowed: true;
      sink_path: string;
      line_offset: number;
    };
    const lines = readFileSync(result.sink_path, "utf8").split("\n").filter(Boolean);
    const parsed = JSON.parse(lines[0]) as { reason: unknown };
    expect(parsed.reason).toBeUndefined();
  });
});
