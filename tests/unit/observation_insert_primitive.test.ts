/**
 * Unit tests for the shared observation-insert primitive
 * (src/services/observation_insert.ts).
 *
 * Three insertion sites build an `observations` row and probe for an existing
 * content-addressed row before writing: `createObservation`, the MCP
 * structured-store core, and `createCorrection`. The primitive holds the row
 * construction, the existing-row probe and the insert so those sites cannot
 * drift. It is a non-behavioural extraction: every assertion here pins a
 * detail each site relied on before the extraction.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ op: string; args: unknown[] }> = [];
let nextResult: unknown = { data: null, error: null };

vi.mock("../../src/db.js", () => {
  function chain() {
    const builder: Record<string, unknown> = {};
    for (const name of ["select", "eq", "insert"]) {
      builder[name] = (...args: unknown[]) => {
        calls.push({ op: name, args });
        return builder;
      };
    }
    builder.maybeSingle = (...args: unknown[]) => {
      calls.push({ op: "maybeSingle", args });
      return Promise.resolve(nextResult);
    };
    builder.then = (resolve: (v: unknown) => unknown) => resolve(nextResult);
    return builder;
  }
  return {
    db: {
      from: (table: string) => {
        calls.push({ op: "from", args: [table] });
        return chain();
      },
    },
  };
});

import {
  DEFAULT_OBSERVATION_SOURCE,
  buildObservationRow,
  findExistingObservation,
  insertObservationRow,
} from "../../src/services/observation_insert.js";

const REQUIRED = {
  id: "obs_1",
  entity_id: "ent_1",
  entity_type: "note",
  schema_version: "1.0",
  source_id: "src_1",
  interpretation_id: null,
  observed_at: "2026-01-02T03:04:05.000Z",
  specificity_score: 1,
  source_priority: 100,
  fields: { title: "t" },
  user_id: "user_1",
};

describe("buildObservationRow", () => {
  it("emits exactly the required columns when no optional input is given", () => {
    expect(buildObservationRow({ ...REQUIRED })).toEqual({ ...REQUIRED });
  });

  it("includes an optional column iff it is not undefined (empty string and null count as supplied)", () => {
    const row = buildObservationRow({
      ...REQUIRED,
      observation_source: "human",
      idempotency_key: "k",
      identity_basis: "schema_rule",
      identity_rule: "",
      source_peer_id: "peer",
      created_at: "2026-01-02T03:04:06.000Z",
    });
    expect(row).toEqual({
      ...REQUIRED,
      observation_source: "human",
      idempotency_key: "k",
      identity_basis: "schema_rule",
      identity_rule: "",
      source_peer_id: "peer",
      created_at: "2026-01-02T03:04:06.000Z",
    });
    expect(buildObservationRow({ ...REQUIRED, identity_rule: null })).toHaveProperty(
      "identity_rule",
      null
    );
    expect(buildObservationRow({ ...REQUIRED, observation_source: undefined })).not.toHaveProperty(
      "observation_source"
    );
  });

  it("stamps provenance only when attribution is non-empty", () => {
    expect(buildObservationRow({ ...REQUIRED, provenance: {} })).not.toHaveProperty("provenance");
    expect(buildObservationRow({ ...REQUIRED, provenance: undefined })).not.toHaveProperty(
      "provenance"
    );
    expect(
      buildObservationRow({ ...REQUIRED, provenance: { attribution_tier: "software" } })
    ).toHaveProperty("provenance", { attribution_tier: "software" });
  });

  it("does not mutate the supplied fields or provenance objects", () => {
    const fields = { title: "t" };
    const provenance = { attribution_tier: "software" };
    const row = buildObservationRow({ ...REQUIRED, fields, provenance });
    expect(fields).toEqual({ title: "t" });
    expect(provenance).toEqual({ attribution_tier: "software" });
    expect(row.fields).toBe(fields);
  });

  it("exposes the same default observation source the service has always applied", () => {
    expect(DEFAULT_OBSERVATION_SOURCE).toBe("llm_summary");
  });
});

describe("findExistingObservation", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("probes observations by id scoped to the owner and returns the raw result", async () => {
    nextResult = { data: { id: "obs_1" }, error: null };
    const result = await findExistingObservation("obs_1", "user_1", "id");
    expect(result).toEqual({ data: { id: "obs_1" }, error: null });
    expect(calls).toEqual([
      { op: "from", args: ["observations"] },
      { op: "select", args: ["id"] },
      { op: "eq", args: ["id", "obs_1"] },
      { op: "eq", args: ["user_id", "user_1"] },
      { op: "maybeSingle", args: [] },
    ]);
  });

  it("selects every column by default", async () => {
    nextResult = { data: null, error: null };
    await findExistingObservation("obs_1", "user_1");
    expect(calls.find((c) => c.op === "select")?.args).toEqual(["*"]);
  });

  it("returns a database error to the caller instead of throwing", async () => {
    nextResult = { data: null, error: { message: "boom" } };
    await expect(findExistingObservation("obs_1", "user_1")).resolves.toEqual({
      data: null,
      error: { message: "boom" },
    });
  });
});

describe("insertObservationRow", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("inserts the row unchanged into observations and leaves chaining to the caller", async () => {
    nextResult = { data: null, error: null };
    const row = buildObservationRow({ ...REQUIRED });
    const result = await insertObservationRow(row);
    expect(result).toEqual({ data: null, error: null });
    expect(calls).toEqual([
      { op: "from", args: ["observations"] },
      { op: "insert", args: [row] },
    ]);
    expect(calls[1].args[0]).toBe(row);
  });
});
