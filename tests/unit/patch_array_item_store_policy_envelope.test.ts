/**
 * Structural guard: `/patch_array_item` (HTTP and MCP) must map
 * `StorePolicyDeniedError` to the same structured envelope `/correct` uses,
 * not the generic 500/InternalError fallthrough.
 *
 * `patchArrayItem()` writes through `createCorrection` exactly like
 * `correct()` (both are `assertStorePolicyAllows`-gated per
 * `tests/unit/instance_policy_write_path_coverage.test.ts`), so an instance
 * policy that denies a write must be able to deny one reached via
 * `patch_array_item` too. Enforcement itself is already covered by that
 * write-path guard; this test covers the DISTINCT failure mode of the
 * enforcement firing correctly but the error being swallowed into a generic
 * envelope on its way back to the caller — which reads as a server fault
 * instead of a policy rejection an agent should branch on.
 *
 * Source-scan rather than behavioral for the same reason
 * `instance_policy_write_path_coverage.test.ts` gives: exercising this
 * through a live policy-denied request would prove only one of the two
 * transports (HTTP or MCP) on a given run, and the other could silently
 * regress without a failing test.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf-8");

describe("patch_array_item maps StorePolicyDeniedError like its correct() sibling", () => {
  it("the HTTP /patch_array_item handler branches on StorePolicyDeniedError", () => {
    const source = read("src/actions.ts");
    const routeStart = source.indexOf('app.post("/patch_array_item"');
    expect(routeStart, '/patch_array_item route not found — was it renamed?').toBeGreaterThan(-1);
    // Bound the handler at the next top-level route registration so the scan
    // does not accidentally match /correct's own StorePolicyDeniedError branch
    // (which appears earlier in the same file).
    const nextRoute = source.indexOf('app.post("/get_authenticated_user"', routeStart);
    expect(nextRoute, "could not bound the /patch_array_item handler").toBeGreaterThan(routeStart);
    const handler = source.slice(routeStart, nextRoute);

    expect(
      handler.includes("StorePolicyDeniedError"),
      "the /patch_array_item catch block must branch on StorePolicyDeniedError " +
        "(same as /correct) or a policy denial falls through to the generic " +
        "500 DB_QUERY_FAILED handler instead of 400"
    ).toBe(true);

    expect(
      handler.includes("StorePolicyUnavailableError"),
      "the /patch_array_item catch block must distinguish unreadable policy from denial"
    ).toBe(true);
    expect(handler.slice(handler.indexOf("StorePolicyUnavailableError"))).toContain("status(503)");

    const branch = handler.slice(handler.indexOf("StorePolicyDeniedError"));
    expect(
      branch.indexOf("status(400)"),
      "the StorePolicyDeniedError branch must return 400, matching /correct"
    ).toBeGreaterThan(-1);
  });

  it("the MCP patchArrayItem() handler re-throws StorePolicyDeniedError unwrapped", () => {
    const source = read("src/server.ts");
    const start = source.indexOf("private async patchArrayItem(");
    expect(start, "patchArrayItem() not found — was it renamed?").toBeGreaterThan(-1);
    const nextMethod = source.indexOf("handlePublishRenderedPage", start);
    expect(nextMethod, "could not bound patchArrayItem()").toBeGreaterThan(start);
    const method = source.slice(start, nextMethod);

    expect(
      method.includes("StorePolicyDeniedError"),
      "patchArrayItem()'s inner catch must re-throw StorePolicyDeniedError " +
        "unwrapped (like EntityOwnerConflictError) so the outer executeTool " +
        "dispatcher's dedicated branch maps it to a structured envelope, " +
        "instead of generalizing it into a generic McpError(InternalError, ...) " +
        "first"
    ).toBe(true);

    expect(
      method.includes("StorePolicyUnavailableError"),
      "patchArrayItem()'s inner catch must also re-throw StorePolicyUnavailableError " +
        "unwrapped, so an unreadable policy is distinguishable from a policy denial"
    ).toBe(true);
  });
});
