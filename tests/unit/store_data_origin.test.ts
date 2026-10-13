/**
 * Unit coverage for the data_origin contract (#2242): schema validation,
 * per-entity precedence, the stored-payload materialization that keeps
 * pre-#2242 payloads byte-identical, provenance merging that never touches the
 * attribution keys, guest redaction, and compact rendering. Effect-level
 * coverage across REST/MCP/CLI lives in tests/integration/store_data_origin.test.ts
 * and tests/cli/cli_store_data_origin.test.ts.
 */

import { describe, expect, it } from "vitest";

import {
  DataOriginSchema,
  StoreRequestSchema,
  DATA_ORIGIN_KINDS,
} from "../../src/shared/action_schemas.js";
import {
  entitiesWithStoredDataOrigins,
  formatDataOriginCompact,
  readDataOriginFromProvenance,
  splitEntityDataOrigins,
  withDataOriginProvenance,
} from "../../src/services/provenance_data_origin.js";
import { redactMemberAttribution } from "../../src/services/attribution_redaction.js";
import { renderEntityCompactText } from "../../src/services/canonical_markdown.js";
import { parseDataOriginFlag } from "../../src/cli/index.js";

const FILE_ORIGIN = { kind: "file", locator: "book.xlsx", part: "sheet=A;row=2" } as const;
const URL_ORIGIN = { kind: "url", locator: "https://example.com/p" } as const;

describe("DataOriginSchema", () => {
  it("accepts every kind with a locator, and manual without one", () => {
    for (const kind of DATA_ORIGIN_KINDS) {
      expect(DataOriginSchema.safeParse({ kind, locator: "x" }).success, kind).toBe(true);
    }
    expect(DataOriginSchema.safeParse({ kind: "manual" }).success).toBe(true);
  });

  it("requires a locator for non-manual kinds", () => {
    for (const kind of DATA_ORIGIN_KINDS.filter((k) => k !== "manual")) {
      expect(DataOriginSchema.safeParse({ kind }).success, kind).toBe(false);
    }
  });

  it("is strict: unknown keys (including attribution keys) are rejected", () => {
    expect(DataOriginSchema.safeParse({ kind: "manual", client_name: "x" }).success).toBe(false);
    expect(
      DataOriginSchema.safeParse({ kind: "manual", attribution_tier: "hardware" }).success
    ).toBe(false);
  });

  it("validates url scheme, retrieved_at format and length caps", () => {
    expect(DataOriginSchema.safeParse({ ...URL_ORIGIN, url: "ftp://x/y" }).success).toBe(false);
    expect(DataOriginSchema.safeParse({ ...URL_ORIGIN, url: "https://x/y" }).success).toBe(true);
    expect(DataOriginSchema.safeParse({ kind: "manual", retrieved_at: "yesterday" }).success).toBe(
      false
    );
    expect(
      DataOriginSchema.safeParse({ kind: "manual", retrieved_at: "2026-08-27T09:00:00Z" }).success
    ).toBe(true);
    expect(DataOriginSchema.safeParse({ kind: "file", locator: "x".repeat(2049) }).success).toBe(
      false
    );
    const longNotes = "identity columns aliased; ".repeat(10);
    expect(
      DataOriginSchema.safeParse({ kind: "manual", notes: longNotes, producer: "a.py@4a5409c" })
        .success
    ).toBe(true);
  });
});

