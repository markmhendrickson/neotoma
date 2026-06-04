/**
 * Unit tests for observer_import.ts — extraction predicates and helpers.
 *
 * Each test exercises one filter predicate against a JSONL fixture line,
 * verifying that `classifyLine` returns the expected anomaly class and that
 * `extractAnomalies` picks up that line in the result set.
 */

import { describe, it, expect } from "vitest";
import {
  classifyLine,
  extractAnomalies,
  parseJsonlLine,
  anomalyDedupKey,
  type ObserverLogLine,
} from "./observer_import.js";

// ─── parseJsonlLine ───────────────────────────────────────────────────────────

describe("parseJsonlLine", () => {
  it("parses a valid JSON object line", () => {
    const result = parseJsonlLine('{"exit_code":0,"command":"store"}');
    expect(result).not.toBeNull();
    expect(result?.exit_code).toBe(0);
  });

  it("returns null for empty lines", () => {
    expect(parseJsonlLine("")).toBeNull();
    expect(parseJsonlLine("   ")).toBeNull();
  });

  it("returns null for comment lines", () => {
    expect(parseJsonlLine("// comment")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseJsonlLine("{not json}")).toBeNull();
  });

  it("returns null for JSON arrays", () => {
    expect(parseJsonlLine("[1,2,3]")).toBeNull();
  });

  it("returns null for JSON primitives", () => {
    expect(parseJsonlLine('"hello"')).toBeNull();
  });
});

// ─── classifyLine — clean lines ───────────────────────────────────────────────

describe("classifyLine — clean lines", () => {
  it("returns null for a successful command with no warnings", () => {
    const line: ObserverLogLine = {
      exit_code: 0,
      command: "store entities",
      stdout: "",
      stderr: "",
      duration_ms: 100,
    };
    expect(classifyLine(line)).toBeNull();
  });

  it("returns null when exit_code is 0 even with non-zero duration under threshold", () => {
    const line: ObserverLogLine = {
      exit_code: 0,
      command: "retrieve entities",
      duration_ms: 4999,
    };
    expect(classifyLine(line)).toBeNull();
  });
});

// ─── Predicate 1: hard_error ─────────────────────────────────────────────────

describe("classifyLine — predicate 1: hard_error", () => {
  it("classifies non-zero exit_code with ERR_ in stderr as hard_error", () => {
    const line: ObserverLogLine = {
      exit_code: 1,
      command: "store entities",
      stderr: "ERR_TRANSPORT_TIMEOUT: connection refused after 3 retries",
    };
    expect(classifyLine(line)).toBe("hard_error");
  });

  it("does NOT classify as hard_error when exit_code is 0", () => {
    const line: ObserverLogLine = {
      exit_code: 0,
      command: "store",
      stderr: "ERR_TRANSPORT_TIMEOUT: something",
    };
    expect(classifyLine(line)).toBeNull();
  });

  it("does NOT classify as hard_error when there is no ERR_ in stderr", () => {
    const line: ObserverLogLine = {
      exit_code: 1,
      command: "store",
      stderr: "generic error without code",
    };
    expect(classifyLine(line)).toBeNull();
  });
});

// ─── Predicate 2: schema_drift ───────────────────────────────────────────────

describe("classifyLine — predicate 2: schema_drift", () => {
  it("classifies unknown_fields_count > 0 as schema_drift", () => {
    const line: ObserverLogLine = {
      exit_code: 0,
      command: "retrieve entities",
      unknown_fields_count: 3,
      stdout: '{"entities":[{"unknown_field":"x"}]}',
    };
    expect(classifyLine(line)).toBe("schema_drift");
  });

  it("does NOT classify when unknown_fields_count is 0", () => {
    const line: ObserverLogLine = {
      exit_code: 0,
      command: "retrieve entities",
      unknown_fields_count: 0,
    };
    expect(classifyLine(line)).toBeNull();
  });

  it("does NOT classify when unknown_fields_count is absent", () => {
    const line: ObserverLogLine = {
      exit_code: 0,
      command: "retrieve entities",
    };
    expect(classifyLine(line)).toBeNull();
  });
});

