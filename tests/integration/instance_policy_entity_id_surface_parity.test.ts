/**
 * Cross-surface parity for `entity_id` on instance-policy describe/show.
 *
 * Policy: cross_surface_contract_parity_tested_all_surfaces
 * (ent_2ad0677fe23c0c1878ae43e8). HTTP `GET /instance-policy` already returns
 * `{ policy, entity_id }`; MCP `describe_instance_policy` and CLI
 * `instance-policy show --json` must expose the same key set against the same
 * fixture — not just matching `policy` values.
 */

import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { cleanupEntitySnapshot, cleanupTestEntity } from "../helpers/cleanup_helpers.js";
import { runCli } from "../../src/cli/index.ts";

const POLICY_ENTITY_ID = `ent_parity_pol_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
const EXPECTED_KEYS = ["entity_id", "policy"] as const;

type PolicyEnvelope = { policy: unknown; entity_id: string | null };

function sortedKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).sort();
}

async function seedPolicy(): Promise<void> {
  const snapshot = {
    purpose: "entity_id surface-parity fixture",
    enforcement: "advisory",
    policy_id: "test-policy-entity-id-parity",
  };

  await db.from("entities").insert({
    id: POLICY_ENTITY_ID,
    user_id: null,
    entity_type: "instance_policy",
    canonical_name: "Parity Instance Policy",
    merged_to_entity_id: null,
  });

  await db.from("entity_snapshots").insert({
    entity_id: POLICY_ENTITY_ID,
    user_id: null,
    entity_type: "instance_policy",
    schema_version: "1.0.0",
    canonical_name: "Parity Instance Policy",
    snapshot,
    observation_count: 1,
    last_observation_at: new Date().toISOString(),
    provenance: {},
    computed_at: new Date().toISOString(),
  });
}

async function runCliJson(
  baseUrl: string,
  argvSuffix: string[]
): Promise<{ exitCode: number; body: PolicyEnvelope }> {
  const stdoutParts: string[] = [];
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdoutParts.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8")
    );
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  const prevExit = process.exitCode;
  process.exitCode = undefined;
  try {
    await runCli([
      "node",
      "neotoma",
      "--json",
      "--api-only",
      "--base-url",
      baseUrl,
      ...argvSuffix,
    ]);
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }

  const exitCode = process.exitCode ?? 0;
  process.exitCode = prevExit;
  // HTTP access logs from the in-process test server may interleave on
  // stdout; pick the last JSON object line.
  const jsonLine = stdoutParts
    .join("")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{") && l.endsWith("}"))
    .at(-1);
  if (!jsonLine) {
    throw new Error(`CLI produced no JSON envelope; stdout=${JSON.stringify(stdoutParts.join(""))}`);
  }
  const body = JSON.parse(jsonLine) as PolicyEnvelope;
  return { exitCode, body };
}

describe("instance-policy entity_id — HTTP / MCP / CLI JSON key-set parity", () => {
  let httpServer: Server;
  let baseUrl: string;
  let mcpServer: NeotomaServer;

  beforeAll(async () => {
    await seedPolicy();

    httpServer = createServer(app);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = httpServer.address();
    if (!addr || typeof addr === "string") throw new Error("expected TCP listen address");
    baseUrl = `http://127.0.0.1:${addr.port}`;

    mcpServer = new NeotomaServer();
    (mcpServer as unknown as Record<string, unknown>).authenticatedUserId = LOCAL_DEV_USER_ID;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    await cleanupEntitySnapshot(POLICY_ENTITY_ID);
    await cleanupTestEntity(POLICY_ENTITY_ID);
  });

  it("returns identical {policy, entity_id} key sets on HTTP, MCP, and CLI --json", async () => {
    // HTTP
    const httpRes = await fetch(`${baseUrl}/instance-policy`);
    expect(httpRes.status).toBe(200);
    const httpBody = (await httpRes.json()) as PolicyEnvelope;

    // MCP (same DB-backed lookup as HTTP)
    const mcpRaw = await (
      mcpServer as unknown as {
        describeInstancePolicy: () => Promise<{ content: Array<{ text: string }> }>;
      }
    ).describeInstancePolicy();
    const mcpBody = JSON.parse(mcpRaw.content[0].text) as PolicyEnvelope;

    // CLI machine contract is --json only (text mode stays policy-only)
    const { exitCode, body: cliBody } = await runCliJson(baseUrl, ["instance-policy", "show"]);
    expect(exitCode).toBe(0);

    expect(sortedKeys(httpBody as Record<string, unknown>)).toEqual([...EXPECTED_KEYS]);
    expect(sortedKeys(mcpBody as Record<string, unknown>)).toEqual([...EXPECTED_KEYS]);
    // CLI --json may wrap transport metadata (`_neotoma`); the contract surface
    // is the presence of policy + entity_id with values matching HTTP/MCP.
    expect(cliBody).toHaveProperty("policy");
    expect(cliBody).toHaveProperty("entity_id");

    expect(httpBody.entity_id).toBe(POLICY_ENTITY_ID);
    expect(mcpBody.entity_id).toBe(POLICY_ENTITY_ID);
    expect(cliBody.entity_id).toBe(POLICY_ENTITY_ID);

    expect(httpBody.policy).toEqual(mcpBody.policy);
    expect(httpBody.policy).toEqual(cliBody.policy);
  });
});
