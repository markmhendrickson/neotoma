import { describe, expect, it } from "vitest";
import {
  coercePinnedPrimitives,
  enrichEntityRelationshipPins,
  enrichPinnedPrimitivesWithEntityTypes,
  entityRelationshipPinTypeLabel,
  entityTypeFilterPinHref,
  isPinnedLocationActive,
  normalizePinHref,
  parseEntityIdFromPinHref,
  reorderPinnedPrimitives,
  togglePinnedPrimitive,
  type PinnedPrimitive,
} from "./pinned_primitives";

describe("pinned_primitives", () => {
  it("coerces persisted pin payloads from untrusted storage", () => {
    expect(coercePinnedPrimitives(null)).toEqual([]);
    expect(
      coercePinnedPrimitives([
        {
          href: "entities?type=contact",
          kind: "entity_type",
          label: "Contact",
          entity_type: " contact ",
          subtitle: " ",
          pinned_at: "2026-05-18T00:00:00.000Z",
        },
        {
          href: "/bad",
          kind: "unknown",
          label: "Bad",
          pinned_at: "2026-05-18T00:00:00.000Z",
        },
      ]),
    ).toEqual([
      {
        href: "/entities/contact",
        kind: "entity_type",
        label: "Contact",
        entity_type: "contact",
        related_entity_type: undefined,
        subtitle: undefined,
        pinned_at: "2026-05-18T00:00:00.000Z",
      },
    ]);
  });

  it("normalizes entity type filter hrefs to a canonical type query", () => {
    expect(entityTypeFilterPinHref("contact")).toBe("/entities/contact");
    expect(normalizePinHref("/entities?type=contact")).toBe("/entities/contact");
    expect(normalizePinHref("entities?type=contact&foo=bar")).toBe("/entities");
    expect(normalizePinHref("/entities/ent_abc")).toBe("/entities/ent_abc");
  });

  it("detects active location for entity type pins", () => {
    const pin: PinnedPrimitive = {
      href: "/entities/task",
      kind: "entity_type",
      label: "Task",
      entity_type: "task",
      pinned_at: "2026-05-18T00:00:00.000Z",
    };
    expect(isPinnedLocationActive(pin, "/entities/task", "")).toBe(true);
    expect(isPinnedLocationActive(pin, "/entities", "?type=task")).toBe(true);
    expect(isPinnedLocationActive(pin, "/entities", "?type=event")).toBe(false);
    expect(isPinnedLocationActive(pin, "/entity-types", "")).toBe(false);
  });

  it("parses entity id from entity pin href", () => {
    expect(parseEntityIdFromPinHref("/entities/ent_abc")).toBe("ent_abc");
    expect(parseEntityIdFromPinHref("/entities/correct")).toBeNull();
    expect(parseEntityIdFromPinHref("/entities?type=task")).toBeNull();
  });

  it("enriches entity pins missing entity_type", () => {
    const pins: PinnedPrimitive[] = [
      {
        href: "/entities/ent_abc",
        kind: "entity",
        label: "Acme",
        pinned_at: "2026-05-18T00:00:00.000Z",
      },
    ];
    const next = enrichPinnedPrimitivesWithEntityTypes(
      pins,
      new Map([["/entities/ent_abc", "company"]]),
    );
    expect(next[0]?.entity_type).toBe("company");
    expect(enrichPinnedPrimitivesWithEntityTypes(pins, new Map())).toBe(pins);
  });

  it("enriches entity_relationships pins with anchor type and related label", () => {
    const pins: PinnedPrimitive[] = [
      {
        href: "/entities/ent_parent/relationships/PART_OF/plan",
        kind: "entity_relationships",
        label: "ent_parent",
        entity_type: "plan",
        pinned_at: "2026-05-18T00:00:00.000Z",
      },
    ];
    const next = enrichEntityRelationshipPins(
      pins,
      new Map([
        [
          "/entities/ent_parent/relationships/PART_OF/plan",
          {
            anchorEntityType: "objective",
            anchorLabel: "Ship grouping",
            relatedEntityType: "plan",
            relatedTypeLabel: "Plans",
          },
        ],
      ]),
    );
    expect(next[0]?.entity_type).toBe("objective");
    expect(next[0]?.label).toBe("Ship grouping");
    expect(next[0]?.subtitle).toBe("Plans");
    expect(next[0]?.related_entity_type).toBe("plan");
    expect(entityRelationshipPinTypeLabel(next[0]!)).toBe("Plans");
  });

  it("pins entity types with canonical href and schema name", () => {
    const next = togglePinnedPrimitive([], {
      href: "/entities?type=contact",
      kind: "entity_type",
      label: "Contact",
      entity_type: "contact",
    });
    expect(next).toHaveLength(1);
    expect(next[0]?.href).toBe("/entities/contact");
    expect(next[0]?.kind).toBe("entity_type");
    expect(next[0]?.entity_type).toBe("contact");
  });

  it("reorders pins by moving one index to another", () => {
    const pins: PinnedPrimitive[] = [
      {
        href: "/entities/a",
        kind: "entity_type",
        label: "A",
        entity_type: "a",
        pinned_at: "2026-05-18T00:00:00.000Z",
      },
      {
        href: "/entities/b",
        kind: "entity_type",
        label: "B",
        entity_type: "b",
        pinned_at: "2026-05-18T00:00:01.000Z",
      },
      {
        href: "/entities/c",
        kind: "entity_type",
        label: "C",
        entity_type: "c",
        pinned_at: "2026-05-18T00:00:02.000Z",
      },
    ];
    expect(reorderPinnedPrimitives(pins, 0, 2).map((p) => p.href)).toEqual([
      "/entities/b",
      "/entities/c",
      "/entities/a",
    ]);
    expect(reorderPinnedPrimitives(pins, 2, 0).map((p) => p.href)).toEqual([
      "/entities/c",
      "/entities/a",
      "/entities/b",
    ]);
    expect(reorderPinnedPrimitives(pins, 1, 1)).toBe(pins);
    expect(reorderPinnedPrimitives(pins, -1, 0)).toBe(pins);
    expect(reorderPinnedPrimitives(pins, 0, 99)).toBe(pins);
  });
});
