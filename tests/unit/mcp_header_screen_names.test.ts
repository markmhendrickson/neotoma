/**
 * neotoma#2070 — the `Mcp-Method` / `Mcp-Name` screen must never reject a
 * legitimate name, and must reject anything not shaped like one.
 *
 * `Mcp-Name` is required on every 2026-07-28 `tools/call`, `resources/read`
 * and `prompts/get`. If the screen rejected a real tool name, that tool would
 * become uncallable on the modern path with an error that does not point at
 * the cause. So every tool this server registers, every JSON-RPC method it
 * serves, and every resource URI form it serves is run through the screen
 * here: a new tool whose name trips it fails this test instead of failing in
 * production.
 *
 * The screen is a positive grammar (a method, a tool/prompt name, or a URI in
 * a scheme this server serves) on top of a denylist of credential and
 * personal-data shapes. The evasion cases are encodings the denylist alone
 * let through.
 */

import type { Request } from "express";
import { describe, expect, it } from "vitest";

import { screenMcpStandardHeaders } from "../../src/mcp_http_stateless.js";
import { buildToolDefinitions } from "../../src/tool_definitions.js";

function screen(headers: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return screenMcpStandardHeaders({ headers: lower } as unknown as Request);
}

function sentinel(value: string): string {
  return `=?base64?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

const SERVED_METHODS = [
  "initialize",
  "ping",
  "server/discover",
  "tools/list",
  "tools/call",
  "resources/list",
  "resources/read",
  "resources/templates/list",
  "prompts/list",
  "prompts/get",
  "logging/setLevel",
  "completion/complete",
  "notifications/initialized",
  "notifications/cancelled",
];

// Every resource URI form the server lists or parses (see parseResourceUri in
// src/server.ts), with realistic ids and the supported query parameters.
const RESOURCE_URIS = [
  "neotoma://entities",
  "neotoma://entity_types",
  "neotoma://relationships",
  "neotoma://sources",
  "neotoma://entities/contact",
  "neotoma://entities/contact?limit=10&offset=20&sort=created_at&order=desc",
  "neotoma://entity/ent_99ace4dd6673aa36ed08b1fe",
  "neotoma://entity/ent_99ace4dd6673aa36ed08b1fe/observations",
  "neotoma://entity/ent_99ace4dd6673aa36ed08b1fe/relationships",
  "neotoma://relationships/PART_OF",
  "neotoma://relationships?relationship_type=PART_OF&limit=5",
  "neotoma://source/5f0c2a1e-8b3d-4c6f-9a7e-1d2b3c4d5e6f",
  "neotoma://timeline/2026",
  "neotoma://timeline/2026-09",
  "ui://neotoma/timeline_widget",
  "ui://neotoma/turn-summary",
];

describe("Mcp-Method / Mcp-Name screen admits every legitimate name (#2070)", () => {
  const toolNames = buildToolDefinitions().map((tool) => tool.name);

  it("finds the registered tools (instrument check)", () => {
    expect(toolNames.length).toBeGreaterThan(20);
    expect(toolNames).toContain("store");
    expect(toolNames).toContain("retrieve_entities");
  });

  it("admits every registered tool name, plain and base64-sentinel encoded", () => {
    const rejected = toolNames.filter(
      (name) =>
        screen({ "Mcp-Name": name }) !== null || screen({ "Mcp-Name": sentinel(name) }) !== null
    );
    expect(rejected).toEqual([]);
  });

  it("admits every served JSON-RPC method", () => {
    const rejected = SERVED_METHODS.filter((method) => screen({ "Mcp-Method": method }) !== null);
    expect(rejected).toEqual([]);
  });

  it("admits every served resource URI form", () => {
    const rejected = RESOURCE_URIS.filter((uri) => screen({ "Mcp-Name": uri }) !== null);
    expect(rejected).toEqual([]);
  });

  it("would catch a tool name the screen cannot carry (the sweep can go red)", () => {
    // Shaped like an opaque token: 32+ characters mixing letters and digits.
    expect(screen({ "Mcp-Name": "tool0123456789abcdef0123456789abcdef" })).not.toBeNull();
  });
});

describe("Mcp-Method / Mcp-Name screen rejects values not shaped like a name (#2070)", () => {
  // Synthetic values. None is a real credential or a real person's data.
  const token = "nt2501FakeTokenValue0123456789abcdefXYZ";
  const evasions: Array<{ label: string; header: "Mcp-Method" | "Mcp-Name"; value: string }> = [
    { label: "percent-encoded Bearer", header: "Mcp-Name", value: `Bearer%20${token}` },
    { label: "double base64 sentinel", header: "Mcp-Name", value: sentinel(sentinel(token)) },
    {
      label: "double sentinel around an email",
      header: "Mcp-Name",
      value: sentinel(sentinel("someone.2501@example.com")),
    },
    { label: "dotted token format", header: "Mcp-Name", value: `v2.local.${token}` },
    { label: "braced UUID", header: "Mcp-Name", value: "{3f2c9a10-2501-4c1d-9e8f-0a1b2c3d4e5f}" },
    {
      label: "prefixed UUID",
      header: "Mcp-Name",
      value: "user:3f2c9a10-2501-4c1d-9e8f-0a1b2c3d4e5f",
    },
    { label: "percent-encoded email", header: "Mcp-Name", value: "someone.2501%40example.com" },
    {
      label: "percent-encoded email inside a resource URI",
      header: "Mcp-Name",
      value: "neotoma://entities/someone.2501%40example.com",
    },
    { label: "national-format phone", header: "Mcp-Name", value: "612 345 678" },
    { label: "digits-only phone", header: "Mcp-Name", value: "0612345678" },
    { label: "URI in an unserved scheme", header: "Mcp-Name", value: "https://example.com/x" },
    { label: "method with spaces", header: "Mcp-Method", value: `tools/call ${token}` },
    { label: "percent-encoded method", header: "Mcp-Method", value: "tools%2Fcall" },
  ];

  for (const evasion of evasions) {
    it(`rejects ${evasion.label}`, () => {
      const rejection = screen({ [evasion.header]: evasion.value });
      expect(rejection).not.toBeNull();
      expect(rejection?.header).toBe(evasion.header);
      // The rejection carries a reason and a length, never the value.
      expect(JSON.stringify(rejection)).not.toContain(evasion.value);
    });
  }

  it("leaves an empty value to request validation (reported there as a missing header)", () => {
    expect(screen({ "Mcp-Method": "", "Mcp-Name": "" })).toBeNull();
  });
});
