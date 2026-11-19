/**
 * Substrate event emission when the snapshot cannot be computed.
 *
 * Subscribers treat `entity.created` as "a new entity appeared" and ignore
 * `observation.created`. A store, whether over REST (`storeStructuredForApi`),
 * MCP (`NeotomaServer.store`) or an interpretation run, must therefore still
 * emit `entity.created` for a NEW entity when the snapshot computation throws
 * or yields nothing, in addition to `observation.created`, and must emit it
 * exactly once on the normal path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// Wrap recomputeSnapshot (the REST path's snapshot computation) so a test can
// force it to fail; it is a pass-through otherwise.
const recomputeControl = vi.hoisted(() => ({ fail: false }));
vi.mock("../../src/services/snapshot_computation.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/services/snapshot_computation.js")>();
  return {
    ...actual,
    recomputeSnapshot: (...args: Parameters<typeof actual.recomputeSnapshot>) => {
      if (recomputeControl.fail) throw new Error("forced recomputeSnapshot failure");
      return actual.recomputeSnapshot(...args);
    },
  };
});

import { db } from "../../src/db.js";
import { storeStructuredForApi } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { runInterpretation } from "../../src/services/interpretation.js";
import type { InterpretationConfig } from "../../src/services/interpretation.js";
import { observationReducer } from "../../src/reducers/observation_reducer.js";
import { substrateEventBus } from "../../src/events/substrate_event_bus.js";
import { mergeEntities } from "../../src/services/entity_merge.js";
import { emitStoreWriteEvents } from "../../src/events/substrate_store_emit.js";
import type { SubstrateEvent } from "../../src/events/types.js";
import { cleanupTestEntityType } from "../helpers/test_schema_helpers.js";

const TEST_USER = "00000000-0000-0000-0000-000000002931";
const INTERP_TYPE = "entity_created_emission_interp_type";

function capture() {
  const events: SubstrateEvent[] = [];
  const listener = (ev: SubstrateEvent) => events.push(ev);
  substrateEventBus.onSubstrateEvent(listener);
  return {
    events,
    stop: () => substrateEventBus.off("substrate_event", listener),
  };
}

const types = (events: SubstrateEvent[]) => events.map((e) => e.event_type).sort();

describe("emitStoreWriteEvents helper", () => {
  it("emits entity.created for a new entity with no snapshot", () => {
    const cap = capture();
    try {
      emitStoreWriteEvents({
        user_id: TEST_USER,
        entity_id: "ent_x",
        entity_type: "task",
        observation_id: "obs_x",
        timestamp: new Date().toISOString(),
        is_new_entity: true,
        prior_snapshot: {},
        snapshot_after: null,
      });
    } finally {
      cap.stop();
    }
    expect(types(cap.events)).toEqual(["entity.created", "observation.created"]);
  });

  it("emits entity.updated without fields_changed for an existing entity with no snapshot", () => {
    const cap = capture();
    try {
      emitStoreWriteEvents({
        user_id: TEST_USER,
        entity_id: "ent_x",
        entity_type: "task",
        observation_id: "obs_x",
        timestamp: new Date().toISOString(),
        is_new_entity: false,
        prior_snapshot: { a: 1 },
        snapshot_after: null,
      });
    } finally {
      cap.stop();
    }
    const updated = cap.events.find((e) => e.event_type === "entity.updated");
    expect(types(cap.events)).toEqual(["entity.updated", "observation.created"]);
    expect(updated?.fields_changed).toBeUndefined();
  });
});

describe.each(["rest", "mcp"] as const)("store (%s) event emission", (surface) => {
  const server = new NeotomaServer();
  (server as unknown as { authenticatedUserId: string }).authenticatedUserId = TEST_USER;

  const store = (title: string, extra: Record<string, unknown> = {}) => {
    const entities = [{ entity_type: "task", title, ...extra }];
    return surface === "mcp"
      ? (server as unknown as { store: (a: unknown) => Promise<unknown> }).store({
          entities,
          idempotency_key: `emit-${randomUUID()}`,
        })
      : storeStructuredForApi({
          userId: TEST_USER,
          entities,
          idempotencyKey: `emit-${randomUUID()}`,
          sourcePriority: 100,
        });
  };

  afterEach(() => {
    recomputeControl.fail = false;
    vi.restoreAllMocks();
  });

  it("emits exactly one entity.created and one observation.created on a normal store", async () => {
    const cap = capture();
    try {
      await store(`emit-normal-${randomUUID()}`);
    } finally {
      cap.stop();
    }
    expect(cap.events.filter((e) => e.event_type === "entity.created")).toHaveLength(1);
    expect(cap.events.filter((e) => e.event_type === "observation.created")).toHaveLength(1);
    expect(cap.events.filter((e) => e.event_type === "entity.updated")).toHaveLength(0);
  });

  it.each(["throws", "returns null"] as const)(
    "still emits entity.created for a new entity when the snapshot computation %s",
    async (mode) => {
      if (surface === "rest") {
        // REST path: recomputeSnapshot. A "null" result is a recompute with no snapshot.
        if (mode === "throws") recomputeControl.fail = true;
        else vi.spyOn(observationReducer, "computeSnapshot").mockResolvedValue(null as never);
      } else if (mode === "throws") {
        vi.spyOn(observationReducer, "computeSnapshot").mockRejectedValue(
          new Error("forced computeSnapshot failure")
        );
      } else {
        vi.spyOn(observationReducer, "computeSnapshot").mockResolvedValue(null as never);
      }
      const cap = capture();
      try {
        await store(`emit-fail-${mode}-${randomUUID()}`);
      } finally {
        cap.stop();
      }
      expect(cap.events.filter((e) => e.event_type === "entity.created")).toHaveLength(1);
      expect(cap.events.filter((e) => e.event_type === "observation.created")).toHaveLength(1);
      expect(cap.events.filter((e) => e.event_type === "entity.updated")).toHaveLength(0);
    }
  );

  it("emits entity.updated (not created) for an existing entity when the snapshot computation fails", async () => {
    const title = `emit-existing-${randomUUID()}`;
    await store(title);
    if (surface === "rest") recomputeControl.fail = true;
    vi.spyOn(observationReducer, "computeSnapshot").mockRejectedValue(new Error("forced"));
    const cap = capture();
    try {
      // A different payload, so the write is not deduplicated against the first.
      await store(title, { description: "second write" });
    } finally {
      cap.stop();
    }
    expect(cap.events.filter((e) => e.event_type === "entity.created")).toHaveLength(0);
    expect(cap.events.filter((e) => e.event_type === "entity.updated")).toHaveLength(1);
  });
});

describe("interpretation event emission", () => {
  const CONFIG: InterpretationConfig = {
    provider: "test",
    model_id: "test-model",
    temperature: 0.0,
    prompt_hash: "test_hash_entity_created_emission",
    code_version: "1.0.0",
  };
  let sourceId: string;

  beforeEach(async () => {
    await cleanupTestEntityType(INTERP_TYPE, TEST_USER);
    await db.from("schema_registry").delete().eq("entity_type", INTERP_TYPE);
    const { error: schemaErr } = await db.from("schema_registry").insert({
      entity_type: INTERP_TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: { label: { type: "string" }, note: { type: "string" } },
        canonical_name_fields: ["label"],
      },
      reducer_config: {
        merge_policies: {
          label: { strategy: "last_write", tie_breaker: "observed_at" },
          note: { strategy: "last_write", tie_breaker: "observed_at" },
        },
      },
      active: true,
      scope: "global",
      user_id: null,
    });
    if (schemaErr) throw new Error(schemaErr.message);
    const { data, error } = await db
      .from("sources")
      .insert({
        user_id: TEST_USER,
        original_filename: "emit.json",
        mime_type: "application/json",
        file_size: 42,
        content_hash: `hash_emit_${randomUUID()}`,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message);
    sourceId = data.id;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestEntityType(INTERP_TYPE, TEST_USER);
    await db.from("schema_registry").delete().eq("entity_type", INTERP_TYPE);
    await db.from("sources").delete().eq("id", sourceId);
  });

  const run = () =>
    runInterpretation({
      userId: TEST_USER,
      sourceId,
      extractedData: [{ entity_type: INTERP_TYPE, label: `interp-${randomUUID()}` }],
      config: CONFIG,
    });

  it("emits exactly one entity.created on a normal run", async () => {
    const cap = capture();
    try {
      await run();
    } finally {
      cap.stop();
    }
    expect(cap.events.filter((e) => e.event_type === "entity.created")).toHaveLength(1);
    expect(cap.events.filter((e) => e.event_type === "observation.created")).toHaveLength(1);
  });

  it.each(["throws", "returns null"] as const)(
    "still emits entity.created for a new entity when the snapshot computation %s",
    async (mode) => {
      const spy = vi.spyOn(observationReducer, "computeSnapshot");
      if (mode === "throws") spy.mockRejectedValue(new Error("forced"));
      else spy.mockResolvedValue(null as never);
      const cap = capture();
      try {
        await run();
      } finally {
        cap.stop();
      }
      expect(cap.events.filter((e) => e.event_type === "entity.created")).toHaveLength(1);
      expect(cap.events.filter((e) => e.event_type === "observation.created")).toHaveLength(1);
    }
  );

  it("emits exactly one entity.created when two rows of one run resolve to the same new entity", async () => {
    const label = `interp-shared-${randomUUID()}`;
    const cap = capture();
    try {
      await runInterpretation({
        userId: TEST_USER,
        sourceId,
        extractedData: [
          { entity_type: INTERP_TYPE, label, note: "first" },
          { entity_type: INTERP_TYPE, label, note: "second" },
        ],
        config: CONFIG,
      });
    } finally {
      cap.stop();
    }
    expect(cap.events.filter((e) => e.event_type === "entity.created")).toHaveLength(1);
    expect(cap.events.filter((e) => e.event_type === "entity.updated")).toHaveLength(1);
    expect(cap.events.filter((e) => e.event_type === "observation.created")).toHaveLength(2);
    expect(new Set(cap.events.map((e) => e.entity_id)).size).toBe(1);
  });
});

describe("REST store of a merged-away id", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const storeRest = (entity: Record<string, unknown>) =>
    storeStructuredForApi({
      userId: TEST_USER,
      entities: [entity],
      idempotencyKey: `emit-${randomUUID()}`,
      sourcePriority: 100,
    }) as Promise<{ entities: Array<{ entity_id: string }> }>;

  async function mergedAwayPair() {
    const from = (await storeRest({ entity_type: "task", title: `merge-from-${randomUUID()}` }))
      .entities[0].entity_id;
    const to = (await storeRest({ entity_type: "task", title: `merge-to-${randomUUID()}` }))
      .entities[0].entity_id;
    await mergeEntities({
      fromEntityId: from,
      toEntityId: to,
      userId: TEST_USER,
      mergedBy: "test",
    });
    return { from, to };
  }

  it("emits no entity event for a write targeting a merged-away id", async () => {
    const { from } = await mergedAwayPair();
    const cap = capture();
    try {
      await storeRest({ entity_type: "task", title: "ignored", target_id: from, description: "x" });
    } finally {
      cap.stop();
    }
    expect(cap.events.filter((e) => e.event_type.startsWith("entity."))).toHaveLength(0);
  });
});
