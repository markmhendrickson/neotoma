import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Operations, StoreInput, StoreResult } from "../../src/core/operations.js";

const mockGetSubmissionConfigForTargetType = vi.fn();
const mockAssertGuestWriteAllowed = vi.fn();
const mockMintGuestReadBackToken = vi.fn();

vi.mock("../../src/services/entity_submission/submission_config_loader.js", () => ({
  getSubmissionConfigForTargetType: (...args: unknown[]) => mockGetSubmissionConfigForTargetType(...args),
}));

vi.mock("../../src/services/access_policy.js", () => ({
  assertGuestWriteAllowed: (...args: unknown[]) => mockAssertGuestWriteAllowed(...args),
}));

vi.mock("../../src/services/submitted_thread/submitted_thread.js", () => ({
  appendMessageToConversation: vi.fn(),
  bootstrapConversationThreadForRoot: vi.fn(),
  mintGuestReadBackToken: (...args: unknown[]) => mockMintGuestReadBackToken(...args),
  resolveConversationForRoot: vi.fn(),
  storeRootWithThread: (ops: Operations, input: StoreInput, options?: { runStore?: (input: StoreInput) => Promise<StoreResult> }) =>
    options?.runStore ? options.runStore(input) : ops.store(input),
}));

import { submitEntity } from "../../src/services/entity_submission/submission_service.js";

const activeConfig = {
  entity_id: "submission-config-1",
  config_key: "incident-default",
  target_entity_type: "incident",
  access_policy: "submit_only" as const,
  active: true,
  enable_conversation_threading: true,
  enable_guest_read_back: true,
  external_mirrors: [],
};

function createOps() {
  const store = vi.fn(async (input: StoreInput): Promise<StoreResult> => ({
    structured: {
      entities: (input.entities ?? []).map((entity, index) => ({
        entity_id: ["incident-1", "conversation-1", "message-1"][index] ?? `${entity.entity_type}-${index}`,
        entity_type: entity.entity_type,
      })),
    },
  }));

  return {
    store,
    ops: {
      store,
      storeStructured: store,
      storeUnstructured: store,
      retrieveEntities: vi.fn(),
      retrieveEntityByIdentifier: vi.fn(),
      retrieveEntitySnapshot: vi.fn(),
      listObservations: vi.fn(),
      listTimelineEvents: vi.fn(),
      retrieveRelatedEntities: vi.fn(),
      createRelationship: vi.fn(),
      createRelationships: vi.fn(),
      correct: vi.fn(),
      listEntityTypes: vi.fn(),
      getEntityTypeCounts: vi.fn(),
      executeTool: vi.fn(),
      dispose: vi.fn(),
    } as unknown as Operations,
  };
}

describe("submitEntity validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSubmissionConfigForTargetType.mockResolvedValue(activeConfig);
    mockAssertGuestWriteAllowed.mockResolvedValue(undefined);
    mockMintGuestReadBackToken.mockResolvedValue("guest-token-1");
  });

  it.todo("rejects missing or non-object fields before storing a submission");

  it("looks up the active submission_config for the submitted entity type", async () => {
    const { ops } = createOps();

    await submitEntity(ops, {
      userId: "user-1",
      entity_type: "incident",
      fields: { title: "Broken sync", body: "Sync failed" },
    });

    expect(mockGetSubmissionConfigForTargetType).toHaveBeenCalledWith("incident");
  });

  it("throws before storing when no active submission_config exists", async () => {
    const { ops, store } = createOps();
    mockGetSubmissionConfigForTargetType.mockResolvedValue(null);

    await expect(
      submitEntity(ops, {
        userId: "user-1",
        entity_type: "incident",
        fields: { title: "Broken sync" },
      }),
    ).rejects.toThrow('No active submission_config for entity_type "incident"');

    expect(store).not.toHaveBeenCalled();
  });

  it("propagates access policy validation errors without storing", async () => {
    const { ops, store } = createOps();
    mockAssertGuestWriteAllowed.mockRejectedValue(new Error("access_policy_denied"));

    await expect(
      submitEntity(ops, {
        userId: "user-1",
        entity_type: "incident",
        fields: { title: "Broken sync" },
      }),
    ).rejects.toThrow("access_policy_denied");

    expect(mockAssertGuestWriteAllowed).toHaveBeenCalledWith(
      ["incident", "conversation", "conversation_message"],
      {},
    );
    expect(store).not.toHaveBeenCalled();
  });

  it("stores the root, thread, and guest read-back token when enabled by config", async () => {
    const { ops, store } = createOps();

    const result = await submitEntity(ops, {
      userId: "user-1",
      entity_type: "incident",
      fields: { title: "Broken sync", body: "Sync failed" },
      initial_message: "Please investigate.",
    });

    expect(store).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotency_key: expect.stringMatching(/^entity-submit-incident-[a-f0-9]{40}$/),
        relationships: [
          { relationship_type: "REFERS_TO", source_index: 0, target_index: 1 },
          { relationship_type: "PART_OF", source_index: 2, target_index: 1 },
        ],
      }),
    );
    const storeInput = store.mock.calls[0]?.[0] as StoreInput;
    expect(storeInput.entities).toMatchObject([
      { entity_type: "incident", title: "Broken sync", body: "Sync failed" },
      { entity_type: "conversation", title: "Broken sync", thread_kind: "human_agent" },
      { entity_type: "conversation_message", content: "Please investigate.", sender_kind: "user" },
    ]);
    expect(mockMintGuestReadBackToken).toHaveBeenCalledWith({
      entityIds: ["incident-1", "conversation-1"],
      userId: "user-1",
      thumbprint: undefined,
    });
    expect(result).toEqual({
      entity_id: "incident-1",
      conversation_id: "conversation-1",
      guest_access_token: "guest-token-1",
    });
  });
});
