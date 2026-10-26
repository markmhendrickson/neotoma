import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { BackupEvalSession } from "../../packages/eval-harness/src/neotoma_cli.js";

type FixedControl = {
  runSealed(action: string): Promise<{ exitCode: number; stdout: string }>;
};
const sessions: BackupEvalSession[] = [];
const hasNativeNode24 = Number(process.versions.node.split(".")[0]) === 24;
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.close();
});

it.skipIf(!hasNativeNode24)(
  "keeps inherited credentials and process overrides out of the OS-confined child",
  async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "synthetic-only-parent-control";
    try {
      const session = await BackupEvalSession.create();
      sessions.push(session);
      const result = await (session as unknown as FixedControl).runSealed("env-control");
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ inherited: [], syntheticFixture: true });
      expect(session.boundaryProof).toEqual({
        fileDenied: true,
        networkDenied: true,
        weakenedFileRead: true,
        weakenedNetworkConnect: true,
      });
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  }
);

it.skipIf(!hasNativeNode24)(
  "never stages an extra ignored file from an installed locked package",
  async () => {
    const installed = path.resolve("node_modules/commander");
    const markerName = `neotoma-eval-private-${randomUUID()}.json`;
    const marker = path.join(installed, markerName);
    await fs.writeFile(marker, '{"synthetic":"must-not-stage"}', { flag: "wx", mode: 0o600 });
    try {
      const session = await BackupEvalSession.create();
      sessions.push(session);
      expect(existsSync(path.join(session.runtime, "node_modules/commander/package.json"))).toBe(
        true
      );
      expect(existsSync(path.join(session.runtime, "node_modules/commander", markerName))).toBe(
        false
      );
    } finally {
      await fs.unlink(marker);
    }
  }
);

it.skipIf(!hasNativeNode24)(
  "kills and reaps an active sandboxed process before cleanup on abort",
  async () => {
    const session = await BackupEvalSession.create();
    sessions.push(session);
    const pending = (session as unknown as FixedControl).runSealed("sleep-control");
    const marker = path.join(session.fixture, "sleep-started");
    const deadline = Date.now() + 8_000;
    while (!existsSync(marker) && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 25));
    expect(existsSync(marker)).toBe(true);
    session.abort();
    await expect(pending).rejects.toThrow(/aborted/);
  }
);

it.skipIf(!hasNativeNode24)(
  "fails closed and reaps a child that exceeds the stdout cap",
  async () => {
    const session = await BackupEvalSession.create();
    sessions.push(session);
    await expect(
      (session as unknown as FixedControl).runSealed("overflow-control")
    ).rejects.toThrow(/stdout limit exceeded/);
  }
);

it.skipIf(hasNativeNode24)(
  "fails closed before staging when native Node 24 is absent",
  async () => {
    await expect(BackupEvalSession.create()).rejects.toThrow(/requires Node 24/);
  }
);
