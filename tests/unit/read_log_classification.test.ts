/**
 * Classification guard for the structured read log (src/services/read_log.ts).
 *
 * Every operation the server serves is classified as exactly one of: a logged
 * read, an excluded read (a row with a reason in the read log exclusions table
 * in docs/operations/configuration.md), or a write or operation that returns
 * no entity data (by the write rule in `isWriteRoute` / `isWriteTool`, or a row
 * in the non-reads table). Operations are: every method of every path in
 * openapi.yaml, every `app.get/post/put/patch/delete` registration in
 * src/actions.ts, every MCP tool and every MCP `resources/read` kind. A new
 * operation in none of these fails here, so a missing read path is found by
 * this test rather than by review.
 */
import fs from "node:fs";
import path from "node:path";

import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

import {
  READ_LOG_ROUTES,
  READ_RESOURCE_KINDS,
  READ_TOOL_NAMES,
  resourceReadOperation,
} from "../../src/services/read_log.js";
import { NEOTOMA_TOOL_NAMES } from "../../src/tool_definitions.js";

const ROOT = process.cwd();
const DOC = path.join(ROOT, "docs/operations/configuration.md");

/** Tool name prefixes that mark a write. Any other tool is treated as a read. */
const WRITE_VERBS = [
  "store",
  "correct",
  "create",
  "delete",
  "restore",
  "merge",
  "split",
  "register",
  "update",
  "submit",
  "add",
  "remove",
  "sync",
  "subscribe",
  "unsubscribe",
  "resolve",
  "publish",
  "patch",
];

function isWriteTool(name: string): boolean {
  return WRITE_VERBS.some((verb) => name === verb || name.startsWith(`${verb}_`));
}

/** `GET /entities/{id}` and `GET /Entities/{x}/` compare equal. */
function routeKey(method: string, routePath: string): string {
  const normalized = routePath
    .replace(/\{[^}]+\}/g, "{}")
    .replace(/(.)\/$/, "$1")
    .toLowerCase();
  return `${method.toUpperCase()} ${normalized}`;
}

/** HTTP methods the guard inventories. */
const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/** One HTTP operation: method, path and, when declared in openapi.yaml, its operationId. */
interface RouteOp {
  method: string;
  path: string;
  operationId?: string;
}

/** Every operation in openapi.yaml, all methods. */
function openApiRoutes(): RouteOp[] {
  const spec = yaml.load(fs.readFileSync(path.join(ROOT, "openapi.yaml"), "utf8")) as {
    paths: Record<string, Record<string, { operationId?: string } | undefined>>;
  };
  const routes: RouteOp[] = [];
  for (const [p, methods] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const op = methods[method];
      if (op !== undefined)
        routes.push({ method: method.toUpperCase(), path: p, operationId: op.operationId });
    }
  }
  return routes;
}

/**
 * Literal `app.<method>("...")` and `app.<method>(["...", ...])` registrations
 * in src/actions.ts, for get, post, put, patch and delete.
 */
