import { describe, it, expect } from "vitest";
import {
  renderEntityMarkdown,
  renderEntityCompactText,
  renderRelationshipMarkdown,
  renderSourceMarkdown,
  renderTimelineDayMarkdown,
  renderSchemaMarkdown,
  renderIndexMarkdown,
  orderedSnapshotKeys,
  canonicalStringify,
  type RenderEntityInput,
  type RenderRelationshipInput,
  type RenderSourceInput,
  type RenderTimelineEventInput,
  type RenderSchemaInput,
} from "./canonical_markdown.js";

const BASE_ENTITY: RenderEntityInput = {
  entity_id: "ent_contact_a1",
  entity_type: "contact",
  schema_version: "1.0",
  computed_at: "2026-04-10T12:00:00.000Z",
  observation_count: 3,
  last_observation_at: "2026-04-09T09:30:00.000Z",
  snapshot: {
    name: "Sarah Chen",
    email: "sarah@example.com",
    canonical_name: "sarah_chen",
    zz_alpha_last: "z",
    aa_alpha_first: "a",
    notes: { b: 2, a: 1, c: [3, 1, 2] },
  },
  provenance: {
    email: "obs_2",
    name: "obs_1",
  },
};

describe("canonicalStringify", () => {
  it("sorts keys alphabetically at every depth", () => {
    const input = { b: 1, a: { z: 1, a: 1 }, c: [ { y: 2, x: 1 } ] };
    const out = canonicalStringify(input, 0);
    expect(out).toBe('{"a":{"a":1,"z":1},"b":1,"c":[{"x":1,"y":2}]}');
  });

  it("is byte-identical across reruns for same input", () => {
    const input = { b: 1, a: [3, 1, 2] };
    expect(canonicalStringify(input)).toBe(canonicalStringify(input));
  });
});

describe("orderedSnapshotKeys", () => {
  it("puts special first keys first, then schema order, then alphabetical for the rest", () => {
    const snapshot = {
      zz_last: "z",
      amount: 10,
      title: "t",
      name: "n",
      currency: "USD",
      extra_a: "ea",
      extra_b: "eb",
    };
    const schemaOrder = ["amount", "currency", "due_date"];
    expect(orderedSnapshotKeys(snapshot, schemaOrder)).toEqual([
      "title",
      "name",
      "amount",
      "currency",
      "extra_a",
      "extra_b",
      "zz_last",
    ]);
  });

  it("drops excluded control keys", () => {
    const snapshot = { name: "n", schema_version: "1.0", entity_type: "x", _deleted: false };
    expect(orderedSnapshotKeys(snapshot, [])).toEqual(["name"]);
  });
});

