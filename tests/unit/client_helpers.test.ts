import { describe, expect, it, vi } from "vitest";
import { MultiFieldCorrectionError } from "../../packages/client/src/correction.js";
import {
  extractStoredEntities,
  recordConversationTurn,
  retrieveOrStore,
  snapshotOnUpdate,
  storeChatTurn,
} from "../../packages/client/src/helpers.js";
import { HttpTransport } from "../../packages/client/src/http.js";
import { LocalTransport, type LocalOperations } from "../../packages/client/src/local.js";
import type { NeotomaTransport, StoreInput, StoreResult } from "../../packages/client/src/types.js";

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("extractStoredEntities", () => {
  it("reads entities from the top-level shape (real transport, #316)", () => {
    const result = {
      success: true,
      entities: [{ entity_id: "ent-1", entity_type: "contact" }],
    } as unknown as StoreResult;
    expect(extractStoredEntities(result)).toEqual([{ entity_id: "ent-1", entity_type: "contact" }]);
  });

  it("falls back to the legacy nested `structured.entities` shape", () => {
    const result = {
      structured: { entities: [{ entity_id: "legacy-1", entity_type: "contact" }] },
    } as StoreResult;
    expect(extractStoredEntities(result)).toEqual([
      { entity_id: "legacy-1", entity_type: "contact" },
    ]);
  });

  it("prefers the top-level shape when both are present", () => {
    const result = {
      entities: [{ entity_id: "top-1", entity_type: "contact" }],
      structured: { entities: [{ entity_id: "nested-1", entity_type: "contact" }] },
    } as unknown as StoreResult;
    expect(extractStoredEntities(result)[0]?.entity_id).toBe("top-1");
  });

  it("returns an empty array for a missing or empty response", () => {
    expect(extractStoredEntities(undefined)).toEqual([]);
    expect(extractStoredEntities({} as StoreResult)).toEqual([]);
  });
});

