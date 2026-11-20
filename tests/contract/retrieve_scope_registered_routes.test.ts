/**
 * Registered-route guard for the opt-in agent-grant retrieve scope: every
 * route the Express app actually registers (not only the operations declared
 * in openapi.yaml) must be classified, and the shared gate refuses an
 * unclassified request under a type-limited grant (default deny).
 */

import { describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { extractRoutes } from "../../src/services/route_shadowing.js";
import {
  UNDECLARED_ROUTE_RETRIEVE_CLASS,
  findUnclassifiedRegisteredRoutes,
  retrieveGateTargetForRequest,
} from "../../src/shared/retrieve_scope_classification.js";

describe("retrieve scope registered-route guard", () => {
  const routes = extractRoutes(app);

  it("reads the live route table", () => {
    expect(routes.length).toBeGreaterThan(100);
    expect(routes).toContainEqual({ method: "GET", path: "/turns" });
  });

  it("classifies every registered route", () => {
    expect(findUnclassifiedRegisteredRoutes(routes)).toEqual([]);
  });

  it("fails on a deliberately unclassified registered route", () => {
    expect(
      findUnclassifiedRegisteredRoutes([...routes, { method: "GET", path: "/new_alias/:id" }])
    ).toEqual(["GET /new_alias/:id"]);
  });

  it("gives every undeclared-route entry a reason", () => {
    for (const entry of Object.values(UNDECLARED_ROUTE_RETRIEVE_CLASS)) {
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it("refuses unclassified requests and the undeclared read aliases (default deny)", () => {
    expect(retrieveGateTargetForRequest("GET", "/no_such_route")).toBe("GET /no_such_route");
    for (const [method, path] of [
      ["POST", "/api/issues/status"],
      ["GET", "/sources/src_1/content"],
      ["GET", "/turns"],
      ["GET", "/turns/turn_1"],
      ["GET", "/agents"],
      ["GET", "/agents/agent_1"],
      ["GET", "/agents/agent_1/records"],
      ["GET", "/submit/a/b"],
      ["GET", "/bundles"],
      ["HEAD", "/turns"],
    ]) {
      expect(retrieveGateTargetForRequest(method, path), `${method} ${path}`).not.toBeNull();
    }
  });

  it("lets per-type, exempt and write routes through to their handlers", () => {
    expect(retrieveGateTargetForRequest("GET", "/health")).toBeNull();
    expect(retrieveGateTargetForRequest("POST", "/entities/query")).toBeNull();
    expect(retrieveGateTargetForRequest("GET", "/entities/ent_1")).toBeNull();
    expect(retrieveGateTargetForRequest("POST", "/retrieve_related_entities")).toBeNull();
    expect(retrieveGateTargetForRequest("POST", "/store")).toBeNull();
    expect(retrieveGateTargetForRequest("OPTIONS", "/anything")).toBeNull();
  });

  it("applies the most restrictive class when a static path is also matched by a param path", () => {
    expect(retrieveGateTargetForRequest("GET", "/entities/duplicates")).toBe(
      "listPotentialDuplicates"
    );
  });
});