describe("renderEntityMarkdown", () => {
  it("is deterministic across reruns", () => {
    const schemaOrder = ["name", "email", "notes"];
    const a = renderEntityMarkdown(BASE_ENTITY, schemaOrder, { includeProvenance: true });
    const b = renderEntityMarkdown(BASE_ENTITY, schemaOrder, { includeProvenance: true });
    expect(a).toBe(b);
  });

  it("orders fields by schema first and alphabetically for the rest", () => {
    const md = renderEntityMarkdown(
      BASE_ENTITY,
      ["name", "email", "notes"],
      { includeProvenance: false }
    );
    const aaIdx = md.indexOf("## aa_alpha_first");
    const zzIdx = md.indexOf("## zz_alpha_last");
    const nameIdx = md.indexOf("## name");
    const emailIdx = md.indexOf("## email");
    const notesIdx = md.indexOf("## notes");
    expect(nameIdx).toBeGreaterThan(-1);
    expect(nameIdx).toBeLessThan(emailIdx);
    expect(emailIdx).toBeLessThan(notesIdx);
    expect(notesIdx).toBeLessThan(aaIdx);
    expect(aaIdx).toBeLessThan(zzIdx);
  });

  it("includes a provenance footer when requested, sorted by field name", () => {
    const md = renderEntityMarkdown(BASE_ENTITY, ["name", "email"], { includeProvenance: true });
    const provIdx = md.indexOf("## provenance");
    expect(provIdx).toBeGreaterThan(-1);
    const after = md.slice(provIdx);
    const emailRow = after.indexOf("| email |");
    const nameRow = after.indexOf("| name |");
    expect(emailRow).toBeLessThan(nameRow);
  });

  it("omits provenance footer by default", () => {
    const md = renderEntityMarkdown(BASE_ENTITY, ["name"], {});
    expect(md.includes("## provenance")).toBe(false);
  });

  it("emits canonical JSON with sorted keys for nested objects", () => {
    const md = renderEntityMarkdown(BASE_ENTITY, ["notes"], {});
    expect(md).toContain('"a": 1');
    const aIdx = md.indexOf('"a": 1');
    const bIdx = md.indexOf('"b": 2');
    expect(aIdx).toBeLessThan(bIdx);
  });

  it("excludes schema_version and entity_type from body", () => {
    const md = renderEntityMarkdown(
      { ...BASE_ENTITY, snapshot: { ...BASE_ENTITY.snapshot, schema_version: "1.0", entity_type: "contact" } },
      [],
      {}
    );
    expect(md).not.toContain("## schema_version");
    expect(md).not.toContain("## entity_type");
    expect(md).toContain("schema_version: 1.0"); // frontmatter is fine
  });
});

describe("renderEntityCompactText", () => {
  it("is deterministic across reruns", () => {
    const a = renderEntityCompactText(BASE_ENTITY, ["name", "email"], { includeProvenance: true });
    const b = renderEntityCompactText(BASE_ENTITY, ["name", "email"], { includeProvenance: true });
    expect(a).toBe(b);
  });

  it("starts with the display name header", () => {
    const text = renderEntityCompactText(BASE_ENTITY, ["name"], {});
    expect(text.startsWith("# Sarah Chen")).toBe(true);
  });

  it("uses canonical JSON for nested object values (sorted keys)", () => {
    const text = renderEntityCompactText(BASE_ENTITY, ["notes"], {});
    expect(text).toContain('notes: {"a":1,"b":2,"c":[3,1,2]}');
  });
});

describe("renderRelationshipMarkdown", () => {
  const rel: RenderRelationshipInput = {
    relationship_key: "ent_a|ent_b|works_at",
    relationship_type: "works_at",
    source_entity_id: "ent_a",
    target_entity_id: "ent_b",
    schema_version: "1.0",
    computed_at: "2026-04-10T12:00:00.000Z",
    observation_count: 1,
    last_observation_at: "2026-04-09T09:30:00.000Z",
    snapshot: { since: "2020-01-01", role: "Engineer" },
    provenance: { since: "obs_42", role: "obs_41" },
  };

  it("renders deterministically", () => {
    const a = renderRelationshipMarkdown(rel, { includeProvenance: true });
    const b = renderRelationshipMarkdown(rel, { includeProvenance: true });
    expect(a).toBe(b);
  });

  it("uses resolveEntityDisplay labels in the header when provided", () => {
    const md = renderRelationshipMarkdown(rel, {
      resolveEntityDisplay: (id) =>
        id === "ent_a"
          ? { entity_type: "person", canonical_name: "alice", snapshot: { name: "Alice" } }
          : id === "ent_b"
            ? { entity_type: "company", canonical_name: "acme", snapshot: { name: "Acme Corp" } }
            : null,
    });
    expect(md).toContain("# Alice (ent_a) — works_at → Acme Corp (ent_b)");
  });
});

