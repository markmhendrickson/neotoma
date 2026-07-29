import { describe, it, expect } from "vitest";
import { entityDisplayName } from "./entity_display_name";

describe("entityDisplayName", () => {
  it("prefers a contact's name over its title", () => {
    expect(
      entityDisplayName({
        entity_type: "contact",
        canonical_name: "contact:https://www.linkedin.com/in/ranisweis",
        snapshot: { name: "Rani Sweis", title: "Chief Creative" },
      })
    ).toBe("Rani Sweis");
  });

  it("never surfaces a URL-keyed canonical when a name exists", () => {
    const label = entityDisplayName({
      entity_type: "contact",
      canonical_name: "contact:https://www.linkedin.com/in/diptishrivastav",
      snapshot: { name: "Dipti Srivastava" },
    });
    expect(label).toBe("Dipti Srivastava");
    expect(label).not.toContain("linkedin.com");
    expect(label).not.toContain("contact:");
  });

  it("strips no emoji itself but is bypassed once name is clean", () => {
    // The canonical may still carry an emoji ("🦄 Rani Sweis"); the display
    // helper simply never reads it when a clean name is present.
    expect(
      entityDisplayName({
        entity_type: "contact",
        canonical_name: "🦄 Rani Sweis",
        snapshot: { name: "Rani Sweis" },
      })
    ).toBe("Rani Sweis");
  });

  it("applies to person and lead types too", () => {
    expect(
      entityDisplayName({
        entity_type: "person",
        canonical_name: "person:x",
        snapshot: { name: "Jane Roe", title: "VP" },
      })
    ).toBe("Jane Roe");
    expect(
      entityDisplayName({
        entity_type: "lead",
        canonical_name: "lead:y",
        snapshot: { name: "Sam Patel", title: "Founder" },
      })
    ).toBe("Sam Patel");
  });

  it("keeps title-first for non-person types", () => {
    expect(
      entityDisplayName({
        entity_type: "task",
        canonical_name: "task-1",
        snapshot: { title: "Ship it", name: "task-name" },
      })
    ).toBe("Ship it");
  });

  it("falls back to title for a contact with no name", () => {
    expect(
      entityDisplayName({
        entity_type: "contact",
        canonical_name: "contact:role",
        snapshot: { title: "Head of Sales" },
      })
    ).toBe("Head of Sales");
  });

  it("falls back to canonical, then the provided fallback, then em dash", () => {
    expect(
      entityDisplayName({ entity_type: "contact", canonical_name: "contact:frank", snapshot: {} })
    ).toBe("contact:frank");
    expect(
      entityDisplayName({ entity_type: "contact", canonical_name: null, snapshot: {} }, "ent_123")
    ).toBe("ent_123");
    expect(entityDisplayName({ entity_type: "contact" })).toBe("—");
  });

  it("ignores non-string and blank snapshot values", () => {
    expect(
      entityDisplayName({
        entity_type: "contact",
        canonical_name: "contact:fallback",
        snapshot: { name: "   ", title: 42 as unknown as string },
      })
    ).toBe("contact:fallback");
  });
});