function makeStubTransport(overrides: Partial<NeotomaTransport> = {}): NeotomaTransport {
  const base: NeotomaTransport = {
    store: vi.fn(async () => ({ structured: { entities: [] } }) as StoreResult),
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
  it("extracts entity_ids from the top-level `entities` store response shape (real transport, #316)", async () => {
    // The /store endpoint (StoreStructuredResponse in openapi.yaml) and both
    // HttpTransport and LocalTransport return entities at the TOP level:
    // { success, replayed, entities: [...] }. There is no `structured`
    // wrapper on the live response. Helpers must read from result.entities.
    const transport = makeStubTransport({
      store: vi.fn(
        async () =>
          ({
            success: true,
            entities: [
              { entity_id: "conv-1", entity_type: "conversation" },
              { entity_id: "msg-user-1", entity_type: "conversation_message" },
              { entity_id: "msg-assistant-1", entity_type: "conversation_message" },
            ],
          }) as unknown as StoreResult
      ),
    });

    const result = await storeChatTurn(transport, {
      conversationId: "abc",
      turnId: "1",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ],
    });

    expect(result.conversationEntityId).toBe("conv-1");
    expect(result.userMessageEntityId).toBe("msg-user-1");
    expect(result.assistantMessageEntityId).toBe("msg-assistant-1");
  });

  it("falls back to the legacy nested `structured.entities` shape when present", async () => {
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
      store: vi.fn(
        async () =>
          ({
            structured: {
              entities: [
                { entity_id: "conv-1", entity_type: "conversation" },
                { entity_id: "msg-user-1", entity_type: "conversation_message" },
              ],
            },
          }) as StoreResult
      ),
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

  it("stores when no existing entity is found and returns the new entity_id (top-level shape, #316)", async () => {
    const transport = makeStubTransport({
      retrieveEntityByIdentifier: vi.fn(async () => null),
      store: vi.fn(
        async () =>
          ({
            success: true,
            entities: [{ entity_id: "new-1", entity_type: "contact" }],
          }) as unknown as StoreResult
      ),
    });

    const result = await retrieveOrStore(transport, {
      identifier: "new@example.com",
      entityType: "contact",
      create: { email: "new@example.com" },
    });

    expect(result.entityId).toBe("new-1");
    expect(result.created).toBe(true);
  });

  it("falls back to the legacy nested `structured.entities` shape when storing", async () => {
    const transport = makeStubTransport({
      retrieveEntityByIdentifier: vi.fn(async () => null),
      store: vi.fn(
        async () =>
          ({
            structured: { entities: [{ entity_id: "legacy-1", entity_type: "contact" }] },
          }) as StoreResult
      ),
    });

    const result = await retrieveOrStore(transport, {
      identifier: "legacy@example.com",
      entityType: "contact",
      create: { email: "legacy@example.com" },
    });

    expect(result.entityId).toBe("legacy-1");
    expect(result.created).toBe(true);
  });

  it("throws when the store response contains no entity_id in either shape", async () => {
    const transport = makeStubTransport({
      retrieveEntityByIdentifier: vi.fn(async () => null),
      store: vi.fn(async () => ({ success: true, entities: [] }) as unknown as StoreResult),
    });

    await expect(
      retrieveOrStore(transport, {
        identifier: "empty@example.com",
        entityType: "contact",
        create: { email: "empty@example.com" },
      })
    ).rejects.toThrow(/no entity_id/);
  });
});

describe("recordConversationTurn", () => {
  it("returns the entity_id from the top-level `entities` store response shape (#316)", async () => {
    const transport = makeStubTransport({
      store: vi.fn(
        async () =>
          ({
            success: true,
            entities: [{ entity_id: "turn-1", entity_type: "conversation_turn" }],
          }) as unknown as StoreResult
      ),
    });

    const result = await recordConversationTurn(transport, {
      sessionId: "sess-1",
      turnId: "1",
      harness: "cursor",
    });

    expect(result.entityId).toBe("turn-1");
  });

  it("falls back to the legacy nested `structured.entities` shape", async () => {
    const transport = makeStubTransport({
      store: vi.fn(
        async () =>
          ({
            structured: {
              entities: [{ entity_id: "turn-legacy-1", entity_type: "conversation_turn" }],
            },
          }) as StoreResult
      ),
    });

    const result = await recordConversationTurn(transport, {
      sessionId: "sess-2",
      turnId: "2",
    });

    expect(result.entityId).toBe("turn-legacy-1");
  });

  it("returns an empty result without storing when sessionId or turnId is missing", async () => {
    const store = vi.fn();
    const transport = makeStubTransport({ store });

    const result = await recordConversationTurn(transport, { sessionId: "", turnId: "1" });

    expect(result).toEqual({});
    expect(store).not.toHaveBeenCalled();
  });
});

describe("snapshotOnUpdate", () => {
  it("retrieves the snapshot, then sends one single-field correction with the caller's key", async () => {
    const calls: string[] = [];
    const correct = vi.fn(async (input: { field: string }) => {
      calls.push(`correct:${input.field}`);
      return { field: input.field, entity_version: "version-2" };
    });
    const transport = makeStubTransport({
      retrieveEntitySnapshot: vi.fn(async () => {
        calls.push("snapshot");
        return { entity_id: "ent-1", snapshot: { status: "old", unchanged: "same" } };
      }),
      correct,
    });

    const result = await snapshotOnUpdate(transport, {
      entityId: "ent-1",
      entityType: "sdk_fixture",
      corrections: { unchanged: "same", status: "new" },
      idempotencyKey: "helper-update",
      expectedVersion: "version-1",
      overwrite: true,
    });

    expect(result.applied).toBe(true);
    expect(calls).toEqual(["snapshot", "correct:status"]);
    expect(correct.mock.calls.map(([input]) => input)).toEqual([
      {
        entity_id: "ent-1",
        entity_type: "sdk_fixture",
        field: "status",
        value: "new",
        idempotency_key: "helper-update",
        expected_version: "version-1",
        overwrite: true,
      },
    ]);
    expect(result.correctionResult).toEqual({ field: "status", entity_version: "version-2" });
  });

  it("refuses two changed fields before any write, naming correct_transaction", async () => {
    const correct = vi.fn(async () => ({}));
    const transport = makeStubTransport({
      retrieveEntitySnapshot: vi.fn(async () => ({
        entity_id: "ent-1",
        snapshot: { status: "old", priority: "low" },
      })),
      correct,
    });

    let failure: unknown;
    try {
      await snapshotOnUpdate(transport, {
        entityId: "ent-1",
        entityType: "sdk_fixture",
        corrections: { status: "new", priority: "high" },
        idempotencyKey: "helper-multi",
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(MultiFieldCorrectionError);
    expect((failure as MultiFieldCorrectionError).fields).toEqual(["priority", "status"]);
    expect((failure as Error).message).toContain("correct_transaction");
    expect(correct).not.toHaveBeenCalled();
  });

  describe.each(["HTTP", "local"] as const)("%s transport", (transportKind) => {
    it.each([
      ["missing", undefined],
      ["empty", ""],
      ["whitespace-only", " \t "],
      ["non-string", 42],
    ])(
      "rejects a %s snapshotOnUpdate idempotency key before correction calls",
      async (_label, idempotencyKey) => {
        const correct = vi.fn(async () => ({ entity_version: "version-2" }));
        let transport: Pick<NeotomaTransport, "retrieveEntitySnapshot" | "correct">;
        let fetchImpl: ReturnType<typeof vi.fn> | undefined;

        if (transportKind === "HTTP") {
          fetchImpl = vi.fn(async (_url: unknown) =>
            okJson({ entity_id: "ent-1", entity_version: "version-1", snapshot: {} })
          );
          transport = new HttpTransport({ fetch: fetchImpl as typeof fetch });
        } else {
          transport = new LocalTransport({
            userId: "user-sdk-fixture",
            operations: {
              retrieveEntitySnapshot: vi.fn(async () => ({
                entity_id: "ent-1",
                entity_version: "version-1",
                snapshot: {},
              })),
              correct,
            } as unknown as LocalOperations,
          });
        }

        await expect(
          snapshotOnUpdate(transport, {
            entityId: "ent-1",
            entityType: "sdk_fixture",
            corrections: { status: "new" },
            idempotencyKey,
          } as unknown as Parameters<typeof snapshotOnUpdate>[1])
        ).rejects.toThrow("caller-supplied idempotency key");

        expect(correct).not.toHaveBeenCalled();
        if (fetchImpl) expect(fetchImpl).not.toHaveBeenCalled();
      }
    );
  });

  it("skips the correction when the review callback returns false", async () => {
    const correct = vi.fn();
    const transport = makeStubTransport({
      retrieveEntitySnapshot: vi.fn(async () => ({ status: "already-set" })),
      correct,
    });

    const result = await snapshotOnUpdate(transport, {
      entityId: "ent-1",
      entityType: "sdk_fixture",
      corrections: { status: "already-set" },
      idempotencyKey: "helper-skip",
      review: (snapshot) =>
        (snapshot as { status?: string }).status === "already-set" ? false : true,
    });

    expect(result.applied).toBe(false);
    expect(correct).not.toHaveBeenCalled();
  });

  it("allows the review callback to override the corrections payload", async () => {
    const correct = vi.fn(async () => ({}));
    const transport = makeStubTransport({
      retrieveEntitySnapshot: vi.fn(async () => ({ status: "stale" })),
      correct,
    });

    await snapshotOnUpdate(transport, {
      entityId: "ent-1",
      entityType: "sdk_fixture",
      corrections: { status: "new" },
      idempotencyKey: "helper-review",
      review: () => ({ status: "reconciled" }),
    });

    expect(correct).toHaveBeenCalledWith({
      entity_id: "ent-1",
      entity_type: "sdk_fixture",
      field: "status",
      value: "reconciled",
      idempotency_key: "helper-review",
    });
  });

  it("does not apply a correction when every reviewed field is unchanged", async () => {
    const correct = vi.fn();
    const transport = makeStubTransport({
      retrieveEntitySnapshot: vi.fn(async () => ({
        entity_id: "ent-1",
        snapshot: { status: "same" },
      })),
      correct,
    });

    const result = await snapshotOnUpdate(transport, {
      entityId: "ent-1",
      entityType: "sdk_fixture",
      corrections: { status: "same" },
      idempotencyKey: "helper-noop",
    });

    expect(result.applied).toBe(false);
    expect(result.correctionResult).toBeUndefined();
    expect(correct).not.toHaveBeenCalled();
  });
});
