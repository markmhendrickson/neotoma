import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/cli/index.ts";
import {
  startPeerSyncFixture,
  type PeerSyncFixture,
} from "../helpers/two_server_fixture.js";

const LOCAL_DEV = "00000000-0000-0000-0000-000000000000";

async function runNeotomaCli(
  argvSuffix: string[],
  env: Record<string, string>,
): Promise<{ exitCode: number; stdout: string; stderr: string; error?: unknown }> {
  const stdoutParts: string[] = [];
  const stderrParts: string[] = [];
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdoutParts.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8"),
    );
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderrParts.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8"),
    );
    return true;
  });

  const prevExit = process.exitCode;
  process.exitCode = undefined;

  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }

  let caught: unknown;
  try {
    await runCli(["node", "neotoma", ...argvSuffix]);
  } catch (err) {
    caught = err;
  }

  const exitCode =
    process.exitCode !== undefined && process.exitCode !== 0
      ? process.exitCode
      : caught
        ? 1
        : (process.exitCode ?? 0);
  process.exitCode = prevExit;

  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();

  return {
    exitCode,
    stdout: stdoutParts.join(""),
    stderr: stderrParts.join(""),
    error: caught,
  };
}

function peerCliEnv(fixture: PeerSyncFixture): Record<string, string> {
  return {
    NEOTOMA_BEARER_TOKEN: fixture.serverA.token,
    NEOTOMA_API_ONLY: "1",
  };
}

describe("CLI peers commands (smoke)", () => {
  let fixture: PeerSyncFixture;

  beforeAll(async () => {
    fixture = await startPeerSyncFixture();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it("peers list --json exercises GET /peers", async () => {
    const res = await runNeotomaCli(
      [
        "--json",
        "--base-url",
        fixture.serverA.baseUrl,
        "peers",
        "list",
      ],
      peerCliEnv(fixture),
    );
    expect(res.exitCode, res.stderr + "\n" + res.stdout).toBe(0);
    const parsed = JSON.parse(res.stdout) as { peers?: unknown[] };
    expect(Array.isArray(parsed.peers)).toBe(true);
    expect(parsed.peers!.some((p) => typeof p === "object" && p !== null)).toBe(true);
  });

  it("peers status <peer_id> --json exercises GET /peers/{peer_id}", async () => {
    const res = await runNeotomaCli(
      [
        "--json",
        "--base-url",
        fixture.serverA.baseUrl,
        "peers",
        "status",
        fixture.peerIdB,
      ],
      peerCliEnv(fixture),
    );
    expect(res.exitCode, res.stderr + "\n" + res.stdout).toBe(0);
    expect(JSON.parse(res.stdout)).toBeTruthy();
  });

  it("peers sync <peer_id> --limit 1 --json exercises POST /peers/{peer_id}/sync", async () => {
    const res = await runNeotomaCli(
      [
        "--json",
        "--base-url",
        fixture.serverA.baseUrl,
        "peers",
        "sync",
        fixture.peerIdB,
        "--limit",
        "1",
      ],
      peerCliEnv(fixture),
    );
    expect(res.exitCode, res.stderr + "\n" + res.stdout).toBe(0);
    expect(JSON.parse(res.stdout)).toBeTruthy();
  });

  it("peers remove <peer_id> --json exercises DELETE /peers/{peer_id}", async () => {
    const res = await runNeotomaCli(
      [
        "--json",
        "--base-url",
        fixture.serverA.baseUrl,
        "peers",
        "remove",
        fixture.peerIdB,
      ],
      peerCliEnv(fixture),
    );
    expect(res.exitCode, res.stderr + "\n" + res.stdout).toBe(0);
  });

  it("peers add (full flags) --json exercises POST /peers", async () => {
    const res = await runNeotomaCli(
      [
        "--json",
        "--base-url",
        fixture.serverA.baseUrl,
        "peers",
        "add",
        "--peer-id",
        fixture.peerIdB,
        "--name",
        "server-b",
        "--url",
        fixture.serverB.baseUrl,
        "--types",
        "note,task,contact,person,peer_config",
        "--direction",
        "bidirectional",
        "--sync-scope",
        "all",
        "--auth-method",
        "shared_secret",
        "--conflict-strategy",
        "last_write_wins",
        "--shared-secret",
        fixture.sharedSecret,
        "--target-user-id",
        LOCAL_DEV,
      ],
      peerCliEnv(fixture),
    );
    expect(res.exitCode, res.stderr + "\n" + res.stdout).toBe(0);
    expect(JSON.parse(res.stdout)).toBeTruthy();
  });

  it("peers status with unknown peer and --json exits non-zero (error path with global --json)", async () => {
    const res = await runNeotomaCli(
      [
        "--json",
        "--base-url",
        fixture.serverA.baseUrl,
        "peers",
        "status",
        "peer-id-definitely-missing-for-cli-smoke",
      ],
      peerCliEnv(fixture),
    );
    expect(res.exitCode).toBe(1);
    const diag = `${res.stderr}\n${res.stdout}\n${res.error ? String((res.error as Error).message) : ""}`;
    expect(diag).toMatch(/Failed to get peer status|peer|404|not\s*found/i);
  });
});
