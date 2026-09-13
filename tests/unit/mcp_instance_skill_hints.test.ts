/**
 * Unit tests for `src/services/skills/instance_skills.ts` (issue #2046).
 *
 * A hosted instance whose skills live in the graph has no local `skills/`
 * directory, so the filesystem scan that backs `available_skills` returns an
 * empty array and MCP-only clients never learn the instance's skills exist.
 * These tests cover the graph-backed read that fixes that.
 *
 * Covers:
 * - An instance WITH skill rows surfaces them
 * - An instance with NO skill rows is a complete no-op
 * - The read is user-scoped (a different user does not see another's skills)
 * - Disabled skills are excluded; `user_invocable` is NOT filtered on
 * - Compact mode omits descriptions
 * - The cap truncates by both count and bytes, with a visible "…and N more"
 * - Bodies and scripts are never surfaced
 * - DB errors degrade to an empty array rather than blocking initialisation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock the db module — must be hoisted before any dynamic imports.
// Records the filters applied so scoping can be asserted directly.
// ---------------------------------------------------------------------------

const resolvedValue: { data: unknown; error: unknown } = { data: [], error: null };

/** Filters captured from the query builder, keyed by column. */
const appliedEq: Array<[string, unknown]> = [];
const appliedIs: Array<[string, unknown]> = [];

vi.mock("../../src/db.js", () => {
  const chain: Record<string, unknown> = {};
  const mockIs = vi.fn((col: string, val: unknown) => {
    appliedIs.push([col, val]);
    return Promise.resolve(resolvedValue);
  });
  const mockEq = vi.fn((col: string, val: unknown) => {
    appliedEq.push([col, val]);
    return chain;
  });
  chain.eq = mockEq;
  chain.is = mockIs;
  const mockSelect = vi.fn(() => chain);
  const mockFrom = vi.fn(() => ({ select: mockSelect }));
  return { db: { from: mockFrom } };
});

vi.mock("../../src/utils/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  getInstanceSkills,
  renderInstanceSkillsSection,
  INSTANCE_SKILLS_MAX_COUNT,
  INSTANCE_SKILLS_MAX_BYTES,
  INSTANCE_SKILL_FETCH_HINT,
  type InstanceSkill,
} from "../../src/services/skills/instance_skills.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function row(id: string, snapshot: Record<string, unknown>, canonicalName = id) {
  return { id, canonical_name: canonicalName, entity_snapshots: { snapshot } };
}

function setRows(rows: unknown[]): void {
  resolvedValue.data = rows;
  resolvedValue.error = null;
}

beforeEach(() => {
  appliedEq.length = 0;
  appliedIs.length = 0;
  resolvedValue.data = [];
  resolvedValue.error = null;
});

// ---------------------------------------------------------------------------
// Instance WITH skill rows
// ---------------------------------------------------------------------------