// ─── Predicate 3: heuristic_merge ────────────────────────────────────────────

describe("classifyLine — predicate 3: heuristic_merge", () => {
  it("classifies HEURISTIC_MERGE in stderr as heuristic_merge", () => {
    const line: ObserverLogLine = {
      exit_code: 0,
      command: "store entities",
      stderr: "[warn] HEURISTIC_MERGE: merged entity ent_abc with ent_def based on title similarity",
    };
    expect(classifyLine(line)).toBe("heuristic_merge");
  });

  it("does NOT classify when HEURISTIC_MERGE is absent", () => {
    const line: ObserverLogLine = {
      exit_code: 0,
      command: "store entities",
      stderr: "Normal merge happened",
    };
    expect(classifyLine(line)).toBeNull();
  });
});

// ─── Predicate 4: perf_regression ────────────────────────────────────────────

describe("classifyLine — predicate 4: perf_regression", () => {
  it("classifies duration_ms > 5000 on store as perf_regression", () => {
    const line: ObserverLogLine = {
      exit_code: 0,
      command: "store entities",
      duration_ms: 7500,
    };
    expect(classifyLine(line)).toBe("perf_regression");
  });

  it("classifies duration_ms > 5000 on retrieve as perf_regression", () => {
    const line: ObserverLogLine = {
      exit_code: 0,
      command: "retrieve entities",
      duration_ms: 5001,
    };
    expect(classifyLine(line)).toBe("perf_regression");
  });

  it("does NOT classify when duration_ms == 5000 (boundary: strictly greater than)", () => {
    const line: ObserverLogLine = {
      exit_code: 0,
      command: "store entities",
      duration_ms: 5000,
    };
    expect(classifyLine(line)).toBeNull();
  });

  it("does NOT classify a slow non-store/retrieve command as perf_regression", () => {
    const line: ObserverLogLine = {
      exit_code: 0,
      command: "schema list",
      duration_ms: 9999,
    };
    expect(classifyLine(line)).toBeNull();
  });
});

// ─── Predicate 5: resolver_bug ───────────────────────────────────────────────

describe("classifyLine — predicate 5: resolver_bug", () => {
  it("classifies ERR_STORE_RESOLUTION_FAILED in stderr as resolver_bug", () => {
    const line: ObserverLogLine = {
      exit_code: 1,
      command: "store",
      stderr: "ERR_STORE_RESOLUTION_FAILED: could not resolve entity ent_xyz",
    };
    expect(classifyLine(line)).toBe("resolver_bug");
  });

  it("classifies ERR_STORE_RESOLUTION_FAILED in stdout as resolver_bug", () => {
    const line: ObserverLogLine = {
      exit_code: 0,
      command: "store",
      stdout: '{"error":"ERR_STORE_RESOLUTION_FAILED"}',
    };
    expect(classifyLine(line)).toBe("resolver_bug");
  });
});

// ─── Predicate 6: sqlite_corruption ─────────────────────────────────────────

describe("classifyLine — predicate 6: sqlite_corruption", () => {
  it("classifies 'database disk image is malformed' in stderr as sqlite_corruption", () => {
    const line: ObserverLogLine = {
      exit_code: 1,
      command: "store",
      stderr: "SqliteError: database disk image is malformed",
    };
    expect(classifyLine(line)).toBe("sqlite_corruption");
  });

  it("classifies the error in stdout as sqlite_corruption", () => {
    const line: ObserverLogLine = {
      exit_code: 0,
      command: "retrieve",
      stdout: "database disk image is malformed — falling back",
    };
    expect(classifyLine(line)).toBe("sqlite_corruption");
  });

  it("is case-insensitive for corruption check", () => {
    const line: ObserverLogLine = {
      exit_code: 1,
      stderr: "Database Disk Image Is Malformed",
    };
    expect(classifyLine(line)).toBe("sqlite_corruption");
  });
});

