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
  it("Zod request schema accepts canonical_name_fields (ordered precedence)", () => {
    const res = UpdateSchemaIncrementalRequestSchema.safeParse({
      entity_type: "contact",
      canonical_name_fields: [{ composite: ["linkedin_url"] }, "email", "name"],
    });
    expect(res.success).toBe(true);
  });

  it("accepts a canonical_name_fields-only request (no field add/remove)", () => {
    const parsed = UpdateSchemaIncrementalRequestSchema.parse({
      entity_type: "contact",
      canonical_name_fields: ["name"], // legacy flat form
    });
    expect(parsed.canonical_name_fields).toEqual(["name"]);
    expect(parsed.fields_to_add).toBeUndefined();
    expect(parsed.fields_to_remove).toBeUndefined();
  });

  it("still rejects a request that changes nothing", () => {
    expect(UpdateSchemaIncrementalRequestSchema.safeParse({ entity_type: "contact" }).success).toBe(
      false
    );
  });

  it("accepts an empty array at the request layer (service enforces the R2 constraint)", () => {
    // The Zod contract allows []; whether clearing is legal depends on the
    // schema's identity_opt_out and is enforced service-side (see
    // schema_registry_incremental.test.ts), not here.
    expect(
      UpdateSchemaIncrementalRequestSchema.safeParse({
        entity_type: "contact",
        canonical_name_fields: [],
      }).success
    ).toBe(true);
  });

  it("rejects a malformed composite (non-string member), path locatable", () => {
    const res = UpdateSchemaIncrementalRequestSchema.safeParse({
      entity_type: "contact",
      canonical_name_fields: [{ composite: [42] }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects the likely bare-string composite mistake with a locatable path", () => {
    const res = UpdateSchemaIncrementalRequestSchema.safeParse({
      entity_type: "contact",
      canonical_name_fields: [{ composite: "linkedin_url" }],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("canonical_name_fields"))).toBe(true);
    }
  });

  it("OpenAPI spec declares canonical_name_fields on the request body", () => {
    const yaml = readFileSync(join(repoRoot, "openapi.yaml"), "utf8");
    const idx = yaml.indexOf("/update_schema_incremental:");
    expect(idx).toBeGreaterThan(-1);
    // Bound to the request-body portion (before the `responses:` marker) so
    // this asserts the *request* declaration specifically.
    const opBlock = yaml.slice(idx);
    const reqBlock = opBlock.slice(0, opBlock.indexOf("\n      responses:"));
    expect(reqBlock).toContain("canonical_name_fields");
    expect(reqBlock).toContain("composite");
  });

  it("OpenAPI spec declares the echoed canonical_name_fields on the response body (MUST #6)", () => {
    // The handler echoes the resolved rule; the response field this PR adds
    // must be declared, not left to additionalProperties.
    const yaml = readFileSync(join(repoRoot, "openapi.yaml"), "utf8");
    const idx = yaml.indexOf("/update_schema_incremental:");
    const opBlock = yaml.slice(idx);
    const respStart = opBlock.indexOf("\n      responses:");
    expect(respStart).toBeGreaterThan(-1);
    // Bound the response window to this operation (stop at the next path).
    const nextPath = opBlock.indexOf("\n  /register_schema:");
    const respBlock = opBlock.slice(respStart, nextPath > -1 ? nextPath : undefined);
    expect(respBlock).toContain("canonical_name_fields");
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
