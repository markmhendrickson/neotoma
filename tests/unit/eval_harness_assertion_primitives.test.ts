/**
 * #1703 — eval-harness assertion primitives.
 *
 * Self-tests for the four new predicate types that unblock the eval-coverage
 * backfill: mcp_tool.invocations, tool_result.matches, snapshot.field_present,
 * snapshot.field_absent. The first two run purely against captured toolCalls
 * (no network); the snapshot ones stub fetch.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  evaluatePredicate,
  type AssertionContext,
} from "../../packages/eval-harness/src/assertions.js";
import type { ExpectedAssertion, ToolCall } from "../../packages/eval-harness/src/types.js";

function ctx(overrides: Partial<AssertionContext> = {}): AssertionContext {
  return {
    baseUrl: "http://localhost:0",
    stats: null,
    hostToolRegistry: { stubs: new Map(), invocations: [], invoke: async () => ({}) } as never,
    effectiveProfile: "auto",
    ...overrides,
  };
}

const call = (name: string, input: unknown, output?: unknown, error?: string, sequence = 0): ToolCall => ({
  name,
  input,
  output,
  error,
  sequence,
});

describe("#1703 mcp_tool.invocations", () => {
  it("counts invocations of a named tool (passes gte 1)", async () => {
    const c = ctx({ toolCalls: [call("correct", { field: "status" }), call("store", {})] });
    const p: ExpectedAssertion = { type: "mcp_tool.invocations", tool_name: "correct" };
    expect(await evaluatePredicate(p, c)).toBeNull();
  });

  it("fails when the named tool was never called", async () => {
    const c = ctx({ toolCalls: [call("store", {})] });
    const p: ExpectedAssertion = { type: "mcp_tool.invocations", tool_name: "merge_entities" };
    const fail = await evaluatePredicate(p, c);
    expect(fail).not.toBeNull();
    expect(fail!.message).toContain("merge_entities");
  });

  it("arg_subset matches structurally (subset, not exact)", async () => {
    const c = ctx({
      toolCalls: [call("correct", { entity_id: "ent_1", field: "status", value: "done", extra: 1 })],
    });
    const p: ExpectedAssertion = {
      type: "mcp_tool.invocations",
      tool_name: "correct",
      arg_subset: { field: "status", value: "done" },
    };
    expect(await evaluatePredicate(p, c)).toBeNull();
  });

  it("arg_subset fails when a value differs", async () => {
    const c = ctx({ toolCalls: [call("correct", { field: "status", value: "todo" })] });
    const p: ExpectedAssertion = {
      type: "mcp_tool.invocations",
      tool_name: "correct",
      arg_subset: { value: "done" },
    };
    expect(await evaluatePredicate(p, c)).not.toBeNull();
  });

  it("respects op + value (eq 2)", async () => {
    const c = ctx({ toolCalls: [call("subscribe", {}), call("subscribe", {})] });
    const p: ExpectedAssertion = { type: "mcp_tool.invocations", tool_name: "subscribe", op: "eq", value: 2 };
    expect(await evaluatePredicate(p, c)).toBeNull();
  });
});

describe("#1703 tool_result.matches", () => {
  it("matches a result_subset on the last invocation", async () => {
    const c = ctx({
      toolCalls: [call("subscribe", {}, { id: "sub_1", webhook_secret: "wh_abc", active: true })],
    });
    const p: ExpectedAssertion = {
      type: "tool_result.matches",
      tool_name: "subscribe",
      result_subset: { active: true },
    };
    expect(await evaluatePredicate(p, c)).toBeNull();
  });

  it("asserts a result key is present (webhook_secret)", async () => {
    const c = ctx({ toolCalls: [call("subscribe", {}, { webhook_secret: "wh_abc" })] });
    const p: ExpectedAssertion = {
      type: "tool_result.matches",
      tool_name: "subscribe",
      result_key: "webhook_secret",
      present: true,
    };
    expect(await evaluatePredicate(p, c)).toBeNull();
  });

  it("surfaces an error envelope via dotted result_key (error.code)", async () => {
    const c = ctx({
      toolCalls: [call("correct", {}, { error: { code: "ERR_NO_SCHEMA_FOR_ENTITY_TYPE" } })],
    });
    const p: ExpectedAssertion = {
      type: "tool_result.matches",
      tool_name: "correct",
      result_key: "error.code",
      present: true,
    };
    expect(await evaluatePredicate(p, c)).toBeNull();
  });

  it("synthesizes an error envelope when the call recorded an error string", async () => {
    const c = ctx({ toolCalls: [call("delete_entity", {}, undefined, "Entity not found")] });
    const p: ExpectedAssertion = {
      type: "tool_result.matches",
      tool_name: "delete_entity",
      result_key: "error.message",
      present: true,
    };
    expect(await evaluatePredicate(p, c)).toBeNull();
  });

  it("present:false asserts a key is absent", async () => {
    const c = ctx({ toolCalls: [call("store", {}, { entity_id: "ent_1" })] });
    const p: ExpectedAssertion = {
      type: "tool_result.matches",
      tool_name: "store",
      result_key: "error",
      present: false,
    };
    expect(await evaluatePredicate(p, c)).toBeNull();
  });

  it("fails when the tool was never invoked", async () => {
    const c = ctx({ toolCalls: [] });
    const p: ExpectedAssertion = { type: "tool_result.matches", tool_name: "merge_entities", result_key: "ok" };
    const fail = await evaluatePredicate(p, c);
    expect(fail).not.toBeNull();
    expect(fail!.message).toContain("no invocation");
  });

  it("gives an out-of-range hint when which exceeds the call count", async () => {
    const c = ctx({ toolCalls: [call("store", {}, { ok: true })] });
    const p: ExpectedAssertion = {
      type: "tool_result.matches",
      tool_name: "store",
      which: 5,
      result_key: "ok",
    };
    const fail = await evaluatePredicate(p, c);
    expect(fail).not.toBeNull();
    expect(fail!.message).toContain("out of range");
  });

  it("ANDs result_key and result_subset when both are supplied (both must pass)", async () => {
    const c = ctx({
      toolCalls: [call("subscribe", {}, { webhook_secret: "wh", active: true })],
    });
    // key present AND subset matches → pass
    expect(
      await evaluatePredicate(
        { type: "tool_result.matches", tool_name: "subscribe", result_key: "webhook_secret", result_subset: { active: true } },
        c
      )
    ).toBeNull();
    // key present but subset mismatches → fail
    expect(
      await evaluatePredicate(
        { type: "tool_result.matches", tool_name: "subscribe", result_key: "webhook_secret", result_subset: { active: false } },
        c
      )
    ).not.toBeNull();
  });

  it("result_subset matches nested objects structurally (not dotted paths)", async () => {
    const c = ctx({ toolCalls: [call("correct", {}, { error: { code: "ERR_NO_SCHEMA" } })] });
    expect(
      await evaluatePredicate(
        { type: "tool_result.matches", tool_name: "correct", result_subset: { error: { code: "ERR_NO_SCHEMA" } } },
        c
      )
    ).toBeNull();
  });
});

describe("#1703 snapshot.field_present / field_absent", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetchSnapshot(snapshot: Record<string, unknown> | null) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: snapshot !== null,
        json: async () => ({ snapshot }),
      })) as never
    );
  }

  it("field_present passes when the snapshot carries the field", async () => {
    stubFetchSnapshot({ status: "done", title: "x" });
    const p: ExpectedAssertion = {
      type: "snapshot.field_present",
      entity_id: "ent_1",
      field: "status",
    };
    expect(await evaluatePredicate(p, ctx())).toBeNull();
  });

  it("field_present fails when the field is missing", async () => {
    stubFetchSnapshot({ title: "x" });
    const p: ExpectedAssertion = { type: "snapshot.field_present", entity_id: "ent_1", field: "status" };
    expect(await evaluatePredicate(p, ctx())).not.toBeNull();
  });

  it("field_absent passes when the field is missing (raw_fragments stored-but-invisible)", async () => {
    stubFetchSnapshot({ title: "x" });
    const p: ExpectedAssertion = { type: "snapshot.field_absent", entity_id: "ent_1", field: "unknown_field" };
    expect(await evaluatePredicate(p, ctx())).toBeNull();
  });

  it("fails when no snapshot can be resolved", async () => {
    stubFetchSnapshot(null);
    const p: ExpectedAssertion = { type: "snapshot.field_present", entity_id: "missing", field: "x" };
    const fail = await evaluatePredicate(p, ctx());
    expect(fail).not.toBeNull();
    expect(fail!.message).toContain("could not resolve");
  });

  it("resolves multiple where-matches deterministically (lowest entity_id wins)", async () => {
    // /entities/query returns out-of-order; the helper must sort by entity_id
    // so the assertion is reproducible. ent_a carries the field, ent_b does not.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          entities: [
            { entity_id: "ent_b", snapshot: { status: "x" } },
            { entity_id: "ent_a", snapshot: { status: "x", chosen: true } },
          ],
        }),
      })) as never
    );
    // field_present "chosen" passes only if ent_a (lowest id) is chosen.
    const p: ExpectedAssertion = {
      type: "snapshot.field_present",
      entity_type: "task",
      where: { status: "x" },
      field: "chosen",
    };
    expect(await evaluatePredicate(p, ctx())).toBeNull();
  });
});

describe("#2493 stats.counter", () => {
  const stats = { sources_count: 0, total_observations: 3, nested: { rows: 2 } };

  it("passes when the counter satisfies op/value", async () => {
    const p: ExpectedAssertion = { type: "stats.counter", field: "sources_count", op: "eq", value: 0 };
    expect(await evaluatePredicate(p, ctx({ stats }))).toBeNull();
    const q: ExpectedAssertion = { type: "stats.counter", field: "total_observations", op: "gte", value: 1 };
    expect(await evaluatePredicate(q, ctx({ stats }))).toBeNull();
  });

  it("reads dotted paths", async () => {
    const p: ExpectedAssertion = { type: "stats.counter", field: "nested.rows", op: "eq", value: 2 };
    expect(await evaluatePredicate(p, ctx({ stats }))).toBeNull();
  });

  it("fails when the counter violates op/value", async () => {
    const p: ExpectedAssertion = { type: "stats.counter", field: "total_observations", op: "eq", value: 0 };
    const fail = await evaluatePredicate(p, ctx({ stats }));
    expect(fail).not.toBeNull();
    expect(fail!.message).toContain("total_observations");
  });

  it("fails closed on a missing field, a non-numeric field, and absent stats (never reads as zero)", async () => {
    const zero: Omit<ExpectedAssertion, "field"> = { type: "stats.counter", op: "eq", value: 0 };
    expect(await evaluatePredicate({ ...zero, field: "no_such_counter" }, ctx({ stats }))).not.toBeNull();
    expect(await evaluatePredicate({ ...zero, field: "nested" }, ctx({ stats }))).not.toBeNull();
    expect(await evaluatePredicate({ ...zero, field: "sources_count" }, ctx({ stats: null }))).not.toBeNull();
  });
});

describe("#2493 raw_storage.file_count", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const makeDataDir = () => {
    const d = mkdtempSync(join(tmpdir(), "raw-storage-count-"));
    dirs.push(d);
    return d;
  };

  it("counts zero when the raw-storage directory was never created", async () => {
    const p: ExpectedAssertion = { type: "raw_storage.file_count", op: "eq", value: 0 };
    expect(await evaluatePredicate(p, ctx({ dataDir: makeDataDir() }))).toBeNull();
  });

  it("counts files recursively and ignores files outside the raw-storage directory", async () => {
    const d = makeDataDir();
    mkdirSync(join(d, "sources", "user_1"), { recursive: true });
    writeFileSync(join(d, "sources", "user_1", "hash_a"), "a");
    writeFileSync(join(d, "sources", "user_1", "hash_b"), "b");
    writeFileSync(join(d, "neotoma.db"), "not raw storage");
    const eq2: ExpectedAssertion = { type: "raw_storage.file_count", op: "eq", value: 2 };
    expect(await evaluatePredicate(eq2, ctx({ dataDir: d }))).toBeNull();
    const eq0: ExpectedAssertion = { type: "raw_storage.file_count", op: "eq", value: 0 };
    const fail = await evaluatePredicate(eq0, ctx({ dataDir: d }));
    expect(fail).not.toBeNull();
    expect(fail!.message).toContain("got 2");
  });

  it("fails closed when no data dir was provided", async () => {
    const p: ExpectedAssertion = { type: "raw_storage.file_count", op: "eq", value: 0 };
    expect(await evaluatePredicate(p, ctx())).not.toBeNull();
  });
});
