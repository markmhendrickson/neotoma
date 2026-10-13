/**
 * Regression test for the `instance-policy set` entity_id resolution path.
 *
 * ADR ent_efbdccae9ec7ed5b5d0bf138: `instance-policy set` must resolve the
 * existing policy's `entity_id` via `GET /instance-policy` against the
 * `--base-url`-resolved remote instance, the same as `instance-policy show`
 * already does — never via the local, same-process
 * `getInstancePolicyEntityId()` helper, which reads whatever database the
 * CLI process happens to be connected to and silently targets the wrong
 * instance whenever `--base-url` points elsewhere.
 *
 * Companion to `instance_policy_entity_id_surface_parity.test.ts`, which
 * covers `show`/`describe`. Source-guard alone (grepping for the import) is
 * not enough — this exercises the actual dry-run call against a fixture HTTP
 * server and asserts the local helper is never invoked.
 */

import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { cleanupEntitySnapshot, cleanupTestEntity } from "../helpers/cleanup_helpers.js";
import { runCli } from "../../src/cli/index.ts";
import * as instancePolicyService from "../../src/services/instance_policy.js";

const POLICY_ENTITY_ID = `ent_set_parity_pol_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

type DryRunEnvelope = {
  mode: "create" | "update";
  entity_id: string | null;
  dry_run: true;
};

async function seedPolicy(): Promise<void> {
  const snapshot = {
    purpose: "instance-policy set entity_id regression fixture",
    enforcement: "advisory",
    policy_id: "test-policy-set-entity-id-parity",
  };

  await db.from("entities").insert({
    id: POLICY_ENTITY_ID,
    user_id: null,
    entity_type: "instance_policy",
    canonical_name: "Set Parity Instance Policy",
    merged_to_entity_id: null,
  });

  await db.from("entity_snapshots").insert({
    entity_id: POLICY_ENTITY_ID,
    user_id: null,
    entity_type: "instance_policy",
    schema_version: "1.0.0",
    canonical_name: "Set Parity Instance Policy",
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
): Promise<{ exitCode: number; body: DryRunEnvelope }> {
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
  const jsonLine = stdoutParts
    .join("")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{") && l.endsWith("}"))
    .at(-1);
  if (!jsonLine) {
    throw new Error(`CLI produced no JSON envelope; stdout=${JSON.stringify(stdoutParts.join(""))}`);
  }
  const body = JSON.parse(jsonLine) as DryRunEnvelope;
  return { exitCode, body };
}

describe("instance-policy set — entity_id resolved via HTTP, not local DB helper", () => {
  let httpServer: Server;
  let baseUrl: string;
  let tmpDir: string;

  beforeAll(async () => {
    await seedPolicy();

    httpServer = createServer(app);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = httpServer.address();
    if (!addr || typeof addr === "string") throw new Error("expected TCP listen address");
    baseUrl = `http://127.0.0.1:${addr.port}`;

    tmpDir = await mkdtemp(path.join(tmpdir(), "instance-policy-set-"));
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    await cleanupEntitySnapshot(POLICY_ENTITY_ID);
    await cleanupTestEntity(POLICY_ENTITY_ID);
    await rm(tmpDir, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dry-run update mode resolves entity_id from the remote instance and never calls the local DB helper", async () => {
    const localHelperSpy = vi.spyOn(instancePolicyService, "getInstancePolicyEntityId");

    const policyFile = path.join(tmpDir, "policy-update.json");
    await writeFile(policyFile, JSON.stringify({ purpose: "Updated purpose text" }), "utf-8");

    const { exitCode, body } = await runCliJson(baseUrl, [
      "instance-policy",
      "set",
      "--file",
      policyFile,
      "--dry-run",
    ]);

    expect(exitCode).toBe(0);
    expect(body.mode).toBe("update");
    expect(body.entity_id).toBe(POLICY_ENTITY_ID);
    expect(body.dry_run).toBe(true);

    // The regression this guards against: `set` reading entity_id off a
    // local, same-process database connection instead of the `--base-url`
    // remote. Source-guard (grepping for the import) can miss re-imports;
    // asserting the exported function itself was never invoked cannot.
    expect(localHelperSpy).not.toHaveBeenCalled();
  });

  it("resolves entity_id via GET /instance-policy even when the local DB helper would return a different answer", async () => {
    // Force the local, same-process helper to return null (as if this
    // process had no local policy) while the remote fixture DOES have one
    // seeded. If `set` still called the local helper instead of the HTTP
    // path, this would misresolve to create mode against an id that already
    // exists remotely — exactly the bug the tip commit left in place.
    const localHelperSpy = vi
      .spyOn(instancePolicyService, "getInstancePolicyEntityId")
      .mockResolvedValue(null);

    const policyFile = path.join(tmpDir, "policy-update-2.json");
    await writeFile(policyFile, JSON.stringify({ purpose: "Second update pass" }), "utf-8");

    const { exitCode, body } = await runCliJson(baseUrl, [
      "instance-policy",
      "set",
      "--file",
      policyFile,
      "--dry-run",
    ]);

    expect(exitCode).toBe(0);
    expect(body.mode).toBe("update");
    expect(body.entity_id).toBe(POLICY_ENTITY_ID);
    expect(localHelperSpy).not.toHaveBeenCalled();
  });
});
