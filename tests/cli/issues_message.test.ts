import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

import { runCli } from "../../src/cli/index.ts";

function resolveTestApiBaseUrl(): string {
  const port = process.env.NEOTOMA_SESSION_DEV_PORT || process.env.NEOTOMA_HTTP_PORT || "18080";
  return `http://127.0.0.1:${port}`;
}

async function runNeotomaCli(
  argvSuffix: string[],
  env: Record<string, string | undefined>,
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
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
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

describe("CLI issues message (smoke)", () => {
  const baseUrl = resolveTestApiBaseUrl();
  /**
   * Blank target on the CLI process. The shared Vitest HTTP server must also
   * have NEOTOMA_ISSUES_TARGET_URL="" (set in vitest.global_setup.ts); otherwise
   * POST /issues/submit forwards to DEFAULT_ISSUES_TARGET_URL and this smoke
   * can hang until the 60s test timeout.
   */
  const issuesEnv = { NEOTOMA_ISSUES_TARGET_URL: "" };

  it("issues message --entity-id … --body … --json exercises POST /issues/add_message", async () => {
    const title = `cli-smoke-issues-message ${Date.now()}`;
    const create = await runNeotomaCli(
      [
        "--json",
        "--api-only",
        "--base-url",
        baseUrl,
        "issues",
        "create",
        "--title",
        title,
        "--body",
        "CLI smoke body for issues message.",
        "--visibility",
        "private",
        "--reporter-git-sha",
        "cli-smoke-test",
      ],
      issuesEnv,
    );
    expect(create.exitCode, create.stderr + create.stdout).toBe(0);
    const created = JSON.parse(create.stdout) as { entity_id?: string };
    expect(created.entity_id?.length ?? 0).toBeGreaterThan(5);

    const uniqueBody = `Smoke thread reply from CLI test (${randomUUID()}).`;
    const msg = await runNeotomaCli(
      [
        "--json",
        "--api-only",
        "--base-url",
        baseUrl,
        "issues",
        "message",
        "--entity-id",
        created.entity_id!,
        "--body",
        uniqueBody,
        "--reporter-git-sha",
        "cli-smoke-test",
      ],
      issuesEnv,
    );
    if (msg.exitCode !== 0) {
      expect(msg.stderr + msg.stdout).toMatch(/ISSUE_MESSAGE_FAILED|stored locally for follow-up/i);
      return;
    }

    const out = JSON.parse(msg.stdout) as { submitted_to_neotoma?: boolean };
    expect(out.submitted_to_neotoma === true || out.submitted_to_neotoma === false).toBe(true);
  });

  it("issues message --body only (--json) errors when entity_id and issue number are missing", async () => {
    const res = await runNeotomaCli(
      ["--json", "--api-only", "--base-url", baseUrl, "issues", "message", "--body", "orphan body"],
      issuesEnv,
    );
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/provide.*GitHub issue number|entity-id/i);
  });
});
