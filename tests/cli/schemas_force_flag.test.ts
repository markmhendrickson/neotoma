/**
 * #2197 / #2446: `force` must be reachable from the CLI, not only MCP and REST.
 *
 * `neotoma schemas update` and `neotoma schemas register` are the commands a
 * CLI user is on when the entity-type naming guard rejects a name. These tests
 * run the real command parser against a local capture server and assert the
 * request body that would reach the API, so a dropped flag or a dropped body
 * key both fail. (A source-text match on `src/cli/index.ts` would not catch a
 * flag that is declared but never forwarded.)
 */

import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/cli/index.ts";

const MISSING_TYPE = "force_flag_missing_probe";

type Captured = { method: string; url: string; body: Record<string, unknown> };

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

describe("CLI schemas --force wiring (#2197)", () => {
  let server: Server;
  let baseUrl: string;
  const captured: Captured[] = [];

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const body = await readBody(req);
      captured.push({ method: req.method ?? "", url: req.url ?? "", body });
      res.setHeader("Content-Type", "application/json");
      if (req.method === "GET" && req.url?.startsWith(`/schemas/${MISSING_TYPE}`)) {
        // No schema for this type: `schemas update` falls back to a
        // /register_schema bootstrap call.
        res.statusCode = 404;
        res.end(JSON.stringify({ error: { error_code: "NOT_FOUND", message: "no schema" } }));
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/schemas/")) {
        // `schemas update` reads the existing schema first; report one so the
        // command takes the update_schema_incremental path.
        res.end(JSON.stringify({ entity_type: "force_flag_probe", schema_version: "1.0" }));
        return;
      }
      res.end(JSON.stringify({ success: true }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function run(args: string[]): Promise<Captured> {
    const before = captured.length;
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const prevExit = process.exitCode;
    try {
      await runCli(["node", "neotoma", "--json", "--api-only", "--base-url", baseUrl, ...args]);
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
      process.exitCode = prevExit;
    }
    const post = captured.slice(before).find((c) => c.method === "POST");
    if (!post) throw new Error(`no POST captured for: ${args.join(" ")}`);
    return post;
  }

  const fields = JSON.stringify([{ field_name: "note", field_type: "string" }]);
  const registerFields = JSON.stringify({ note: { type: "string" } });

  it("schemas update --force sends force: true to /update_schema_incremental; omitted sends false", async () => {
    const withFlag = await run([
      "schemas",
      "update",
      "force_flag_probe",
      "--fields",
      fields,
      "--force",
    ]);
    expect(withFlag.url).toBe("/update_schema_incremental");
    expect(withFlag.body.force).toBe(true);

    const without = await run(["schemas", "update", "force_flag_probe", "--fields", fields]);
    expect(without.url).toBe("/update_schema_incremental");
    expect(without.body.force).toBe(false);
  });

  it("schemas update --force on a type with no schema forwards force: true on the /register_schema bootstrap call; omitted sends false", async () => {
    const withFlag = await run(["schemas", "update", MISSING_TYPE, "--fields", fields, "--force"]);
    expect(withFlag.url).toBe("/register_schema");
    expect(withFlag.body.entity_type).toBe(MISSING_TYPE);
    expect(withFlag.body.force).toBe(true);

    const without = await run(["schemas", "update", MISSING_TYPE, "--fields", fields]);
    expect(without.url).toBe("/register_schema");
    expect(without.body.force).toBe(false);
  });

  it("schemas register --force sends force: true to /register_schema; omitted sends false", async () => {
    const withFlag = await run([
      "schemas",
      "register",
      "force_flag_probe",
      "--fields",
      registerFields,
      "--force",
    ]);
    expect(withFlag.url).toBe("/register_schema");
    expect(withFlag.body.force).toBe(true);

    const without = await run([
      "schemas",
      "register",
      "force_flag_probe",
      "--fields",
      registerFields,
    ]);
    expect(without.url).toBe("/register_schema");
    expect(without.body.force).toBe(false);
  });
});
