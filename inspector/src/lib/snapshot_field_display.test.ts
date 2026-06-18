import { describe, expect, it } from "vitest";
import {
  filterSnapshotKeysForDisplay,
  snapshotFieldDisplayLabel,
} from "./snapshot_display";

describe("filterSnapshotKeysForDisplay", () => {
  it("hides snapshot canonical_name when conversation has title", () => {
    expect(
      filterSnapshotKeysForDisplay(
        ["title", "canonical_name", "conversation_id"],
        {
          title: "Fitness chat",
          canonical_name: "ChatGPT Fitness GPT — Metropolitan",
          conversation_id: "254868b9-73d0-8329-b395-c48b6b8a8fef",
        },
        "conversation",
        false,
      ),
    ).toEqual(["title", "conversation_id"]);
  });

  it("keeps canonical_name in developer view", () => {
    expect(
      filterSnapshotKeysForDisplay(
        ["title", "canonical_name"],
        { title: "Fitness chat", canonical_name: "Legacy label" },
        "conversation",
        true,
      ),
    ).toEqual(["title", "canonical_name"]);
  });
});

describe("snapshotFieldDisplayLabel", () => {
  it("labels conversation_id as Conversation ID", () => {
    expect(snapshotFieldDisplayLabel("conversation_id", "conversation", false)).toBe(
      "Conversation ID",
    );
  });
});
