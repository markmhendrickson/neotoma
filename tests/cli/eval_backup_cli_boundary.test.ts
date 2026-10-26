import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  BackupEvalSession,
  extractLockedArchive,
} from "../../packages/eval-harness/src/neotoma_cli.js";

type FixedControl = {
  runSealed(action: string): Promise<{ exitCode: number; stdout: string }>;
};
const sessions: BackupEvalSession[] = [];
const hasNativeNode24 = Number(process.versions.node.split(".")[0]) === 24;
const npmRequire = createRequire(
  path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/package.json")
);
const tarModule = npmRequire.resolve("tar");
const tar = npmRequire("tar") as {
  c(options: Record<string, unknown>, files: string[]): Promise<void>;
};
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.close();
});

it("bounds tar expansion and entry count while extracting a locked archive child", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-locked-archive-control-"));
  try {
    const source = path.join(root, "source");
    await fs.mkdir(path.join(source, "package"), { recursive: true });
    await fs.writeFile(path.join(source, "package", "payload.txt"), "x".repeat(2 * 1024 * 1024));
    await fs.writeFile(path.join(source, "package", "second.txt"), "second");
    const archive = path.join(root, "synthetic.tgz");
    await tar.c({ gzip: true, file: archive, cwd: source }, ["package"]);
    const deadline = Date.now() + 15_000;
    await expect(
      extractLockedArchive(archive, path.join(root, "byte-denied"), tarModule, {
        bytes: 64 * 1024,
        entries: 10,
        deadline,
      })
    ).rejects.toThrow(/expanded byte limit exceeded/);
    await expect(
      extractLockedArchive(archive, path.join(root, "entry-denied"), tarModule, {
        bytes: 4 * 1024 * 1024,
        entries: 1,
        deadline,
      })
    ).rejects.toThrow(/entry limit exceeded/);
    const allowed = await extractLockedArchive(archive, path.join(root, "allowed"), tarModule, {
      bytes: 4 * 1024 * 1024,
      entries: 4,
      deadline,
    });
    expect(allowed.expandedBytes).toBeGreaterThan(2 * 1024 * 1024);
    expect(allowed.entries).toBeGreaterThanOrEqual(3);
    expect(await fs.readFile(path.join(root, "allowed", "payload.txt"), "utf8")).toHaveLength(
      2 * 1024 * 1024
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

it.skipIf(process.platform === "win32")(
  "kills a stalled archive reader on deadline and caller abort before cleanup",
  async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-archive-stall-control-"));
    const archive = path.join(root, "stalled.tgz");
    execFileSync("/usr/bin/mkfifo", [archive]);
    try {
      await expect(
        extractLockedArchive(archive, path.join(root, "timed"), tarModule, {
          bytes: 1024,
          entries: 1,
          deadline: Date.now() + 800,
        })
      ).rejects.toThrow(/timed out/);
      const abort = new AbortController();
      const pending = extractLockedArchive(
        archive,
        path.join(root, "aborted"),
        tarModule,
        { bytes: 1024, entries: 1, deadline: Date.now() + 5_000 },
        abort.signal
      );
      setTimeout(() => abort.abort(), 200);
      await expect(pending).rejects.toThrow(/aborted/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
);

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