function expressRoutes(): RouteOp[] {
  const source = fs.readFileSync(path.join(ROOT, "src/actions.ts"), "utf8");
  const routes: RouteOp[] = [];
  const call = /^\s*app\.(get|post|put|patch|delete)\(\s*(\[[^\]]*\]|(["'`])[^"'`]+\3)/gm;
  let match: RegExpExecArray | null;
  while ((match = call.exec(source)) !== null) {
    for (const literal of match[2]!.matchAll(/["'`]([^"'`]+)["'`]/g)) {
      routes.push({
        method: match[1]!.toUpperCase(),
        path: literal[1]!.replace(/:([A-Za-z_]+)/g, "{$1}"),
      });
    }
  }
  return routes;
}

/** OpenAPI and Express operations merged on method and path; the OpenAPI operationId wins. */
function allRoutes(): RouteOp[] {
  const byKey = new Map<string, RouteOp>();
  for (const route of [...openApiRoutes(), ...expressRoutes()]) {
    const key = routeKey(route.method, route.path);
    const existing = byKey.get(key);
    if (existing === undefined) byKey.set(key, route);
    else if (existing.operationId === undefined && route.operationId !== undefined)
      byKey.set(key, route);
  }
  return [...byKey.values()];
}

/**
 * Leading verbs that mark a POST operation as a write that returns no entity
 * records for an agent to read. The verb is the first word of the
 * operationId (`createAgentGrant` gives `create`) or, for a route that
 * openapi.yaml does not declare, the first word of its last literal path
 * segment (`/issues/bulk_close` gives `bulk`, `/entities/merge` gives `merge`).
 */
const WRITE_ROUTE_VERBS = new Set([
  ...WRITE_VERBS,
  "revoke",
  "suspend",
  "batch",
  "bulk",
  "recompute",
  "apply",
]);

/**
 * True for an operation the guard treats as a write: PUT, PATCH and DELETE
 * always, and POST when its leading verb is in WRITE_ROUTE_VERBS. GET is
 * never a write. Any other POST must be logged or listed in a table.
 */
function isWriteRoute(route: RouteOp): boolean {
  const method = route.method.toUpperCase();
  if (method === "PUT" || method === "PATCH" || method === "DELETE") return true;
  if (method !== "POST") return false;
  let verb: string | undefined;
  if (route.operationId) {
    verb = /^[a-z]+/.exec(route.operationId)?.[0];
  } else {
    const segments = route.path.split("/").filter((s) => s.length > 0 && !s.startsWith("{"));
    verb = segments.at(-1)?.split(/[_-]/)[0]?.toLowerCase();
  }
  return verb !== undefined && WRITE_ROUTE_VERBS.has(verb);
}

/** Every `type` parseResourceUri in src/server.ts can return. */
function resourceKinds(): string[] {
  const source = fs.readFileSync(path.join(ROOT, "src/server.ts"), "utf8");
  const start = source.indexOf("private parseResourceUri(");
  expect(start, "parseResourceUri not found in src/server.ts").toBeGreaterThan(-1);
  const body = source.slice(start, source.indexOf("\n  }\n", start));
  return [...new Set([...body.matchAll(/return \{ type: "([a-z_]+)"/g)].map((m) => m[1]!))];
}

/**
 * Operations listed in a marked docs table (first column), with their reasons:
 * `read-log-exclusions` (reads that are not logged) or `read-log-non-reads`
 * (writes and operations that return no entity data).
 */
function parseExclusions(
  markdown: string,
  table: "read-log-exclusions" | "read-log-non-reads" = "read-log-exclusions"
): Map<string, string> {
  const start = markdown.indexOf(`<!-- ${table}:start -->`);
  const end = markdown.indexOf(`<!-- ${table}:end -->`);
  if (start < 0 || end < start) throw new Error(`${table} table markers not found`);
  const rows = new Map<string, string>();
  for (const line of markdown.slice(start, end).split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    const op = /^`([^`]+)`$/.exec(cells[1] ?? "");
    if (!op) continue;
    const reason = cells[3] ?? "";
    if (reason.length === 0) throw new Error(`exclusion ${op[1]} has no reason`);
    rows.set(op[1]!, reason);
  }
  return rows;
}

/** Calls that gate a route on the caller's retrieve capability (src/actions.ts). */
const RETRIEVE_GATE = /\benforceRetrieveForEntity(?:Ids|Types)\s*\(/;

/**
 * Routes whose handler calls `enforceRetrieveForEntityIds` or
 * `enforceRetrieveForEntityTypes`, directly or through a top-level function
 * of the same file that does (followed to a fixed point). A route gated on
 * retrieve returns entity data, so it must be logged or excluded with a
 * reason; the non-reads table does not cover it.
 */
function retrieveGatedRoutes(source: string): RouteOp[] {
  const lines = source.split("\n");
  const blockEnd = (start: number): number => {
    if (/\);\s*$/.test(lines[start]!)) return start;
    for (let i = start + 1; i < lines.length; i++) if (/^\}\)?;?\s*$/.test(lines[i]!)) return i;
    return lines.length - 1;
  };
  const functions = new Map<string, string>();
  const declaration =
    /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)|^(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\(|function)/;
  lines.forEach((line, i) => {
    const m = declaration.exec(line);
    if (m) functions.set((m[1] ?? m[2])!, lines.slice(i, blockEnd(i) + 1).join("\n"));
  });
  const gated = new Set<string>();
  const callsGated = (body: string) =>
    RETRIEVE_GATE.test(body) || [...gated].some((name) => new RegExp(`\\b${name}\\b`).test(body));
  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, body] of functions) {
      if (!gated.has(name) && callsGated(body.slice(body.indexOf(name) + name.length))) {
        gated.add(name);
        changed = true;
      }
    }
  }
  const routes: RouteOp[] = [];
  lines.forEach((line, i) => {
    const m = /^app\.(get|post|put|patch|delete)\(\s*(\[[^\]]*\]|(["'`])[^"'`]+\3)/.exec(line);
    if (!m) return;
    if (!callsGated(lines.slice(i, blockEnd(i) + 1).join("\n"))) return;
    for (const literal of m[2]!.matchAll(/["'`]([^"'`]+)["'`]/g)) {
      routes.push({
        method: m[1]!.toUpperCase(),
        path: literal[1]!.replace(/:([A-Za-z_]+)/g, "{$1}"),
      });
    }
  });
  return routes;
}

/** Retrieve-gated routes that are neither logged nor in the exclusions table. */
function unloggedGatedRoutes(gatedRoutes: RouteOp[], cls: Classification): string[] {
  const excluded = new Set<string>();
  for (const op of cls.exclusions.keys()) {
    const m = /^([A-Z]+) (\/.*)$/.exec(op);
    if (m) excluded.add(routeKey(m[1]!, m[2]!));
  }
  return gatedRoutes
    .filter((r) => {
      const key = routeKey(r.method, r.path);
      return !cls.loggedRoutes.has(key) && !excluded.has(key);
    })
    .map((r) => `retrieve-gated route not logged or excluded: ${r.method} ${r.path}`);
}

interface Inventory {
  routes: RouteOp[];
  tools: string[];
  resourceKinds: string[];
}

interface Classification {
  loggedRoutes: Set<string>;
  loggedTools: ReadonlySet<string>;
  loggedResourceKinds: ReadonlySet<string>;
  exclusions: Map<string, string>;
  /** Operations in the non-reads table: writes and operations returning no entity data. */
  nonReads: Map<string, string>;
}

/**
 * Reads that are neither logged nor excluded, plus exclusions that name no
 * existing read or name a logged one. Empty means every read is classified.
 */
function unclassifiedReads(inv: Inventory, cls: Classification): string[] {
  const excludedRoutes = new Set<string>();
  const excludedOther = new Set<string>();
  for (const op of cls.exclusions.keys()) {
    const m = /^([A-Z]+) (\/.*)$/.exec(op);
    if (m) excludedRoutes.add(routeKey(m[1]!, m[2]!));
    else excludedOther.add(op);
  }
  const nonReadRoutes = new Set<string>();
  for (const op of cls.nonReads.keys()) {
    const m = /^([A-Z]+) (\/.*)$/.exec(op);
    if (!m) throw new Error(`non-read row is not an HTTP operation: ${op}`);
    nonReadRoutes.add(routeKey(m[1]!, m[2]!));
  }
  const problems: string[] = [];
  const seenRoutes = new Set<string>();
  for (const route of inv.routes) {
    const key = routeKey(route.method, route.path);
    const label = `${route.method.toUpperCase()} ${route.path}`;
    seenRoutes.add(key);
    const logged = cls.loggedRoutes.has(key);
    const excluded = excludedRoutes.has(key);
    const nonRead = nonReadRoutes.has(key);
    if (!logged && !excluded && !nonRead && !isWriteRoute(route)) {
      problems.push(`unclassified read: ${label}`);
    }
    if (logged && excluded) problems.push(`logged and excluded: ${label}`);
    if (nonRead && (logged || excluded))
      problems.push(`non-read row also classified as read: ${label}`);
  }
  const readTools = inv.tools.filter((t) => !isWriteTool(t));
  for (const tool of readTools) {
    const logged = cls.loggedTools.has(tool);
    const excluded = excludedOther.has(tool);
    if (!logged && !excluded) problems.push(`unclassified read: ${tool}`);
    if (logged && excluded) problems.push(`logged and excluded: ${tool}`);
  }
  for (const kind of inv.resourceKinds) {
    const op = resourceReadOperation(kind);
    const logged = cls.loggedResourceKinds.has(kind);
    const excluded = excludedOther.has(op);
    if (!logged && !excluded) problems.push(`unclassified read: ${op}`);
    if (logged && excluded) problems.push(`logged and excluded: ${op}`);
  }
  for (const key of excludedRoutes) {
    if (!seenRoutes.has(key)) problems.push(`exclusion names no route: ${key}`);
  }
  for (const key of nonReadRoutes) {
    if (!seenRoutes.has(key)) problems.push(`non-read row names no route: ${key}`);
  }
  const known = new Set([...readTools, ...inv.resourceKinds.map(resourceReadOperation)]);
  for (const op of excludedOther) {
    if (!known.has(op)) problems.push(`exclusion names no read: ${op}`);
  }
  return problems;
}

function liveInventory(): Inventory {
  return {
    routes: allRoutes(),
    tools: [...NEOTOMA_TOOL_NAMES],
    resourceKinds: resourceKinds(),
  };
}

function liveClassification(): Classification {
  return {
    loggedRoutes: new Set(READ_LOG_ROUTES.map((m) => routeKey(m.method, m.path))),
    loggedTools: READ_TOOL_NAMES,
    loggedResourceKinds: READ_RESOURCE_KINDS,
    exclusions: parseExclusions(fs.readFileSync(DOC, "utf8")),
    nonReads: parseExclusions(fs.readFileSync(DOC, "utf8"), "read-log-non-reads"),
  };
}

describe("read log classification guard", () => {
  it("finds the reads it must classify", () => {
    const inv = liveInventory();
    const labels = inv.routes.map((r) => `${r.method} ${r.path}`);
    // Instrument check: known operations on each surface and method are in the inventory.
    expect(labels).toContain("GET /entities/{id}");
    expect(labels).toContain("GET /turns");
    expect(labels).toContain("GET /agents/{key}/records");
    expect(labels).toContain("POST /entities/query");
    expect(labels).toContain("POST /sync/entities");
    expect(labels).toContain("PATCH /agents/grants/{id}");
    expect(labels).toContain("DELETE /peers/{peer_id}");
    // A route registered only in src/actions.ts, not declared in openapi.yaml.
    expect(labels).toContain("POST /submit/{entity_type}/{entity_id}/message");
    expect(inv.tools).toContain("retrieve_entities");
    expect(inv.resourceKinds).toEqual(expect.arrayContaining(["entity", "source", "entity_types"]));
    expect(liveClassification().exclusions.size).toBeGreaterThan(50);
  });

  it("classifies every HTTP operation, read-type MCP tool and resource kind", () => {
    expect(unclassifiedReads(liveInventory(), liveClassification())).toEqual([]);
  });

  it("logs every resource kind in READ_RESOURCE_KINDS that the server can return", () => {
    const kinds = new Set(resourceKinds());
    for (const kind of READ_RESOURCE_KINDS) expect(kinds.has(kind), kind).toBe(true);
  });

  it("fails on a deliberately unclassified fake operation on each surface", () => {
    const inv = liveInventory();
    const cls = liveClassification();
    const problems = unclassifiedReads(
      {
        routes: [
          ...inv.routes,
          { method: "GET", path: "/synthetic_records/{id}" },
          {
            method: "POST",
            path: "/synthetic_records/query",
            operationId: "querySyntheticRecords",
          },
          { method: "POST", path: "/synthetic_lookup" },
        ],
        tools: [...inv.tools, "fetch_synthetic_records"],
        resourceKinds: [...inv.resourceKinds, "synthetic_collection"],
      },
      cls
    );
    expect(problems).toEqual([
      "unclassified read: GET /synthetic_records/{id}",
      "unclassified read: POST /synthetic_records/query",
      "unclassified read: POST /synthetic_lookup",
      "unclassified read: fetch_synthetic_records",
      "unclassified read: resources/read:synthetic_collection",
    ]);
  });

  it("does not treat a write tool or a write route as a read", () => {
    const inv = liveInventory();
    expect(
      unclassifiedReads(
        {
          ...inv,
          routes: [
            ...inv.routes,
            { method: "POST", path: "/synthetic_things", operationId: "createSyntheticThing" },
            { method: "POST", path: "/synthetic_things/{id}/revoke" },
            { method: "DELETE", path: "/synthetic_things/{id}" },
            { method: "PATCH", path: "/synthetic_things/{id}" },
          ],
          tools: [...inv.tools, "store_synthetic"],
        },
        liveClassification()
      )
    ).toEqual([]);
  });

  it("fails on a stale exclusion row and on a row that is also logged", () => {
    const cls = liveClassification();
    const exclusions = new Map(cls.exclusions);
    exclusions.set("GET /retired_synthetic_route", "synthetic");
    exclusions.set("retrieve_entities", "synthetic");
    const nonReads = new Map(cls.nonReads);
    nonReads.set("POST /retired_synthetic_write", "synthetic");
    nonReads.set("POST /entities/query", "synthetic");
    expect(unclassifiedReads(liveInventory(), { ...cls, exclusions, nonReads })).toEqual([
      "non-read row also classified as read: POST /entities/query",
      "logged and excluded: retrieve_entities",
      "exclusion names no route: GET /retired_synthetic_route",
      "non-read row names no route: POST /retired_synthetic_write",
    ]);
  });

  it("logs or excludes every route gated on the retrieve capability", () => {
    const gated = retrieveGatedRoutes(fs.readFileSync(path.join(ROOT, "src/actions.ts"), "utf8"));
    const labels = gated.map((r) => `${r.method} ${r.path}`);
    // Instrument check: known gated routes are found.
    expect(labels).toEqual(
      expect.arrayContaining([
        "GET /entities/{id}",
        "GET /entities/{id}/markdown",
        "GET /entities/{id}/html",
        "POST /get_entity_snapshot",
      ])
    );
    expect(unloggedGatedRoutes(gated, liveClassification())).toEqual([]);
  });

  it("fails on a synthetic retrieve-gated handler that is not logged or excluded", () => {
    const source = [
      'app.get("/synthetic_gated/:id", async (req, res) => {',
      "  await enforceRetrieveForEntityIds([req.params.id], userId);",
      "  return res.json({});",
      "});",
      "async function syntheticGatedHelper(req, res) {",
      '  enforceRetrieveForEntityTypes(["task"]);',
      "  return res.json({});",
      "}",
      'app.post("/synthetic_gated_indirect", syntheticGatedHelper);',
      'app.get("/synthetic_open", async (_req, res) => {',
      "  return res.json({});",
      "});",
    ].join("\n");
    expect(unloggedGatedRoutes(retrieveGatedRoutes(source), liveClassification())).toEqual([
      "retrieve-gated route not logged or excluded: GET /synthetic_gated/{id}",
      "retrieve-gated route not logged or excluded: POST /synthetic_gated_indirect",
    ]);
  });

  it("rejects an exclusion row with no reason", () => {
    const md = [
      "<!-- read-log-exclusions:start -->",
      "| Read | Surface | Reason |",
      "| --- | --- | --- |",
      "| `GET /synthetic` | rest |  |",
      "<!-- read-log-exclusions:end -->",
    ].join("\n");
    expect(() => parseExclusions(md)).toThrow(/no reason/);
  });
});
