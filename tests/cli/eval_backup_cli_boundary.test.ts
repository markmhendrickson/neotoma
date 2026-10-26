import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { BackupEvalSession } from "../../packages/eval-harness/src/neotoma_cli.js";

type FixedControl = {
  runSealed(action: string): Promise<{ exitCode: number; stdout: string }>;
};
const sessions: BackupEvalSession[] = [];
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.close();
});

it("keeps inherited credentials and process overrides out of the OS-confined child", async () => {
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
});

it("kills and reaps an active sandboxed process before cleanup on abort", async () => {
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
});

it("fails closed and reaps a child that exceeds the stdout cap", async () => {
  const session = await BackupEvalSession.create();
  sessions.push(session);
  await expect((session as unknown as FixedControl).runSealed("overflow-control")).rejects.toThrow(
    /stdout limit exceeded/
  );
});