describe("StoreRequestSchema data_origin", () => {
  const base = { idempotency_key: "k", entities: [{ entity_type: "t", title: "a" }] };

  it("accepts a request-level origin", () => {
    expect(StoreRequestSchema.safeParse({ ...base, data_origin: FILE_ORIGIN }).success).toBe(true);
  });

  it("rejects an invalid per-entity origin with an entity-indexed path and a reserved-key hint", () => {
    const result = StoreRequestSchema.safeParse({
      idempotency_key: "k",
      entities: [{ entity_type: "t" }, { entity_type: "t", data_origin: "gmail" }],
    });
    expect(result.success).toBe(false);
    const issue = result.error!.issues[0]!;
    expect(issue.path).toEqual(["entities", 1, "data_origin"]);
    expect(issue.message).toContain("reserved");
    expect((issue as { params?: { hint?: string } }).params?.hint).toMatch(/rename that field/);
  });

  it("rejects data_origin on a file-only request", () => {
    const result = StoreRequestSchema.safeParse({
      file_content: "aGk=",
      mime_type: "text/plain",
      data_origin: FILE_ORIGIN,
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.path).toEqual(["data_origin"]);
  });
});

describe("splitEntityDataOrigins", () => {
  it("applies entity → request → none precedence and peels the reserved key", () => {
    const split = splitEntityDataOrigins(
      [
        { entity_type: "t", title: "a" },
        { entity_type: "t", title: "b", data_origin: URL_ORIGIN },
      ],
      FILE_ORIGIN
    );
    expect(split.entities).toEqual([
      { entity_type: "t", title: "a" },
      { entity_type: "t", title: "b" },
    ]);
    expect(split.origins).toEqual([FILE_ORIGIN, URL_ORIGIN]);
  });

  it("persists origins in the schema's canonical key order regardless of input order", () => {
    const split = splitEntityDataOrigins(
      [{ entity_type: "t", data_origin: { notes: "n", locator: "l", kind: "file" } }],
      undefined
    );
    expect(Object.keys(split.origins![0]!)).toEqual(["kind", "locator", "notes"]);
  });

  it("returns no origins at all when none were supplied, and leaves entities untouched", () => {
    const entities = [{ entity_type: "t", title: "a" }];
    const split = splitEntityDataOrigins(entities, undefined);
    expect(split.origins).toBeUndefined();
    expect(split.entities[0]).toBe(entities[0]);
  });

  it("leaves siblings without an origin when only one entity carries one", () => {
    const split = splitEntityDataOrigins(
      [{ entity_type: "t" }, { entity_type: "t", data_origin: URL_ORIGIN }],
      undefined
    );
    expect(split.origins).toEqual([undefined, URL_ORIGIN]);
  });
});

describe("entitiesWithStoredDataOrigins", () => {
  it("is the identical array when no origins apply (pre-#2242 bytes unchanged)", () => {
    const entities = [{ entity_type: "t", title: "a" }];
    expect(entitiesWithStoredDataOrigins(entities, undefined)).toBe(entities);
  });

  it("inlines each entity's effective origin for the stored payload", () => {
    const out = entitiesWithStoredDataOrigins(
      [{ entity_type: "t" }, { entity_type: "t" }],
      [FILE_ORIGIN, undefined]
    );
    expect(out).toEqual([{ entity_type: "t", data_origin: FILE_ORIGIN }, { entity_type: "t" }]);
  });
});

describe("withDataOriginProvenance", () => {
  it("adds only the data_origin key and never touches attribution or external_actor", () => {
    const attribution = {
      attribution_tier: "unverified_client",
      client_name: "cursor",
      external_actor: { provider: "github", login: "octocat" },
    };
    const merged = withDataOriginProvenance(attribution, FILE_ORIGIN);
    expect(merged).toEqual({ ...attribution, data_origin: FILE_ORIGIN });
    expect(attribution).not.toHaveProperty("data_origin");
  });

  it("returns the provenance object unchanged when there is no origin", () => {
    const attribution = { client_name: "cursor" };
    expect(withDataOriginProvenance(attribution, undefined)).toBe(attribution);
    expect(withDataOriginProvenance({}, null)).toEqual({});
  });

  it("reads the origin back from object or JSON-string provenance", () => {
    expect(readDataOriginFromProvenance({ data_origin: FILE_ORIGIN })).toEqual(FILE_ORIGIN);
    expect(readDataOriginFromProvenance(JSON.stringify({ data_origin: URL_ORIGIN }))).toEqual(
      URL_ORIGIN
    );
    expect(readDataOriginFromProvenance({ client_name: "x" })).toBeUndefined();
    expect(readDataOriginFromProvenance(null)).toBeUndefined();
  });
});

describe("guest redaction", () => {
  it("withholds data_origin and data_origins from guest responses, object or string provenance", () => {
    const body = {
      data_origins: { obs_1: FILE_ORIGIN },
      observations: [
        { id: "obs_1", provenance: { client_name: "x", data_origin: FILE_ORIGIN } },
        { id: "obs_2", provenance: JSON.stringify({ client_name: "y", data_origin: URL_ORIGIN }) },
      ],
    };
    const out = redactMemberAttribution(body) as any;
    expect(out.data_origins).toBeUndefined();
    expect(out.observations[0].provenance).toEqual({ client_name: "x" });
    expect(JSON.parse(out.observations[1].provenance)).toEqual({ client_name: "y" });
  });
});

describe("compact snapshot rendering", () => {
  const entity = {
    entity_id: "ent_1",
    entity_type: "t",
    schema_version: "1",
    snapshot: { title: "a" },
    provenance: { title: "obs_1" },
  };

  it("renders a data_origins block only when origins are present", () => {
    const withOrigins = renderEntityCompactText(
      { ...entity, data_origins: { obs_1: FILE_ORIGIN } },
      ["title"],
      { includeProvenance: true }
    );
    expect(withOrigins).toContain("data_origins:");
    expect(withOrigins).toContain(`obs_1: ${formatDataOriginCompact(FILE_ORIGIN)}`);
    expect(formatDataOriginCompact(FILE_ORIGIN)).toBe(
      "kind=file locator=book.xlsx part=sheet=A;row=2"
    );

    const without = renderEntityCompactText(entity, ["title"], { includeProvenance: true });
    expect(without).not.toContain("data_origins");
  });
});

describe("CLI --data-origin parsing", () => {
  it("accepts a JSON object and rejects anything else with guidance", () => {
    expect(parseDataOriginFlag(JSON.stringify(FILE_ORIGIN))).toEqual(FILE_ORIGIN);
    expect(() => parseDataOriginFlag("file:book.xlsx")).toThrow(/--data-origin/);
    expect(() => parseDataOriginFlag("[1]")).toThrow(/JSON object/);
  });
});
