import { describe, expect, it, vi } from "vitest";
import { NeotomaMemory } from "../../packages/agent/src/memory.js";
import { withMemory } from "../../packages/agent/src/with_memory.js";
import type {
  NeotomaTransport,
  StoreInput,
  StoreResult,
} from "../../packages/client/src/types.js";

function makeStubTransport(
  overrides: Partial<NeotomaTransport> = {}
): NeotomaTransport {
  const base: NeotomaTransport = {
    store: vi.fn(async () => ({ structured: { entities: [] } } as StoreResult)),
    retrieveEntities: vi.fn(async () => []),
    retrieveEntityByIdentifier: vi.fn(async () => null),
    retrieveEntitySnapshot: vi.fn(async () => ({})),
    listObservations: vi.fn(async () => []),
    listTimelineEvents: vi.fn(async () => []),
    retrieveRelatedEntities: vi.fn(async () => []),
    createRelationship: vi.fn(async () => ({})),
    correct: vi.fn(async () => ({})),
    listEntityTypes: vi.fn(async () => []),
    getEntityTypeCounts: vi.fn(async () => ({})),
    executeTool: vi.fn(async () => ({})),
    dispose: vi.fn(async () => {}),
  };
  return { ...base, ...overrides };
}

function makeStoreResult(entityIds: string[]): StoreResult {
  return {
    structured: {
      entities: entityIds.map((entity_id, i) => ({
        entity_id,
        entity_type: i === 0 ? "conversation" : "conversation_message",
      })),
    },
  } as StoreResult;
}

describe("NeotomaMemory", () => {
  it("openTurn runs bounded retrieval and stores user message PART_OF conversation", async () => {
    const captured: StoreInput[] = [];
    const transport = makeStubTransport({
      store: vi.fn(async (input: StoreInput) => {
        captured.push(input);
        return makeStoreResult(["conv-1", "msg-user-1"]);
      }),
      retrieveEntityByIdentifier: vi.fn(async () => ({ entity_id: "ent-acme" })),
    });

    const memory = new NeotomaMemory({
      transport,
      conversationId: "conv-1",
      platform: "test",
    });

    const result = await memory.openTurn({
      turnId: "t1",
      userMessage: 'Tell me about "Acme Corp"',
    });

    expect(result.conversationEntityId).toBe("conv-1");
    expect(result.userMessageEntityId).toBe("msg-user-1");
    expect(result.retrievedEntityIds).toContain("ent-acme");

    expect(transport.retrieveEntityByIdentifier).toHaveBeenCalled();

    expect(captured).toHaveLength(1);
    const stored = captured[0];
    expect(stored.entities?.[0].entity_type).toBe("conversation");
    expect(stored.entities?.[1].entity_type).toBe("conversation_message");
    expect(stored.entities?.[1].role).toBe("user");
    expect(stored.relationships?.[0].relationship_type).toBe("PART_OF");
    expect(stored.idempotency_key).toContain("conv-1");
    expect(stored.idempotency_key).toContain("t1");
    expect(stored.idempotency_key).toContain("user");
  });

  it("openTurn wires REFERS_TO from user message to retrieved entities", async () => {
    const refersToCalls: Array<{ source: string; target: string }> = [];
    const transport = makeStubTransport({
      store: vi.fn(async () => makeStoreResult(["conv-1", "msg-user-1"])),
      retrieveEntityByIdentifier: vi.fn(async () => ({ entity_id: "ent-x" })),
      createRelationship: vi.fn(async (input: { source_entity_id: string; target_entity_id: string }) => {
        refersToCalls.push({ source: input.source_entity_id, target: input.target_entity_id });
        return {};
      }),
    });

    const memory = new NeotomaMemory({ transport, conversationId: "conv-1" });
    await memory.openTurn({ turnId: "t1", userMessage: 'mention "Foo"' });

    expect(refersToCalls).toContainEqual({ source: "msg-user-1", target: "ent-x" });
  });

  it("openTurn proceeds with empty retrieved set when retrieval fails", async () => {
    const transport = makeStubTransport({
      store: vi.fn(async () => makeStoreResult(["conv-1", "msg-user-1"])),
      retrieveEntityByIdentifier: vi.fn(async () => {
        throw new Error("network down");
      }),
    });

    const memory = new NeotomaMemory({ transport, conversationId: "conv-1" });
    const result = await memory.openTurn({
      turnId: "t1",
      userMessage: 'mention "Foo"',
    });

    expect(result.retrieved).toEqual([]);
    expect(result.retrievedEntityIds).toEqual([]);
    expect(result.userMessageEntityId).toBe("msg-user-1");
  });

  it("closeTurn stores assistant message and wires REFERS_TO to refersTo set", async () => {
    const refersToCalls: Array<{ source: string; target: string; type: string }> = [];
    const transport = makeStubTransport({
      store: vi.fn(async () => makeStoreResult(["conv-1", "msg-asst-1"])),
      createRelationship: vi.fn(async (input: { source_entity_id: string; target_entity_id: string; relationship_type: string }) => {
        refersToCalls.push({
          source: input.source_entity_id,
          target: input.target_entity_id,
          type: input.relationship_type,
        });
        return {};
      }),
    });

    const memory = new NeotomaMemory({ transport, conversationId: "conv-1" });
    const result = await memory.closeTurn({
      turnId: "t1",
      assistantMessage: "Acme Corp is a fictional company.",
      refersTo: ["ent-acme"],
    });

    expect(result.assistantMessageEntityId).toBe("msg-asst-1");
    expect(refersToCalls).toContainEqual({
      source: "msg-asst-1",
      target: "ent-acme",
      type: "REFERS_TO",
    });
  });

  it("uses deterministic idempotency key per turn role", async () => {
    const keys: string[] = [];
    const transport = makeStubTransport({
      store: vi.fn(async (input: StoreInput) => {
        if (input.idempotency_key) keys.push(input.idempotency_key);
        return makeStoreResult(["conv-1", "msg-x"]);
      }),
    });

    const memory = new NeotomaMemory({ transport, conversationId: "conv-1" });
    await memory.openTurn({ turnId: "t42", userMessage: "hi" });
    await memory.closeTurn({ turnId: "t42", assistantMessage: "hello" });

    expect(keys[0]).toContain("user");
    expect(keys[1]).toContain("assistant");
    expect(keys[0]).not.toBe(keys[1]);
  });
});

describe("withMemory", () => {
  it("wraps an agent function with bounded retrieval, open, and close", async () => {
    const transport = makeStubTransport({
      store: vi.fn(async () => makeStoreResult(["conv-w", "msg-w"])),
      retrieveEntityByIdentifier: vi.fn(async () => ({ entity_id: "ent-w" })),
    });

    const wrapped = withMemory(
      async (userMessage, ctx) => {
        expect(ctx.conversationId).toBe("conv-w");
        expect(ctx.retrievedEntityIds).toContain("ent-w");
        expect(userMessage).toContain("Widget");
        return "Acknowledged.";
      },
      {
        transport,
        conversationId: "conv-w",
        nextTurnId: () => "t-fixed",
      }
    );

    const result = await wrapped('Tell me about "Widget"');
    expect(result.assistantMessage).toBe("Acknowledged.");
    expect(result.ctx.turnId).toBe("t-fixed");
    expect(transport.store).toHaveBeenCalledTimes(2);
  });

  it("exposes the underlying NeotomaMemory for ad-hoc ops", async () => {
    const transport = makeStubTransport();
    const wrapped = withMemory(async () => "ok", {
      transport,
      conversationId: "c",
    });
    expect(wrapped.memory).toBeInstanceOf(NeotomaMemory);
  });
});
