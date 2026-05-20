import { describe, expect, it } from "vitest";
import {
  entityDisplayHeadline,
  entityIdentityKeyForDisplay,
  isLikelyMachineCanonicalName,
} from "./humanize";

describe("isLikelyMachineCanonicalName", () => {
  it("treats conversation:uuid identity keys as machine", () => {
    expect(
      isLikelyMachineCanonicalName(
        "conversation:254868b9-73d0-8329-b395-c48b6b8a8fef",
      ),
    ).toBe(true);
  });

  it("treats human company names as not machine", () => {
    expect(isLikelyMachineCanonicalName("Acme Corporation")).toBe(false);
  });
});

describe("entityDisplayHeadline", () => {
  it("prefers snapshot title over conversation identity key", () => {
    expect(
      entityDisplayHeadline({
        canonical_name: "conversation:254868b9-73d0-8329-b395-c48b6b8a8fef",
        entity_type: "conversation",
        snapshot: {
          title: "Fitness — Track lifting progression (ChatGPT Fitness GPT)",
          conversation_id: "254868b9-73d0-8329-b395-c48b6b8a8fef",
        },
      }),
    ).toBe("Fitness — Track lifting progression (ChatGPT Fitness GPT)");
  });
});

describe("entityIdentityKeyForDisplay", () => {
  it("hides identity key when conversation_id row covers it", () => {
    expect(
      entityIdentityKeyForDisplay({
        canonical_name: "conversation:254868b9-73d0-8329-b395-c48b6b8a8fef",
        entity_type: "conversation",
        page_heading: "Fitness — Track lifting progression",
        snapshot: { conversation_id: "254868b9-73d0-8329-b395-c48b6b8a8fef" },
      }),
    ).toBeNull();
  });

  it("shows identity key when not redundant with snapshot id field", () => {
    expect(
      entityIdentityKeyForDisplay({
        canonical_name: "conversation:254868b9-73d0-8329-b395-c48b6b8a8fef",
        entity_type: "conversation",
        page_heading: "My chat",
        snapshot: {},
      }),
    ).toBe("conversation:254868b9-73d0-8329-b395-c48b6b8a8fef");
  });
});
