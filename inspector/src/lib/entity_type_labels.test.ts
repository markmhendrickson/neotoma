import { describe, expect, it } from "vitest";
import {
  entityTypeListPath,
  isEntityIdSegment,
  parseEntityTypeFromListPath,
  pluralizeEntityTypeLabel,
} from "./entity_type_labels";

describe("entity_type_labels", () => {
  it("detects entity id segments", () => {
    expect(isEntityIdSegment("ent_44835c5b0047ce26ffbe40bc")).toBe(true);
    expect(isEntityIdSegment("task")).toBe(false);
  });

  it("builds type list paths", () => {
    expect(entityTypeListPath("task")).toBe("/entities/task");
    expect(entityTypeListPath("social_post")).toBe("/entities/social_post");
  });

  it("parses type slug from list path", () => {
    expect(parseEntityTypeFromListPath("/entities/task")).toBe("task");
    expect(parseEntityTypeFromListPath("/entities/ent_abc")).toBeNull();
    expect(parseEntityTypeFromListPath("/entities")).toBeNull();
  });

  it("pluralizes entity type labels", () => {
    expect(pluralizeEntityTypeLabel("task")).toBe("Tasks");
    expect(pluralizeEntityTypeLabel("contact")).toBe("Contacts");
    expect(pluralizeEntityTypeLabel("company")).toBe("Companies");
    expect(pluralizeEntityTypeLabel("social_post")).toBe("Social posts");
    expect(pluralizeEntityTypeLabel("agent_message", "Chat message")).toBe("Chat messages");
  });
});