// ─── Predicate 7: reporter_env_required ──────────────────────────────────────

describe("classifyLine — predicate 7: reporter_env_required", () => {
  it("classifies ERR_REPORTER_ENVIRONMENT_REQUIRED in stderr", () => {
    const line: ObserverLogLine = {
      exit_code: 1,
      command: "issues submit",
      stderr:
        "IssueValidationError: ERR_REPORTER_ENVIRONMENT_REQUIRED — provide reporter_git_sha or reporter_app_version",
    };
    expect(classifyLine(line)).toBe("reporter_env_required");
  });

  it("classifies ERR_REPORTER_ENVIRONMENT_REQUIRED in stdout", () => {
    const line: ObserverLogLine = {
      exit_code: 0,
      stdout: '{"code":"ERR_REPORTER_ENVIRONMENT_REQUIRED"}',
    };
    expect(classifyLine(line)).toBe("reporter_env_required");
  });
});

// ─── Predicate 8: stale_mcp_session ──────────────────────────────────────────

describe("classifyLine — predicate 8: stale_mcp_session", () => {
  it("classifies status_code=503 on /mcp path as stale_mcp_session", () => {
    const line: ObserverLogLine = {
      exit_code: 0,
      status_code: 503,
      path: "/mcp",
    };
    expect(classifyLine(line)).toBe("stale_mcp_session");
  });

  it("classifies status_code=503 on /mcp/store as stale_mcp_session", () => {
    const line: ObserverLogLine = {
      status_code: 503,
      path: "/mcp/store",
    };
    expect(classifyLine(line)).toBe("stale_mcp_session");
  });

  it("does NOT classify 503 on a non-mcp path", () => {
    const line: ObserverLogLine = {
      status_code: 503,
      path: "/health",
    };
    expect(classifyLine(line)).toBeNull();
  });

  it("does NOT classify 200 on /mcp", () => {
    const line: ObserverLogLine = {
      exit_code: 0,
      status_code: 200,
      path: "/mcp",
    };
    expect(classifyLine(line)).toBeNull();
  });
});

// ─── anomalyDedupKey ─────────────────────────────────────────────────────────

describe("anomalyDedupKey", () => {
  it("returns a stable key from class + command_prefix + reporter_channel", () => {
    const anomaly = {
      line_index: 0,
      timestamp: null,
      anomaly_class: "hard_error" as const,
      command_prefix: "store entities",
      reporter_channel: "cli",
      raw: {},
      title: "",
      body: "",
    };
    expect(anomalyDedupKey(anomaly)).toBe("hard_error:store entities:cli");
  });
});

// ─── extractAnomalies — integration over multi-line JSONL ────────────────────

