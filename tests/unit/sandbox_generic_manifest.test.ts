/**
 * Integrity guard for the 'generic' sandbox showcase manifest.
 *
 * The pack is hand-authored data, so a wiring mistake (a relationship pointing
 * at a `_ref` no entity declares, or an invalid relationship_type) would
 * silently drop edges at seed time. These checks fail loudly instead, and also
 * assert the pack stays *rich* (so a future edit can't quietly flatten it back
 * to the thin pre-showcase state).
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { RelationshipTypeSchema } from "../../src/shared/action_schemas.js";

const manifestPath = path.resolve(
  __dirname,
  "..",
  "..",
  "tests",
  "fixtures",
  "sandbox",
  "manifest.json"
);

interface Batch {
  entities?: Record<string, unknown>[];
  fixture?: string;
}
interface Rel {
  source_ref: string;
  target_ref: string;
  relationship_type: string;
}
interface Manifest {
  schema_version: string;
  entity_batches: Batch[];
  relationships?: Rel[];
  unstructured_sources?: { interpretation_entities?: unknown[] }[];
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;

function allRefs(): Set<string> {
  const refs = new Set<string>();
  for (const b of manifest.entity_batches) {
    for (const e of b.entities ?? []) {
      const ref = (e as { _ref?: string })._ref;
      if (typeof ref === "string") refs.add(ref);
    }
  }
  return refs;
}

describe("generic sandbox showcase manifest", () => {
  it("every relationship references a declared entity _ref", () => {
    const refs = allRefs();
    const dangling: string[] = [];
    for (const r of manifest.relationships ?? []) {
      if (!refs.has(r.source_ref)) dangling.push(`source ${r.source_ref}`);
      if (!refs.has(r.target_ref)) dangling.push(`target ${r.target_ref}`);
    }
    expect(dangling, `dangling refs: ${dangling.join(", ")}`).toEqual([]);
  });

  it("every relationship_type is a valid RelationshipType", () => {
    const valid = new Set(RelationshipTypeSchema.options as readonly string[]);
    const bad = (manifest.relationships ?? [])
      .map((r) => r.relationship_type)
      .filter((t) => !valid.has(t));
    expect(bad, `invalid relationship_types: ${[...new Set(bad)].join(", ")}`).toEqual([]);
  });

  it("each entity_batch provides entities or a fixture", () => {
    for (const b of manifest.entity_batches) {
      expect(Array.isArray(b.entities) || typeof b.fixture === "string").toBe(true);
    }
  });

  it("stays rich: many entity types, a real graph, and an interpretation", () => {
    const types = new Set<string>();
    let entityRows = 0;
    for (const b of manifest.entity_batches) {
      for (const e of b.entities ?? []) {
        entityRows++;
        const t = (e as { entity_type?: string }).entity_type;
        if (t) types.add(t);
      }
    }
    expect(manifest.schema_version).toBe("2.0");
    expect(entityRows).toBeGreaterThanOrEqual(25);
    expect(types.size).toBeGreaterThanOrEqual(8);
    expect((manifest.relationships ?? []).length).toBeGreaterThanOrEqual(20);
    // At least one interpreted source (Sources → Interpretations chain).
    const interpreted = (manifest.unstructured_sources ?? []).some(
      (s) => Array.isArray(s.interpretation_entities) && s.interpretation_entities.length > 0
    );
    expect(interpreted).toBe(true);
  });
});