describe("renderSourceMarkdown", () => {
  const src: RenderSourceInput = {
    id: "src_123",
    content_hash: "sha256:abc",
    mime_type: "text/plain",
    file_name: "notes.txt",
    original_filename: "notes.txt",
    byte_size: 42,
    source_type: "file_upload",
    source_agent_id: "agent_1",
    created_at: "2026-04-10T12:00:00.000Z",
    source_metadata: { origin: "manual", x: 1 },
    storage_status: "uploaded",
  };

  it("renders a link to GET /sources/:id/content relative by default", () => {
    const md = renderSourceMarkdown(src, {});
    expect(md).toContain("[View raw content](/sources/src_123/content)");
  });

  it("respects apiBase when rendering the raw link", () => {
    const md = renderSourceMarkdown(src, { apiBase: "https://neo.example.com/" });
    expect(md).toContain("[View raw content](https://neo.example.com/sources/src_123/content)");
  });

  it("is deterministic", () => {
    const a = renderSourceMarkdown(src, {});
    const b = renderSourceMarkdown(src, {});
    expect(a).toBe(b);
  });
});

describe("renderTimelineDayMarkdown", () => {
  const events: RenderTimelineEventInput[] = [
    {
      id: "evt_b",
      event_type: "Login",
      event_timestamp: "2026-04-10T15:00:00.000Z",
      entity_ids: ["ent_z", "ent_a"],
      metadata: { title: "User login", ip: "127.0.0.1" },
    },
    {
      id: "evt_a",
      event_type: "Signup",
      event_timestamp: "2026-04-10T09:00:00.000Z",
      entity_ids: ["ent_x"],
      metadata: { title: "Account created" },
    },
  ];

  it("sorts events by timestamp ascending (deterministic)", () => {
    const md = renderTimelineDayMarkdown("2026-04-10", events, {});
    const loginIdx = md.indexOf("## 2026-04-10T15:00:00.000Z");
    const signupIdx = md.indexOf("## 2026-04-10T09:00:00.000Z");
    expect(signupIdx).toBeGreaterThan(-1);
    expect(signupIdx).toBeLessThan(loginIdx);
  });

  it("sorts entity_ids alphabetically", () => {
    const md = renderTimelineDayMarkdown("2026-04-10", events, {});
    expect(md).toContain("ent_a, ent_z");
  });

  it("is deterministic across reruns", () => {
    const a = renderTimelineDayMarkdown("2026-04-10", events, {});
    const b = renderTimelineDayMarkdown("2026-04-10", events, {});
    expect(a).toBe(b);
  });
});

describe("renderSchemaMarkdown", () => {
  const schema: RenderSchemaInput = {
    entity_type: "contact",
    schema_version: "1.0",
    active: true,
    created_at: "2026-04-01T00:00:00.000Z",
    metadata: { label: "Contact", description: "A person contact", category: "productivity" },
    schema_definition: {
      fields: {
        name: { type: "string", required: true, description: "Display name" },
        email: { type: "string", required: false, description: "Email address" },
        age: { type: "number" },
      },
    },
  };

  it("is deterministic", () => {
    const a = renderSchemaMarkdown(schema, {});
    const b = renderSchemaMarkdown(schema, {});
    expect(a).toBe(b);
  });

  it("lists fields alphabetically in the table", () => {
    const md = renderSchemaMarkdown(schema, {});
    const ageIdx = md.indexOf("| age | number");
    const emailIdx = md.indexOf("| email | string");
    const nameIdx = md.indexOf("| name | string");
    expect(ageIdx).toBeLessThan(emailIdx);
    expect(emailIdx).toBeLessThan(nameIdx);
  });
});

describe("renderIndexMarkdown", () => {
  it("sorts entries alphabetically by label", () => {
    const md = renderIndexMarkdown(
      "Contacts",
      [
        { label: "Zoe", href: "z.md" },
        { label: "Alice", href: "a.md", summary: "Engineer" },
      ],
      {}
    );
    const aliceIdx = md.indexOf("Alice");
    const zoeIdx = md.indexOf("Zoe");
    expect(aliceIdx).toBeLessThan(zoeIdx);
    expect(md).toContain("- [Alice](a.md) — Engineer");
  });

  it("emits '(no entries)' for empty arrays", () => {
    const md = renderIndexMarkdown("Empty", [], {});
    expect(md).toContain("_(no entries)_");
  });
});