describe("extractAnomalies", () => {
  const fixture = [
    // Line 0: clean
    JSON.stringify({ exit_code: 0, command: "store entities", duration_ms: 100, timestamp: "2024-01-01T00:00:00Z" }),
    // Line 1: hard_error (predicate 1)
    JSON.stringify({ exit_code: 1, command: "store entities", stderr: "ERR_TRANSPORT_FAIL", timestamp: "2024-01-01T01:00:00Z" }),
    // Line 2: schema_drift (predicate 2)
    JSON.stringify({ exit_code: 0, command: "retrieve entities", unknown_fields_count: 2, timestamp: "2024-01-01T02:00:00Z" }),
    // Line 3: heuristic_merge (predicate 3)
    JSON.stringify({ exit_code: 0, command: "store", stderr: "HEURISTIC_MERGE: merged", timestamp: "2024-01-01T03:00:00Z" }),
    // Line 4: perf_regression (predicate 4)
    JSON.stringify({ exit_code: 0, command: "store entities", duration_ms: 6000, timestamp: "2024-01-01T04:00:00Z" }),
    // Line 5: resolver_bug (predicate 5)
    JSON.stringify({ exit_code: 1, command: "store", stderr: "ERR_STORE_RESOLUTION_FAILED", timestamp: "2024-01-01T05:00:00Z" }),
    // Line 6: sqlite_corruption (predicate 6)
    JSON.stringify({ exit_code: 1, command: "retrieve", stderr: "database disk image is malformed", timestamp: "2024-01-01T06:00:00Z" }),
    // Line 7: reporter_env_required (predicate 7)
    JSON.stringify({ exit_code: 1, command: "issues submit", stderr: "ERR_REPORTER_ENVIRONMENT_REQUIRED", timestamp: "2024-01-01T07:00:00Z" }),
    // Line 8: stale_mcp_session (predicate 8)
    JSON.stringify({ status_code: 503, path: "/mcp", timestamp: "2024-01-01T08:00:00Z" }),
    // Line 9: empty line (skipped)
    "",
    // Line 10: unparseable
    "not json at all {",
  ].join("\n");

  it("extracts one anomaly per predicate (8 total) from the fixture", () => {
    const result = extractAnomalies(fixture);
    expect(result.anomalies).toHaveLength(8);
  });

  it("accounts for lines_scanned (all parseable lines)", () => {
    const result = extractAnomalies(fixture);
    // 9 parseable lines (0-8), 1 unparseable (line 10)
    expect(result.lines_scanned).toBe(9);
    expect(result.lines_unparseable).toBe(1);
  });

  it("covers all 8 anomaly classes", () => {
    const result = extractAnomalies(fixture);
    const classes = result.anomalies.map((a) => a.anomaly_class).sort();
    expect(classes).toEqual([
      "hard_error",
      "heuristic_merge",
      "perf_regression",
      "reporter_env_required",
      "resolver_bug",
      "schema_drift",
      "sqlite_corruption",
      "stale_mcp_session",
    ]);
  });

  it("respects --since filter (ISO 8601)", () => {
    // Only lines from 04:00 onwards
    const result = extractAnomalies(fixture, { since: "2024-01-01T04:00:00Z" });
    const classes = result.anomalies.map((a) => a.anomaly_class).sort();
    expect(classes).toEqual([
      "perf_regression",
      "reporter_env_required",
      "resolver_bug",
      "sqlite_corruption",
      "stale_mcp_session",
    ]);
    expect(result.lines_skipped_by_filter).toBeGreaterThan(0);
  });

  it("respects --until filter (ISO 8601)", () => {
    // Only lines up to 02:00
    const result = extractAnomalies(fixture, { until: "2024-01-01T02:00:00Z" });
    const classes = result.anomalies.map((a) => a.anomaly_class).sort();
    expect(classes).toEqual(["hard_error", "schema_drift"]);
  });

  it("respects --limit", () => {
    const result = extractAnomalies(fixture, { limit: 3 });
    expect(result.anomalies).toHaveLength(3);
  });

  it("overrides reporter_channel when --reporter-channel is set", () => {
    const result = extractAnomalies(fixture, { reporterChannel: "ci-test" });
    expect(result.anomalies.every((a) => a.reporter_channel === "ci-test")).toBe(true);
  });

  it("returns empty results for an all-clean JSONL", () => {
    const clean = [
      JSON.stringify({ exit_code: 0, command: "store", duration_ms: 100 }),
      JSON.stringify({ exit_code: 0, command: "retrieve entities", duration_ms: 200 }),
    ].join("\n");
    const result = extractAnomalies(clean);
    expect(result.anomalies).toHaveLength(0);
    expect(result.lines_scanned).toBe(2);
  });

  it("handles empty content gracefully", () => {
    const result = extractAnomalies("");
    expect(result.anomalies).toHaveLength(0);
    expect(result.lines_scanned).toBe(0);
  });

  it("each anomaly has a non-empty title and body", () => {
    const result = extractAnomalies(fixture);
    for (const a of result.anomalies) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.body.length).toBeGreaterThan(0);
    }
  });

  it("includes reporter provenance fields from the JSONL line", () => {
    const withProvenance = JSON.stringify({
      exit_code: 1,
      command: "store",
      stderr: "ERR_TRANSPORT_FAIL",
      reporter_git_sha: "abc1234",
      reporter_app_version: "1.2.3",
      reporter_channel: "cursor",
    });
    const result = extractAnomalies(withProvenance);
    expect(result.anomalies).toHaveLength(1);
    const a = result.anomalies[0];
    expect(a.reporter_git_sha).toBe("abc1234");
    expect(a.reporter_app_version).toBe("1.2.3");
    expect(a.reporter_channel).toBe("cursor");
  });
});

