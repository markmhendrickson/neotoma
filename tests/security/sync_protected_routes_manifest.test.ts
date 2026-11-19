import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { generateRoutes } from "../../scripts/security/sync_protected_routes_manifest.js";

interface Row {
  path: string;
  method: string;
  requires_auth: boolean;
  sandbox_allowed: string;
  expected_no_auth_status: number[];
  expected_invalid_auth_status: number[];
  runtime_only?: boolean;
}

function rowFor(security: unknown): Row {
  const openapi = {
    security: [{ bearerAuth: [] }],
    paths: {
      "/example": {
        get: { operationId: "getExample", ...(security === undefined ? {} : { security }) },
      },
    },
  };
  const rows = (generateRoutes(openapi) as Row[]).filter((r) => !r.runtime_only);
  expect(rows).toHaveLength(1);
  return rows[0];
}

describe("sync_protected_routes_manifest generateRoutes", () => {
  it("records optional authentication ([{bearerAuth: []}, {}]) as a public route expecting 200", () => {
    const row = rowFor([{ bearerAuth: [] }, {}]);
    expect(row.requires_auth).toBe(false);
    expect(row.sandbox_allowed).toBe("hosted_ok");
    expect(row.expected_no_auth_status).toEqual([200]);
    expect(row.expected_invalid_auth_status).toEqual([200]);
  });

  it("still records a bearer-only operation as requiring auth", () => {
    const row = rowFor([{ bearerAuth: [] }]);
    expect(row.requires_auth).toBe(true);
    expect(row.expected_no_auth_status).toEqual([401]);
  });

  it("inherits the global bearer requirement when the operation declares none", () => {
    expect(rowFor(undefined).requires_auth).toBe(true);
  });

  it("keeps security: [] public with the generic open statuses", () => {
    const row = rowFor([]);
    expect(row.requires_auth).toBe(false);
    expect(row.expected_no_auth_status).toEqual([200, 400, 404, 405]);
  });
});
