/**
 * Contract test: @neotoma/client StoreResult must remain compatible with
 * the StoreStructuredResponse shape declared in openapi.yaml.
 *
 * Background (neotoma#316): helpers.ts read `result.structured.entities`,
 * but the server returns `{ entities, relationships, source_id, ... }` at
 * the top level. The type was wrong, the helpers read the wrong path, and
 * downstream consumers (cursor-hooks, agent SDK) silently got
 * `entity_id: undefined`. This contract test exists to catch that class of
 * regression by asserting that:
 *   - The top-level `entities` property exists in the spec.
 *   - The TypeScript surface in `@neotoma/client/types.ts` declares a way
 *     to read it (either flat `entities` or `structured.entities`).
 */

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

interface OpenApiResponseSchema {
  type?: string;
  properties?: Record<string, unknown>;
  allOf?: Array<{ $ref?: string; properties?: Record<string, unknown> }>;
  $ref?: string;
}

interface OpenApiSpec {
  components?: { schemas?: Record<string, OpenApiResponseSchema> };
  paths?: Record<string, Record<string, unknown>>;
}

function loadSpec(): OpenApiSpec {
  const raw = fs.readFileSync(path.resolve(process.cwd(), "openapi.yaml"), "utf-8");
  return yaml.load(raw) as OpenApiSpec;
}

function loadTypesSource(): string {
  return fs.readFileSync(
    path.resolve(process.cwd(), "packages/client/src/types.ts"),
    "utf-8"
  );
}

describe("@neotoma/client StoreResult ↔ openapi.yaml contract", () => {
  it("openapi declares StoreStructuredResponse with top-level `entities`", () => {
    const spec = loadSpec();
    const schema = spec.components?.schemas?.StoreStructuredResponse;
    expect(schema, "StoreStructuredResponse must exist in openapi.yaml").toBeDefined();
    expect(
      schema!.properties?.entities,
      "StoreStructuredResponse.entities must be a top-level property (not nested under `structured`)"
    ).toBeDefined();
  });

  it("StoreResult type in @neotoma/client can read top-level `entities`", () => {
    const source = loadTypesSource();
    // The type must either declare top-level `entities` or be open enough
    // (catch-all `[key: string]: unknown`) that callers can read it. The
    // declaration `[key: string]: unknown` on `StoreResult` is what makes
    // the shape-tolerant pattern in helpers.ts type-check.
    const hasTopLevelEntities = /entities\?: \(?StoredEntityRef|entities\?: \{|entities\?: Array/.test(
      source
    );
    const hasCatchAll = /\[key: string\]: unknown/.test(source);
    expect(
      hasTopLevelEntities || hasCatchAll,
      "StoreResult must either declare `entities` at the top level or use a catch-all index signature so callers can read the actual server response shape"
    ).toBe(true);
  });

  it("helpers.ts reads from top-level `entities` (regression guard for neotoma#316)", () => {
    const helpers = fs.readFileSync(
      path.resolve(process.cwd(), "packages/client/src/helpers.ts"),
      "utf-8"
    );
    // After the fix, helpers tolerate both shapes. The presence of a
    // top-level entities lookup is the regression marker.
    const tolerates =
      /\.entities \?\?\s*[\w.?]+structured\?\.entities|entities: \[\]|entities\?:/.test(helpers);
    expect(
      tolerates,
      "helpers.ts must read top-level `entities` (with fallback to structured.entities) to match the live server response"
    ).toBe(true);
  });

  it("StoreResult.structured shape is optional (legacy)", () => {
    const source = loadTypesSource();
    // The optional `structured?` declaration is fine to keep for legacy
    // compatibility, but it should never be the only path. This test
    // documents that `structured` is optional in the type.
    expect(/structured\?:/.test(source)).toBe(true);
  });
});
