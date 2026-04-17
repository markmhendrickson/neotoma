/**
 * Tests for entity-type equivalence (duplicate-type guard).
 *
 * The service is schema-agnostic: given a candidate type name, it scans the
 * active registry for schemas whose normalized name or declared aliases match
 * the candidate's singular form. We mock the DB layer so the test is fast
 * and deterministic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/db.js", () => {
  const mockRows: Array<{
    id: string;
    entity_type: string;
    schema_definition: { aliases?: string[] } | null;
    scope: string;
    user_id: string | null;
  }> = [];

  function setRows(rows: typeof mockRows) {
    mockRows.length = 0;
    mockRows.push(...rows);
  }

  const db = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() =>
          Promise.resolve({ data: [...mockRows], error: null }),
        ),
      })),
    })),
  };

  return { db, __setRows: setRows };
});

import { findEquivalentEntityType } from "../../src/services/entity_type_equivalence.js";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { __setRows } = (await import("../../src/db.js")) as any;

describe("entity_type_equivalence", () => {
  beforeEach(() => {
    __setRows([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when no equivalent exists", async () => {
    __setRows([
      {
        id: "s1",
        entity_type: "contact",
        schema_definition: {},
        scope: "global",
        user_id: null,
      },
    ]);
    expect(await findEquivalentEntityType("invoice")).toBeNull();
  });

  it("matches by normalized form (case differences)", async () => {
    __setRows([
      {
        id: "s1",
        entity_type: "place",
        schema_definition: {},
        scope: "global",
        user_id: null,
      },
    ]);
    const result = await findEquivalentEntityType("Place");
    expect(result?.canonical_entity_type).toBe("place");
    // "Place" lowercases to "place" which equals existing → singular_form
    // (since normalized check skips self-equality). Either reason is valid.
    expect(["normalized", "singular_form"]).toContain(result?.reason);
  });

  it("matches by singular form (place vs places)", async () => {
    __setRows([
      {
        id: "s1",
        entity_type: "place",
        schema_definition: {},
        scope: "global",
        user_id: null,
      },
    ]);
    const result = await findEquivalentEntityType("places");
    expect(result?.canonical_entity_type).toBe("place");
    expect(result?.reason).toBe("singular_form");
  });

  it("matches by schema-declared aliases", async () => {
    __setRows([
      {
        id: "s1",
        entity_type: "meeting_note",
        schema_definition: { aliases: ["meetingnote", "mtg_note"] },
        scope: "global",
        user_id: null,
      },
    ]);
    const result = await findEquivalentEntityType("mtg_note");
    expect(result?.canonical_entity_type).toBe("meeting_note");
    expect(result?.reason).toBe("alias");
  });

  it("does not cross-leak other users' schemas", async () => {
    __setRows([
      {
        id: "s1",
        entity_type: "secret_thing",
        schema_definition: {},
        scope: "user",
        user_id: "other-user",
      },
    ]);
    const result = await findEquivalentEntityType("secret_thing", {
      userId: "my-user",
    });
    expect(result).toBeNull();
  });

  it("includes user's own user-scoped schemas", async () => {
    __setRows([
      {
        id: "s1",
        entity_type: "custom_entity",
        schema_definition: {},
        scope: "user",
        user_id: "my-user",
      },
    ]);
    const result = await findEquivalentEntityType("custom_entities", {
      userId: "my-user",
    });
    expect(result?.canonical_entity_type).toBe("custom_entity");
  });

  it("ignores alias self-equality (never maps a name to itself)", async () => {
    __setRows([
      {
        id: "s1",
        entity_type: "contact",
        schema_definition: { aliases: ["contact"] },
        scope: "global",
        user_id: null,
      },
    ]);
    expect(await findEquivalentEntityType("contact")).toBeNull();
  });
});
