/**
 * Classification guard for the structured read log (src/services/read_log.ts).
 *
 * Every read the server serves must be either logged or listed, with a reason,
 * in the read log exclusions table in docs/operations/configuration.md. Reads
 * are: GET routes (declared in openapi.yaml or registered in src/actions.ts),
 * read-type MCP tools, and MCP `resources/read` kinds. A new read that is in
 * neither place fails here, so a missing read path is found by this test
 * rather than by review.
 */
import fs from "node:fs";
import path from "node:path";

import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

import {
  READ_RESOURCE_KINDS,
  READ_TOOL_NAMES,
  resourceReadOperation,
} from "../../src/services/read_log.js";
import { OPENAPI_OPERATION_MAPPINGS } from "../../src/shared/contract_mappings.js";
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

function openApiGetRoutes(): string[] {
  const spec = yaml.load(fs.readFileSync(path.join(ROOT, "openapi.yaml"), "utf8")) as {
    paths: Record<string, Record<string, unknown>>;
  };
  return Object.entries(spec.paths)
    .filter(([, methods]) => methods.get !== undefined)
    .map(([p]) => `GET ${p}`);
}

/** Literal `app.get("...")` and `app.get(["...", ...])` registrations in src/actions.ts. */
function expressGetRoutes(): string[] {
  const source = fs.readFileSync(path.join(ROOT, "src/actions.ts"), "utf8");
  const routes: string[] = [];
  const call = /^\s*app\.get\(\s*(\[[^\]]*\]|(["'`])[^"'`]+\2)/gm;
  let match: RegExpExecArray | null;
  while ((match = call.exec(source)) !== null) {
    for (const literal of match[1]!.matchAll(/["'`]([^"'`]+)["'`]/g)) {
      routes.push(`GET ${literal[1]!.replace(/:([A-Za-z_]+)/g, "{$1}")}`);
    }
  }
  return routes;
}

/** Every `type` parseResourceUri in src/server.ts can return. */
function resourceKinds(): string[] {
  const source = fs.readFileSync(path.join(ROOT, "src/server.ts"), "utf8");
  const start = source.indexOf("private parseResourceUri(");
  expect(start, "parseResourceUri not found in src/server.ts").toBeGreaterThan(-1);
  const body = source.slice(start, source.indexOf("\n  }\n", start));
  return [...new Set([...body.matchAll(/return \{ type: "([a-z_]+)"/g)].map((m) => m[1]!))];
}

/** Operations listed in the docs exclusions table (first column). */
function parseExclusions(markdown: string): Map<string, string> {
  const start = markdown.indexOf("<!-- read-log-exclusions:start -->");
  const end = markdown.indexOf("<!-- read-log-exclusions:end -->");
  if (start < 0 || end < start) throw new Error("read log exclusions table markers not found");
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

interface Inventory {
  routes: string[];
  tools: string[];
  resourceKinds: string[];
}

interface Classification {
  loggedRoutes: Set<string>;
  loggedTools: ReadonlySet<string>;
  loggedResourceKinds: ReadonlySet<string>;
  exclusions: Map<string, string>;
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
  const problems: string[] = [];
  const seenRoutes = new Set<string>();
  for (const route of inv.routes) {
    const [method, p] = route.split(" ") as [string, string];
    const key = routeKey(method, p);
    seenRoutes.add(key);
    const logged = cls.loggedRoutes.has(key);
    const excluded = excludedRoutes.has(key);
    if (!logged && !excluded) problems.push(`unclassified read: ${route}`);
    if (logged && excluded) problems.push(`logged and excluded: ${route}`);
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
  const known = new Set([...readTools, ...inv.resourceKinds.map(resourceReadOperation)]);
  for (const op of excludedOther) {
    if (!known.has(op)) problems.push(`exclusion names no read: ${op}`);
  }
  return problems;
}

function liveInventory(): Inventory {
  return {
    routes: [...new Set([...openApiGetRoutes(), ...expressGetRoutes()])],
    tools: [...NEOTOMA_TOOL_NAMES],
    resourceKinds: resourceKinds(),
  };
}

function liveClassification(): Classification {
  return {
    loggedRoutes: new Set(
      OPENAPI_OPERATION_MAPPINGS.filter((m) => m.readLog === true && m.method === "get").map((m) =>
        routeKey(m.method, m.path)
      )
    ),
    loggedTools: READ_TOOL_NAMES,
    loggedResourceKinds: READ_RESOURCE_KINDS,
    exclusions: parseExclusions(fs.readFileSync(DOC, "utf8")),
  };
}

describe("read log classification guard", () => {
  it("finds the reads it must classify", () => {
    const inv = liveInventory();
    // Instrument check: known reads on each surface are in the inventory.
    expect(inv.routes).toContain("GET /entities/{id}");
    expect(inv.routes).toContain("GET /turns");
    expect(inv.routes).toContain("GET /agents/{key}/records");
    expect(inv.tools).toContain("retrieve_entities");
    expect(inv.resourceKinds).toEqual(expect.arrayContaining(["entity", "source", "entity_types"]));
    expect(liveClassification().exclusions.size).toBeGreaterThan(50);
  });

  it("classifies every GET route, read-type MCP tool and resource kind", () => {
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
        routes: [...inv.routes, "GET /synthetic_records/{id}"],
        tools: [...inv.tools, "fetch_synthetic_records"],
        resourceKinds: [...inv.resourceKinds, "synthetic_collection"],
      },
      cls
    );
    expect(problems).toEqual([
      "unclassified read: GET /synthetic_records/{id}",
      "unclassified read: fetch_synthetic_records",
      "unclassified read: resources/read:synthetic_collection",
    ]);
  });

  it("does not treat a write tool as a read", () => {
    const inv = liveInventory();
    expect(
      unclassifiedReads({ ...inv, tools: [...inv.tools, "store_synthetic"] }, liveClassification())
    ).toEqual([]);
  });

  it("fails on a stale exclusion row and on a row that is also logged", () => {
    const cls = liveClassification();
    const exclusions = new Map(cls.exclusions);
    exclusions.set("GET /retired_synthetic_route", "synthetic");
    exclusions.set("retrieve_entities", "synthetic");
    expect(unclassifiedReads(liveInventory(), { ...cls, exclusions })).toEqual([
      "logged and excluded: retrieve_entities",
      "exclusion names no route: GET /retired_synthetic_route",
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
