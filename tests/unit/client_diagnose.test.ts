import { describe, expect, it, vi } from "vitest";
import {
  applyRepairs,
  diagnoseTurn,
  hasErrors,
  type TurnObservation,
} from "../../packages/client/src/diagnose.js";
import type { NeotomaTransport, StoreInput, StoreResult } from "../../packages/client/src/types.js";

function makeStubTransport(): NeotomaTransport {
  return {
    store: vi.fn(async (_input: StoreInput) => ({ structured: { entities: [] } } as StoreResult)),
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
}

describe("diagnoseTurn", () => {
  it("flags missing user message as error with a repair suggestion", () => {
    const obs: TurnObservation = {
      conversationId: "c1",
      turnId: "t1",
      userMessage: { content: "hi", stored: false },
    };
    const d = diagnoseTurn(obs);
    const userIssue = d.find((x) => x.id === "user-message-missing");
    expect(userIssue?.severity).toBe("error");
    expect(userIssue?.suggestedRepair?.type).toBe("store_missing_user_message");
  });

  it("does not require an assistant store when no reply was produced", () => {
    const obs: TurnObservation = {
      conversationId: "c1",
      turnId: "t1",
      userMessage: { content: "hi", stored: true },
      assistantMessage: { content: "", stored: false },
      assistantReplyProduced: false,
    };
    const d = diagnoseTurn(obs);
    expect(d.find((x) => x.id === "assistant-message-missing")).toBeUndefined();
  });

  it("flags missing assistant store when a reply was produced", () => {
    const obs: TurnObservation = {
      conversationId: "c1",
      turnId: "t1",
      userMessage: { content: "hi", stored: true },
      assistantMessage: { content: "there", stored: false },
      assistantReplyProduced: true,
    };
    const d = diagnoseTurn(obs);
    const issue = d.find((x) => x.id === "assistant-message-missing");
    expect(issue?.severity).toBe("error");
  });

  it("flags parquet residue as an error", () => {
    const obs: TurnObservation = {
      conversationId: "c1",
      turnId: "t1",
      parquetResidueReferences: [".cursor/rules/workflow_specifics.mdc"],
    };
    const d = diagnoseTurn(obs);
    const issue = d.find((x) => x.id === "parquet-residue");
    expect(issue?.severity).toBe("error");
  });

  it("flags store-first violations as warnings", () => {
    const obs: TurnObservation = {
      conversationId: "c1",
      turnId: "t1",
      toolsInvoked: ["gmail", "read_file"],
      storeFirstSatisfied: false,
    };
    const d = diagnoseTurn(obs);
    expect(d.find((x) => x.id === "store-first-violation")?.severity).toBe("warn");
  });

  it("hasErrors is false when everything is ok", () => {
    const obs: TurnObservation = {
      conversationId: "c1",
      turnId: "t1",
      userMessage: { content: "hi", stored: true },
      assistantMessage: { content: "there", stored: true },
      assistantReplyProduced: true,
    };
    const d = diagnoseTurn(obs);
    expect(hasErrors(d)).toBe(false);
  });
});

describe("applyRepairs", () => {
  it("issues repair stores for each non-ok diagnosis and a neotoma_repair summary", async () => {
    const transport = makeStubTransport();
    const calls: StoreInput[] = [];
    (transport.store as unknown as (input: StoreInput) => Promise<StoreResult>) = async (input) => {
      calls.push(input);
      return { structured: { entities: [] } } as StoreResult;
    };

    const obs: TurnObservation = {
      conversationId: "c1",
      turnId: "t1",
      userMessage: { content: "hi", stored: false },
      assistantMessage: { content: "there", stored: false },
      assistantReplyProduced: true,
    };
    const diagnoses = diagnoseTurn(obs);
    const outcomes = await applyRepairs(transport, diagnoses, "c1", "t1");

    expect(outcomes.length).toBeGreaterThanOrEqual(2);
    expect(outcomes.every((o) => o.applied)).toBe(true);

    const repairSummary = calls.find((c) =>
      (c.entities ?? []).some((e) => e.entity_type === "neotoma_repair")
    );
    expect(repairSummary).toBeDefined();
  });
});
