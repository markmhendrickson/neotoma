import { describe, it, expect } from "vitest";
import express from "express";
import {
  findShadowedRoutes,
  formatShadowedRouteError,
  extractRoutes,
  assertNoShadowedRoutes,
  type RegisteredRoute,
} from "./route_shadowing.js";

describe("findShadowedRoutes", () => {
  it("flags a static route registered after a param route that matches it", () => {
    // The exact shape of issue #2208.
    const routes: RegisteredRoute[] = [
      { method: "GET", path: "/entities/:id" },
      { method: "GET", path: "/entities/duplicates" },
    ];
    expect(findShadowedRoutes(routes)).toEqual([
      { method: "GET", path: "/entities/duplicates", shadowedBy: "/entities/:id" },
    ]);
  });

  it("accepts the same pair once the static route is registered first", () => {
    const routes: RegisteredRoute[] = [
      { method: "GET", path: "/entities/duplicates" },
      { method: "GET", path: "/entities/:id" },
    ];
    expect(findShadowedRoutes(routes)).toEqual([]);
  });

  it("does not flag across differing HTTP methods", () => {
    // POST /entities/merge is safe under GET /entities/:id.
    const routes: RegisteredRoute[] = [
      { method: "GET", path: "/entities/:id" },
      { method: "POST", path: "/entities/merge" },
    ];
    expect(findShadowedRoutes(routes)).toEqual([]);
  });

  it("does not flag across differing path depths", () => {
    const routes: RegisteredRoute[] = [
      { method: "GET", path: "/entities/:id" },
      { method: "GET", path: "/entities/duplicates/summary" },
    ];
    expect(findShadowedRoutes(routes)).toEqual([]);
  });

  it("matches a param in any position, not just the last segment", () => {
    const routes: RegisteredRoute[] = [
      { method: "GET", path: "/entities/:id/observations" },
      { method: "GET", path: "/entities/duplicates/observations" },
    ];
    expect(findShadowedRoutes(routes)).toHaveLength(1);
  });

  it("treats a wildcard segment as a param", () => {
    const routes: RegisteredRoute[] = [
      { method: "GET", path: "/files/*" },
      { method: "GET", path: "/files/manifest" },
    ];
    expect(findShadowedRoutes(routes)).toHaveLength(1);
  });

  it("reports each shadowed route once, naming the first shadowing route", () => {
    const routes: RegisteredRoute[] = [
      { method: "GET", path: "/entities/:id" },
      { method: "GET", path: "/entities/:slug" },
      { method: "GET", path: "/entities/duplicates" },
    ];
    const shadowed = findShadowedRoutes(routes);
    expect(shadowed).toHaveLength(1);
    expect(shadowed[0].shadowedBy).toBe("/entities/:id");
  });

  it("returns nothing for a table with no static/param collisions", () => {
    const routes: RegisteredRoute[] = [
      { method: "GET", path: "/health" },
      { method: "GET", path: "/entities" },
      { method: "POST", path: "/entities/query" },
      { method: "GET", path: "/entities/duplicates" },
      { method: "GET", path: "/entities/:id" },
    ];
    expect(findShadowedRoutes(routes)).toEqual([]);
  });
});

describe("formatShadowedRouteError", () => {
  it("names both halves of the pair and the remedy", () => {
    const message = formatShadowedRouteError([
      { method: "GET", path: "/entities/duplicates", shadowedBy: "/entities/:id" },
    ]);
    expect(message).toContain("/entities/duplicates");
    expect(message).toContain("/entities/:id");
    expect(message).toContain("unreachable");
    expect(message).toContain("Move it earlier");
  });
});

describe("extractRoutes", () => {
  it("reads a real Express app's routes in registration order", () => {
    const app = express();
    app.get("/entities/duplicates", (_req, res) => res.json({}));
    app.get("/entities/:id", (_req, res) => res.json({}));
    const routes = extractRoutes(app);
    const paths = routes.filter((r) => r.method === "GET").map((r) => r.path);
    expect(paths).toEqual(["/entities/duplicates", "/entities/:id"]);
  });

  it("returns an empty list for an unrecognized router shape", () => {
    expect(extractRoutes({})).toEqual([]);
    expect(extractRoutes(null)).toEqual([]);
  });
});

describe("assertNoShadowedRoutes", () => {
  it("throws on a shadowed route, naming the pair", () => {
    const app = express();
    app.get("/entities/:id", (_req, res) => res.json({}));
    app.get("/entities/duplicates", (_req, res) => res.json({}));
    expect(() => assertNoShadowedRoutes(app)).toThrow(/entities\/duplicates/);
    expect(() => assertNoShadowedRoutes(app)).toThrow(/entities\/:id/);
  });

  it("passes when static routes precede their param route", () => {
    const app = express();
    app.get("/entities/duplicates", (_req, res) => res.json({}));
    app.get("/entities/:id", (_req, res) => res.json({}));
    expect(() => assertNoShadowedRoutes(app)).not.toThrow();
  });

  it("is a no-op when the route table cannot be read", () => {
    // A guard that cannot introspect the router must not cause an outage.
    expect(() => assertNoShadowedRoutes({})).not.toThrow();
  });
});