// ─── Integration: one anomaly per predicate in a single pass ─────────────────

describe("extractAnomalies — integration: each predicate covered independently", () => {
  function singleLine(line: ObserverLogLine): ReturnType<typeof extractAnomalies> {
    return extractAnomalies(JSON.stringify(line));
  }

  it("predicate 1: hard_error — exit_code=2 + ERR_ in stderr", () => {
    const r = singleLine({ exit_code: 2, command: "store", stderr: "ERR_STORE_FAIL: disk full" });
    expect(r.anomalies).toHaveLength(1);
    expect(r.anomalies[0].anomaly_class).toBe("hard_error");
  });

  it("predicate 2: schema_drift — unknown_fields_count=1", () => {
    const r = singleLine({ exit_code: 0, command: "retrieve_entities", unknown_fields_count: 1 });
    expect(r.anomalies).toHaveLength(1);
    expect(r.anomalies[0].anomaly_class).toBe("schema_drift");
  });

  it("predicate 3: heuristic_merge — HEURISTIC_MERGE in stderr", () => {
    const r = singleLine({ exit_code: 0, command: "store", stderr: "HEURISTIC_MERGE detected" });
    expect(r.anomalies).toHaveLength(1);
    expect(r.anomalies[0].anomaly_class).toBe("heuristic_merge");
  });

  it("predicate 4: perf_regression — duration_ms=10000 on store", () => {
    const r = singleLine({ exit_code: 0, command: "store entities", duration_ms: 10000 });
    expect(r.anomalies).toHaveLength(1);
    expect(r.anomalies[0].anomaly_class).toBe("perf_regression");
  });

  it("predicate 5: resolver_bug — ERR_STORE_RESOLUTION_FAILED in stderr", () => {
    const r = singleLine({ exit_code: 1, command: "store", stderr: "ERR_STORE_RESOLUTION_FAILED" });
    expect(r.anomalies).toHaveLength(1);
    expect(r.anomalies[0].anomaly_class).toBe("resolver_bug");
  });

  it("predicate 6: sqlite_corruption — corruption message in stderr", () => {
    const r = singleLine({ exit_code: 1, stderr: "database disk image is malformed" });
    expect(r.anomalies).toHaveLength(1);
    expect(r.anomalies[0].anomaly_class).toBe("sqlite_corruption");
  });

  it("predicate 7: reporter_env_required — code in stderr", () => {
    const r = singleLine({ exit_code: 1, command: "issues submit", stderr: "ERR_REPORTER_ENVIRONMENT_REQUIRED" });
    expect(r.anomalies).toHaveLength(1);
    expect(r.anomalies[0].anomaly_class).toBe("reporter_env_required");
  });

  it("predicate 8: stale_mcp_session — 503 on /mcp", () => {
    const r = singleLine({ status_code: 503, path: "/mcp" });
    expect(r.anomalies).toHaveLength(1);
    expect(r.anomalies[0].anomaly_class).toBe("stale_mcp_session");
  });
});
