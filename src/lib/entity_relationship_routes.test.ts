import { describe, expect, it } from "vitest";
import {
  entityRelationshipSubpageHref,
  parseEntityRelationshipSubpageRoute,
} from "./entity_relationship_routes";

describe("entity_relationship_routes", () => {
  it("builds and parses relationship subpage hrefs", () => {
    const href = entityRelationshipSubpageHref("ent_abc", "PART_OF", "plan");
    expect(href).toBe("/entities/ent_abc/relationships/PART_OF/plan");
    expect(parseEntityRelationshipSubpageRoute(href)).toEqual({
      entityId: "ent_abc",
      relationshipType: "PART_OF",
      relatedEntityType: "plan",
    });
  });

  it("encodes special characters in path segments", () => {
    const href = entityRelationshipSubpageHref("ent/x", "REFERS_TO", "conversation_message");
    expect(href).toContain(encodeURIComponent("ent/x"));
    const parsed = parseEntityRelationshipSubpageRoute(href);
    expect(parsed?.entityId).toBe("ent/x");
    expect(parsed?.relatedEntityType).toBe("conversation_message");
  });
});
