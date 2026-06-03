import { describe, it, expect, vi, beforeEach } from "vitest";

import type { Operations } from "../../core/operations.js";

const { mockGetSubmissionConfigForTargetType } = vi.hoisted(() => ({
  mockGetSubmissionConfigForTargetType: vi.fn(),
}));

const { mockStoreRootWithThread } = vi.hoisted(() => ({
  mockStoreRootWithThread: vi.fn(),
}));

vi.mock("./submission_config_loader.js", () => ({
  getSubmissionConfigForTargetType: (...args: unknown[]) =>
    mockGetSubmissionConfigForTargetType(...args),
}));

vi.mock("../submitted_thread/submitted_thread.js", () => ({
  storeRootWithThread: (...args: unknown[]) => mockStoreRootWithThread(...args),
  appendMessageToConversation: vi.fn(),
  bootstrapConversationThreadForRoot: vi.fn(),
  mintGuestReadBackToken: vi.fn(),
  resolveConversationForRoot: vi.fn(),
}));

vi.mock("../access_policy.js", () => ({
  assertGuestWriteAllowed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../request_context.js", () => ({
  getCurrentExternalActor: () => null,
  runWithExternalActor: <T>(_actor: unknown, fn: () => T) => fn(),
}));

import { submitEntity } from "./submission_service.js";

const configWithoutThreading = {
  entity_id: "ent_cfg",
  config_key: "issue",
  target_entity_type: "issue",
  access_policy: "open" as const,
  active: true,
  enable_conversation_threading: false,
  enable_guest_read_back: false,
  external_mirrors: [],
};

const ops = {
  store: vi.fn(),
} as unknown as Operations;

describe("submitEntity write-integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSubmissionConfigForTargetType.mockResolvedValue(configWithoutThreading);
  });

  it("fails loud when the store produces no primary entity (empty entity_id)", async () => {
    // Reproduces the silent no-op: store returns no structured entities, so the
    // primary entity_id would be "". This must throw, not return success.
    mockStoreRootWithThread.mockResolvedValue({ structured: { entities: [] } });

    await expect(
      submitEntity(ops, {
        userId: "user-1",
        entity_type: "issue",
        fields: { title: "t", body: "b" },
      })
    ).rejects.toThrow(/write-integrity failure/);
  });

  it("returns the entity_id when the store produces a primary entity", async () => {
    mockStoreRootWithThread.mockResolvedValue({
      structured: { entities: [{ entity_id: "ent_real" }] },
    });

    const result = await submitEntity(ops, {
      userId: "user-1",
      entity_type: "issue",
      fields: { title: "t", body: "b" },
    });

    expect(result.entity_id).toBe("ent_real");
  });

  it("throws explicitly when no submission_config exists for the type", async () => {
    mockGetSubmissionConfigForTargetType.mockResolvedValue(null);

    await expect(
      submitEntity(ops, {
        userId: "user-1",
        entity_type: "issue",
        fields: { title: "t", body: "b" },
      })
    ).rejects.toThrow(/No active submission_config/);
  });
});

describe("submitEntity submission-path steering", () => {
  const configWithGithubMirror = {
    ...configWithoutThreading,
    external_mirrors: [{ provider: "github" as const, config: {} }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("steers issue submissions to submit_issue and never reaches the store", async () => {
    // A type whose submission_config declares a github mirror has a specialized
    // path (submit_issue). submitEntity must refuse with an actionable error
    // BEFORE attempting the generic store, so the caller gets redirected rather
    // than a confusing downstream failure.
    mockGetSubmissionConfigForTargetType.mockResolvedValue(configWithGithubMirror);

    await expect(
      submitEntity(ops, {
        userId: "user-1",
        entity_type: "issue",
        fields: { title: "t", body: "b" },
      })
    ).rejects.toThrow(/submission_path_mismatch.*submit_issue.*redirect_to: submit_issue/s);

    expect(mockStoreRootWithThread).not.toHaveBeenCalled();
  });

  it("does not steer types without a specialized mirror", async () => {
    mockGetSubmissionConfigForTargetType.mockResolvedValue(configWithoutThreading);
    mockStoreRootWithThread.mockResolvedValue({
      structured: { entities: [{ entity_id: "ent_generic" }] },
    });

    const result = await submitEntity(ops, {
      userId: "user-1",
      entity_type: "feedback",
      fields: { title: "t", body: "b" },
    });

    expect(result.entity_id).toBe("ent_generic");
    expect(mockStoreRootWithThread).toHaveBeenCalledTimes(1);
  });
});
