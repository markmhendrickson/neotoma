import { describe, expect, it, vi } from "vitest";
import {
  retrieveOrStore,
  snapshotOnUpdate,
  storeChatTurn,
} from "../../packages/client/src/helpers.js";
import type { NeotomaTransport, StoreInput, StoreResult } from "../../packages/client/src/types.js";

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

describe("storeChatTurn", () => {
  it("persists user + assistant messages with PART_OF relationships to the conversation", async () => {
    let captured: StoreInput | undefined;
    const transport = makeStubTransport({
      store: vi.fn(async (input: StoreInput) => {
        captured = input;
        return {
          structured: {
            entities: [
              { entity_id: "conv-1", entity_type: "conversation" },
              { entity_id: "msg-user-1", entity_type: "conversation_message" },
              { entity_id: "msg-assistant-1", entity_type: "conversation_message" },
            ],
          },
        } as StoreResult;
      }),
    });

    const result = await storeChatTurn(transport, {
      conversationId: "abc",
      turnId: "1",
      conversationTitle: "Example chat",
      platform: "cursor",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ],
    });

    expect(result.conversationEntityId).toBe("conv-1");
    expect(result.userMessageEntityId).toBe("msg-user-1");
    expect(result.assistantMessageEntityId).toBe("msg-assistant-1");
    expect(captured).toBeDefined();
    expect(captured!.entities).toHaveLength(3);
    expect(captured!.entities![0].entity_type).toBe("conversation");
    expect(captured!.entities![1]).toMatchObject({
      entity_type: "conversation_message",
      role: "user",
      sender_kind: "user",
      content: "hello",
      turn_key: "abc:1",
    });
    expect(captured!.entities![2]).toMatchObject({
      entity_type: "conversation_message",
      role: "assistant",
      sender_kind: "assistant",
      turn_key: "abc:1:assistant",
    });
    expect(captured!.relationships).toEqual([
      { relationship_type: "PART_OF", source_index: 1, target_index: 0 },
      { relationship_type: "PART_OF", source_index: 2, target_index: 0 },
    ]);
    expect(captured!.idempotency_key).toBe("conversation-abc-1-turn");
  });

  it("passes agent-to-agent sender metadata through to the stored message", async () => {
    let captured: StoreInput | undefined;
    const transport = makeStubTransport({
      store: vi.fn(async (input: StoreInput) => {
        captured = input;
        return {
          structured: {
            entities: [
              { entity_id: "conv-2", entity_type: "conversation" },
              { entity_id: "msg-a2a-1", entity_type: "conversation_message" },
            ],
          },
        } as StoreResult;
      }),
    });

    await storeChatTurn(transport, {
      conversationId: "a2a-thread-1",
      turnId: "7",
      messages: [
        {
          role: "assistant",
          content: "handing off to downstream agent",
          senderKind: "agent",
          senderAgentId: "agent-orchestrator",
          recipientAgentId: "agent-summarizer",
        },
      ],
    });

    expect(captured).toBeDefined();
    expect(captured!.entities![1]).toMatchObject({
      entity_type: "conversation_message",
      role: "assistant",
      sender_kind: "agent",
      sender_agent_id: "agent-orchestrator",
      recipient_agent_id: "agent-summarizer",
    });
  });

  it("allows storing only a user message when the assistant reply is not yet known", async () => {
    const transport = makeStubTransport({
      store: vi.fn(async () => ({
        structured: {
          entities: [
            { entity_id: "conv-1", entity_type: "conversation" },
            { entity_id: "msg-user-1", entity_type: "conversation_message" },
          ],
        },
      } as StoreResult)),
    });

    const result = await storeChatTurn(transport, {
      conversationId: "abc",
      turnId: "1",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.userMessageEntityId).toBe("msg-user-1");
    expect(result.assistantMessageEntityId).toBeUndefined();
  });
});

describe("retrieveOrStore", () => {
  it("returns existing entity_id without storing when identifier already exists", async () => {
    const store = vi.fn();
    const transport = makeStubTransport({
      retrieveEntityByIdentifier: vi.fn(async () => ({ entity_id: "existing-1" })),
      store,
    });

    const result = await retrieveOrStore(transport, {
      identifier: "mark@example.com",
      entityType: "contact",
      create: { email: "mark@example.com", name: "Mark" },
    });

    expect(result.entityId).toBe("existing-1");
    expect(result.created).toBe(false);
    expect(store).not.toHaveBeenCalled();
  });

  it("stores when no existing entity is found and returns the new entity_id", async () => {
    const transport = makeStubTransport({
      retrieveEntityByIdentifier: vi.fn(async () => null),
      store: vi.fn(async () => ({
        structured: { entities: [{ entity_id: "new-1", entity_type: "contact" }] },
      } as StoreResult)),
    });

    const result = await retrieveOrStore(transport, {
      identifier: "new@example.com",
      entityType: "contact",
      create: { email: "new@example.com" },
    });

    expect(result.entityId).toBe("new-1");
    expect(result.created).toBe(true);
  });
});

describe("snapshotOnUpdate", () => {
  it("retrieves the snapshot before applying the correction", async () => {
    const calls: string[] = [];
    const transport = makeStubTransport({
      retrieveEntitySnapshot: vi.fn(async () => {
        calls.push("snapshot");
        return { entity_id: "ent-1", fields: { status: "old" } };
      }),
      correct: vi.fn(async () => {
        calls.push("correct");
        return { ok: true };
      }),
    });

    const result = await snapshotOnUpdate(transport, {
      entityId: "ent-1",
      corrections: { status: "new" },
    });

    expect(result.applied).toBe(true);
    expect(calls).toEqual(["snapshot", "correct"]);
  });

  it("skips the correction when the review callback returns false", async () => {
    const correct = vi.fn();
    const transport = makeStubTransport({
      retrieveEntitySnapshot: vi.fn(async () => ({ status: "already-set" })),
      correct,
    });

    const result = await snapshotOnUpdate(transport, {
      entityId: "ent-1",
      corrections: { status: "already-set" },
      review: (snapshot) =>
        (snapshot as { status?: string }).status === "already-set" ? false : true,
    });

    expect(result.applied).toBe(false);
    expect(correct).not.toHaveBeenCalled();
  });

  it("allows the review callback to override the corrections payload", async () => {
    let capturedCorrections: unknown;
    const transport = makeStubTransport({
      retrieveEntitySnapshot: vi.fn(async () => ({ status: "stale" })),
      correct: vi.fn(async (input: { entity_id: string; corrections: Record<string, unknown> }) => {
        capturedCorrections = input.corrections;
        return {};
      }),
    });

    await snapshotOnUpdate(transport, {
      entityId: "ent-1",
      corrections: { status: "new" },
      review: () => ({ status: "reconciled" }),
    });

    expect(capturedCorrections).toEqual({ status: "reconciled" });
  });
});
