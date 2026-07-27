/**
 * #2018 — cross-surface parity for the update_schema_incremental
 * `canonical_name_fields` parameter.
 *
 * The capability must be reachable from every surface that exposes
 * update_schema_incremental, not just MCP/HTTP. This guards the failure mode
 * the standing parity gate exists for: a capability added to some surfaces but
 * silently missing from another (the source_storage:'reference' incomplete
 * rollout). Here the at-risk surface is the CLI (`schemas update`), whose flag
 * parsing is separate from the Zod/OpenAPI request contract.
 *
 * Surfaces asserted:
 *   1. Zod request schema (action_schemas) — accepts it.
 *   2. OpenAPI request body (openapi.yaml, via generated types + raw spec) — declares it.
 *   3. CLI (`schemas update`) — declares the --canonical-name-fields flag and
 *      forwards it to the request body key `canonical_name_fields`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { UpdateSchemaIncrementalRequestSchema } from "../../src/shared/action_schemas.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

describe("update_schema_incremental canonical_name_fields — cross-surface parity (#2018)", () => {
  it("Zod request schema accepts canonical_name_fields", () => {
    const res = UpdateSchemaIncrementalRequestSchema.safeParse({
      entity_type: "contact",
      canonical_name_fields: [{ composite: ["linkedin_url"] }, "email", "name"],
    });
    expect(res.success).toBe(true);
  });

  it("OpenAPI spec declares canonical_name_fields on the request body", () => {
    const yaml = readFileSync(join(repoRoot, "openapi.yaml"), "utf8");
    const idx = yaml.indexOf("/update_schema_incremental:");
    expect(idx).toBeGreaterThan(-1);
    // Look only within a window after the path declaration so we don't match
    // an unrelated occurrence elsewhere in the spec.
    const window = yaml.slice(idx, idx + 4000);
    expect(window).toContain("canonical_name_fields");
    expect(window).toContain("composite");
  });

  it("CLI 'schemas update' declares the flag and forwards it to the body key", () => {
    const cli = readFileSync(join(repoRoot, "src", "cli", "index.ts"), "utf8");
    // The user-facing flag must exist...
    expect(cli).toContain("--canonical-name-fields <json>");
    // ...and be wired to the same request-body key the service/OpenAPI use.
    expect(cli).toContain("body.canonical_name_fields = canonicalNameFields");
  });

  it("CLI requires at least one operation including canonical_name_fields", () => {
    // Regression guard: the require-one check must accept a canonical-only call,
    // otherwise a CLI user still can't re-key without also touching fields.
    const cli = readFileSync(join(repoRoot, "src", "cli", "index.ts"), "utf8");
    expect(cli).toContain("!opts.canonicalNameFields");
  });
});
