/**
 * Regression gate — advisory 2026-08-07-sort-by-order-by-sql-injection.
 *
 * The `sort_by=snapshot.<field>` and `snapshot_filters` keys were spliced into a
 * `snapshot->>${field}` column and interpolated raw into generated SQL, so a
 * `(CASE WHEN … )` expression reached SQLite and executed (a blind ORDER BY
 * injection that also bypassed per-row user_id scoping on shared backends).
 *
 * Two independent layers must hold:
 *   1. entity_queries rejects non-identifier snapshot field names at the source.
 *   2. the sqlite adapter's normalizeColumnName fails closed on any column that
 *      is neither a bare identifier, a `table.column`, nor a recognised `->>`
 *      projection — the defense-in-depth backstop.
 */
import { describe, it, expect } from "vitest";
import {
  isValidSnapshotFieldName,
  InvalidSnapshotFieldError,
} from "../../src/services/entity_queries.js";
import { normalizeColumnName } from "../../src/repositories/sqlite/local_db_adapter.js";
import { db } from "../../src/db.js";

const INJECTION_FIELDS = [
  "(CASE WHEN 1=1 THEN entity_id ELSE zzz END)",
  "(CASE WHEN 1=1 THEN entity_id ELSE entity_type END)",
  "(SELECT snapshot FROM entity_snapshots)",
  "amount_eur) --",
  "amount_eur; DROP TABLE entity_snapshots;--",
  "amount_eur DESC, (SELECT 1)",
  "json_extract(snapshot,'$.x')",
  "a b",
  "1=1",
  "",
  "snapshot->>x", // the `snapshot.` prefix is stripped before validation; a raw ->> here is not a bare field
];

const LEGITIMATE_FIELDS = [
  "amount_eur",
  "created_at",
  "name",
  "wise_iban",
  "_private",
  "field123",
];

describe("sort_by / snapshot_filters field-name validation (advisory 2026-08-07)", () => {
  it("accepts only bare identifier field names", () => {
    for (const f of LEGITIMATE_FIELDS) {
      expect(isValidSnapshotFieldName(f)).toBe(true);
    }
  });

  it("rejects every injection payload", () => {
    for (const f of INJECTION_FIELDS) {
      expect(isValidSnapshotFieldName(f)).toBe(false);
    }
  });

  it("InvalidSnapshotFieldError names the context and carries the recognisable name", () => {
    const err = new InvalidSnapshotFieldError("(CASE WHEN 1=1 THEN a ELSE b END)", "sort_by");
    // handleApiError matches on this name to return 400 instead of 500.
    expect(err.name).toBe("InvalidSnapshotFieldError");
    expect(err.message).toContain("sort_by");
  });
});

describe("normalizeColumnName fail-closed backstop (advisory 2026-08-07)", () => {
  it("passes through bare and qualified identifiers unchanged", () => {
    expect(normalizeColumnName("entity_snapshots", "entity_id")).toBe("entity_id");
    expect(normalizeColumnName("entity_snapshots", "observation_count")).toBe("observation_count");
    expect(normalizeColumnName("entity_snapshots", "es.user_id")).toBe("es.user_id");
  });

  it("still rewrites recognised ->> projections (no regression)", () => {
    const out = normalizeColumnName("entity_snapshots", "snapshot->>amount_eur");
    expect(out).toContain("json_extract");
    expect(out).not.toContain("(CASE WHEN");
  });

  it("throws on any non-identifier column (the smuggled expression path)", () => {
    const attacks = [
      "snapshot->>(CASE WHEN 1=1 THEN entity_id ELSE zzz END)",
      "(CASE WHEN 1=1 THEN entity_id ELSE zzz END)",
      "entity_id) --",
      "entity_id; DROP TABLE entity_snapshots;--",
      "(SELECT 1)",
      "a b",
    ];
    for (const col of attacks) {
      expect(() => normalizeColumnName("entity_snapshots", col)).toThrow(
        /Unsafe column reference rejected/
      );
    }
  });
});

describe("LIMIT/OFFSET are integer-clamped at the raw sink (advisory 2026-08-07, Fix item 3)", () => {
  it("a legitimate integer limit/offset builds and runs", async () => {
    const { error } = await db.from("entities").select("id").limit(5);
    // May return rows or none, but must not error on the count values.
    expect(error).toBeFalsy();
  });

  it("a non-integer limit is rejected before it reaches SQL", async () => {
    // Bypass upstream Zod validation by driving the adapter directly with a
    // hostile value, modelling a hypothetical future caller that forgot to
    // validate. The adapter's execute() catches the guard's throw and surfaces
    // it as an error envelope — the point is the malicious value NEVER reaches
    // the SQL string; the query is rejected, not run.
    const { data, error } = await db
      .from("entities")
      .select("id")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .limit("1; DROP TABLE entities;--" as any);
    expect(error).toBeTruthy();
    expect(String(error?.message)).toMatch(/Unsafe LIMIT value rejected/);
    expect(data).toBeNull();
  });

  it("a non-integer offset is likewise rejected", async () => {
    const { error } = await db
      .from("entities")
      .select("id")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .range("5); DROP TABLE entities;--" as any, 10 as any);
    expect(error).toBeTruthy();
    expect(String(error?.message)).toMatch(/Unsafe (LIMIT|OFFSET) value rejected/);
  });
});