describe("getInstanceSkills — instance with skill rows", () => {
  it("surfaces graph-stored skills with name and description", async () => {
    setRows([
      row("ent_1", { name: "capture-meeting", description: "Record a meeting.", enabled: true }),
      row("ent_2", { name: "audit-graph", description: "Audit the graph.", enabled: true }),
    ]);

    const skills = await getInstanceSkills("user-a");

    expect(skills).toHaveLength(2);
    // Sorted by name ascending for deterministic output.
    expect(skills.map((s) => s.name)).toEqual(["audit-graph", "capture-meeting"]);
    expect(skills[0]).toMatchObject({
      entity_id: "ent_2",
      name: "audit-graph",
      description: "Audit the graph.",
    });
  });

  it("includes a skill whose `enabled` flag is absent (opt-out, not opt-in)", async () => {
    setRows([row("ent_1", { name: "no-flag", description: "No enabled field." })]);

    const skills = await getInstanceSkills("user-a");

    expect(skills.map((s) => s.name)).toEqual(["no-flag"]);
  });

  it("falls back to canonical_name when the snapshot omits `name`", async () => {
    setRows([row("ent_1", { description: "Nameless." }, "skill:from-canonical")]);

    const skills = await getInstanceSkills("user-a");

    expect(skills.map((s) => s.name)).toEqual(["skill:from-canonical"]);
  });

  it("tolerates a missing description without dropping the skill", async () => {
    setRows([row("ent_1", { name: "bare", enabled: true })]);

    const skills = await getInstanceSkills("user-a");

    expect(skills).toHaveLength(1);
    expect(skills[0].description).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Instance with NO skill rows — must be a complete no-op
// ---------------------------------------------------------------------------

describe("getInstanceSkills — instance with no skill rows", () => {
  it("returns an empty array", async () => {
    setRows([]);
    await expect(getInstanceSkills("user-a")).resolves.toEqual([]);
  });

  it("renders no section at all — no header, no empty section", () => {
    expect(renderInstanceSkillsSection([], false)).toBeNull();
    expect(renderInstanceSkillsSection([], true)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Auth scoping — hard acceptance criterion
// ---------------------------------------------------------------------------

describe("getInstanceSkills — auth scoping", () => {
  it("scopes the query to the authenticated user_id", async () => {
    setRows([row("ent_1", { name: "scoped", enabled: true })]);

    await getInstanceSkills("user-a");

    // The user_id filter is load-bearing: an unscoped read on these instances
    // can return HTTP 200 with zero rows rather than an error, so a scoping
    // regression fails silently and is indistinguishable from "no skills".
    expect(appliedEq).toContainEqual(["user_id", "user-a"]);
  });

  it("filters to the `skill` entity type and excludes merged rows", async () => {
    setRows([]);
    await getInstanceSkills("user-a");

    expect(appliedEq).toContainEqual(["entity_type", "skill"]);
    expect(appliedIs).toContainEqual(["merged_to_entity_id", null]);
  });

  it("a different user's query is scoped to that user, not the first", async () => {
    setRows([row("ent_1", { name: "a-skill", enabled: true })]);
    await getInstanceSkills("user-a");

    appliedEq.length = 0;

    // User B's instance holds no skills.
    setRows([]);
    const bSkills = await getInstanceSkills("user-b");

    expect(appliedEq).toContainEqual(["user_id", "user-b"]);
    expect(appliedEq).not.toContainEqual(["user_id", "user-a"]);
    // User B does not see user A's skills.
    expect(bSkills).toEqual([]);
  });

  it("never issues an unscoped read (user_id filter always present)", async () => {
    setRows([]);
    await getInstanceSkills("user-a");

    const userIdFilters = appliedEq.filter(([col]) => col === "user_id");
    expect(userIdFilters).toHaveLength(1);
    expect(userIdFilters[0][1]).toBe("user-a");
  });
});

// ---------------------------------------------------------------------------
// enabled / user_invocable filtering
// ---------------------------------------------------------------------------

describe("getInstanceSkills — filtering", () => {
  it("excludes skills with enabled: false", async () => {
    setRows([
      row("ent_1", { name: "on", enabled: true }),
      row("ent_2", { name: "off", enabled: false }),
    ]);

    const skills = await getInstanceSkills("user-a");

    expect(skills.map((s) => s.name)).toEqual(["on"]);
  });

  it('excludes skills with the STRING "false" (live data stores both forms)', async () => {
    setRows([
      row("ent_1", { name: "on", enabled: "true" }),
      row("ent_2", { name: "off", enabled: "false" }),
    ]);

    const skills = await getInstanceSkills("user-a");

    expect(skills.map((s) => s.name)).toEqual(["on"]);
  });

  it("does NOT filter on user_invocable — a non-invocable skill is still surfaced", async () => {
    // user_invocable controls slash-command palette surfacing, not
    // conversational firing. A non-user-invocable skill is exactly the kind an
    // agent needs told about, since the user cannot invoke it from a menu.
    setRows([
      row("ent_1", { name: "palette", enabled: true, user_invocable: true }),
      row("ent_2", { name: "agent-only", enabled: true, user_invocable: false }),
    ]);

    const skills = await getInstanceSkills("user-a");

    expect(skills.map((s) => s.name)).toEqual(["agent-only", "palette"]);
  });
});

// ---------------------------------------------------------------------------
// Descriptions only — never bodies, never scripts
// ---------------------------------------------------------------------------

describe("getInstanceSkills — descriptions only", () => {
  it("never returns the skill body, even when the snapshot carries one", async () => {
    const body = "# Secret Body\nStep 1: do the thing.";
    setRows([
      row("ent_1", { name: "has-body", description: "A description.", content: body, enabled: true }),
    ]);

    const skills = await getInstanceSkills("user-a");

    expect(skills).toHaveLength(1);
    expect(JSON.stringify(skills)).not.toContain("Secret Body");
    expect(Object.keys(skills[0]).sort()).toEqual(["description", "entity_id", "name"]);
  });

  it("does not surface script or executable references in the rendered section", async () => {
    setRows([
      row("ent_1", {
        name: "has-script",
        description: "A description.",
        content: "run scripts/danger.sh",
        enabled: true,
      }),
    ]);

    const skills = await getInstanceSkills("user-a");
    const section = renderInstanceSkillsSection(skills, false);

    expect(section).not.toContain("danger.sh");
  });

  it("truncates a pathologically long description", async () => {
    setRows([row("ent_1", { name: "verbose", description: "x".repeat(5000), enabled: true })]);

    const skills = await getInstanceSkills("user-a");

    expect(skills[0].description.length).toBeLessThanOrEqual(301);
    expect(skills[0].description.endsWith("…")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rendering: fetch hint, compact mode, caps
// ---------------------------------------------------------------------------

describe("renderInstanceSkillsSection — fetch hint", () => {
  const skills: InstanceSkill[] = [
    { entity_id: "e1", name: "capture-meeting", description: "Record a meeting." },
  ];

  it("names an existing retrieval path for obtaining the body", () => {
    const section = renderInstanceSkillsSection(skills, false)!;

    expect(section).toContain(INSTANCE_SKILL_FETCH_HINT);
    // The hint must direct agents at a tool that actually exists.
    expect(section).toContain("retrieve_entity_by_identifier");
    expect(section).toContain('entity_type "skill"');
    expect(section).toContain('by "name"');
  });

  it("includes the header and the skill name and description", () => {
    const section = renderInstanceSkillsSection(skills, false)!;

    expect(section).toContain("[INSTANCE SKILLS]");
    expect(section).toContain("capture-meeting");
    expect(section).toContain("Record a meeting.");
  });
});

describe("renderInstanceSkillsSection — compact mode", () => {
  const skills: InstanceSkill[] = [
    { entity_id: "e1", name: "capture-meeting", description: "A long description here." },
    { entity_id: "e2", name: "audit-graph", description: "Another long description." },
  ];

  it("omits descriptions in compact mode but keeps names and the fetch hint", () => {
    const section = renderInstanceSkillsSection(skills, true)!;

    expect(section).toContain("capture-meeting");
    expect(section).toContain("audit-graph");
    expect(section).not.toContain("A long description here.");
    expect(section).not.toContain("Another long description.");
    expect(section).toContain(INSTANCE_SKILL_FETCH_HINT);
  });

  it("compact output is strictly smaller than full output", () => {
    const full = renderInstanceSkillsSection(skills, false)!;
    const compact = renderInstanceSkillsSection(skills, true)!;

    expect(compact.length).toBeLessThan(full.length);
  });

  it("is still a no-op with no skills, in compact mode", () => {
    expect(renderInstanceSkillsSection([], true)).toBeNull();
  });
});

describe("renderInstanceSkillsSection — caps", () => {
  it("caps by count and reports the remainder", () => {
    const many: InstanceSkill[] = Array.from({ length: 60 }, (_, i) => ({
      entity_id: `e${i}`,
      // Zero-padded so sort order is stable and names stay short (so the count
      // cap binds before the byte cap).
      name: `skill-${String(i).padStart(3, "0")}`,
      description: "",
    }));

    const section = renderInstanceSkillsSection(many, false)!;
    const bullets = section.split("\n").filter((l) => l.startsWith("- "));

    expect(bullets).toHaveLength(INSTANCE_SKILLS_MAX_COUNT);
    expect(section).toContain(`…and ${60 - INSTANCE_SKILLS_MAX_COUNT} more`);
  });

  it("caps by bytes when long descriptions blow the budget before the count", () => {
    const fat: InstanceSkill[] = Array.from({ length: 20 }, (_, i) => ({
      entity_id: `e${i}`,
      name: `skill-${String(i).padStart(3, "0")}`,
      description: "y".repeat(300),
    }));

    const section = renderInstanceSkillsSection(fat, false)!;
    const bullets = section.split("\n").filter((l) => l.startsWith("- "));

    // Byte cap binds first: fewer than the count cap, and fewer than supplied.
    expect(bullets.length).toBeLessThan(20);
    expect(bullets.length).toBeLessThan(INSTANCE_SKILLS_MAX_COUNT);

    const renderedBytes = bullets.reduce((n, l) => n + Buffer.byteLength(l, "utf8") + 1, 0);
    expect(renderedBytes).toBeLessThanOrEqual(INSTANCE_SKILLS_MAX_BYTES);
    expect(section).toContain("more");
  });

  it("does not truncate when the list fits under both caps", () => {
    const few: InstanceSkill[] = [
      { entity_id: "e1", name: "a", description: "short" },
      { entity_id: "e2", name: "b", description: "short" },
    ];

    const section = renderInstanceSkillsSection(few, false)!;

    expect(section).not.toContain("more (fetch by name");
    expect(section.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(2);
  });

  it("always renders at least one entry even if it alone exceeds the byte cap", () => {
    const huge: InstanceSkill[] = [
      { entity_id: "e1", name: "big", description: "z".repeat(INSTANCE_SKILLS_MAX_BYTES * 2) },
      { entity_id: "e2", name: "next", description: "short" },
    ];

    const section = renderInstanceSkillsSection(huge, false)!;
    const bullets = section.split("\n").filter((l) => l.startsWith("- "));

    expect(bullets).toHaveLength(1);
    expect(section).toContain("…and 1 more");
  });
});

// ---------------------------------------------------------------------------
// Failure modes — must never block initialisation
// ---------------------------------------------------------------------------

describe("getInstanceSkills — failure handling", () => {
  it("returns an empty array on a DB error rather than throwing", async () => {
    resolvedValue.data = null;
    resolvedValue.error = { message: "connection refused" };

    await expect(getInstanceSkills("user-a")).resolves.toEqual([]);
  });

  it("returns an empty array when data is null", async () => {
    resolvedValue.data = null;
    resolvedValue.error = null;

    await expect(getInstanceSkills("user-a")).resolves.toEqual([]);
  });

  it("handles entity_snapshots arriving as an array (Supabase join variant)", async () => {
    setRows([
      {
        id: "ent_1",
        canonical_name: "arrayed",
        entity_snapshots: [{ snapshot: { name: "arrayed", description: "d", enabled: true } }],
      },
    ]);

    const skills = await getInstanceSkills("user-a");

    expect(skills.map((s) => s.name)).toEqual(["arrayed"]);
  });
});
