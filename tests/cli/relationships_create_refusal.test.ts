/**
 * #2781: `neotoma relationships create` (single and `--file`) must show why the
 * server refused the write, not only a fixed "Failed to create relationship".
 * Runs the real command parser against a local server that refuses every write.
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/cli/index.ts";

const DENIED_MESSAGE = "agent grant has no create capability for relationship";

describe("CLI relationships create refusal detail (#2781)", () => {
  let server: Server;
  let baseUrl: string;
  let responseBody: unknown;
  let batchFile: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(responseBody));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const dir = mkdtempSync(join(tmpdir(), "rel-refusal-"));
    batchFile = join(dir, "rels.json");
    writeFileSync(
      batchFile,
      JSON.stringify([
        { relationship_type: "REFERS_TO", source_entity_id: "ent_a", target_entity_id: "ent_b" },
      ])
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function run(args: string[]): Promise<{ output: string; exitCode: number | undefined }> {
    const chunks: string[] = [];
    const capture = (chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    };
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(capture);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(capture);
    const prevExit = process.exitCode;
    process.exitCode = undefined;
    let thrown = "";
    let exitCode: number | undefined;
    try {
      await runCli(["node", "neotoma", "--api-only", "--base-url", baseUrl, ...args]);
    } catch (err) {
      thrown = err instanceof Error ? err.message : String(err);
    } finally {
      exitCode = process.exitCode as number | undefined;
      stdout.mockRestore();
      stderr.mockRestore();
      process.exitCode = prevExit;
    }
    return { output: chunks.join("") + thrown, exitCode: thrown ? 1 : exitCode };
  }

  const single = [
    "relationships",
    "create",
    "--source-entity-id",
    "ent_a",
    "--target-entity-id",
    "ent_b",
    "--relationship-type",
    "REFERS_TO",
  ];

  it("shows the refusal code and message for a single create", async () => {
    responseBody = { error_code: "capability_denied", message: DENIED_MESSAGE };
    const { output, exitCode } = await run(single);
    expect(output).toContain(`Failed to create relationship: capability_denied: ${DENIED_MESSAGE}`);
    expect(exitCode).not.toBe(0);
  });

  it("shows the refusal code and message for --file", async () => {
    responseBody = { error_code: "capability_denied", message: DENIED_MESSAGE };
    const { output, exitCode } = await run(["relationships", "create", "--file", batchFile]);
    expect(output).toContain(
      `Failed to create relationships: capability_denied: ${DENIED_MESSAGE}`
    );
    expect(exitCode).not.toBe(0);
  });

  it("keeps the fixed message when the response has no code or message", async () => {
    responseBody = { unrelated: true };
    const one = await run(single);
    expect(one.output).toContain("Failed to create relationship");
    expect(one.output).not.toContain("Failed to create relationship:");
    expect(one.output).not.toContain("unrelated");
    expect(one.exitCode).not.toBe(0);

    const batch = await run(["relationships", "create", "--file", batchFile]);
    expect(batch.output).toContain("Failed to create relationships");
    expect(batch.output).not.toContain("Failed to create relationships:");
    expect(batch.exitCode).not.toBe(0);
  });
});
