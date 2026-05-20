import { describe, expect, it, vi } from "vitest";

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

describe("CLI schemas describe (smoke)", () => {
  const baseUrl = resolveTestApiBaseUrl();

  it("schemas describe <type> --json exercises GET /schemas/{entity_type}", async () => {
    const res = await runNeotomaCli(
      ["--json", "--api-only", "--base-url", baseUrl, "schemas", "describe", "company"],
      {},
    );
    expect(res.exitCode, res.stderr + res.stdout).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      entity_type?: string;
      fields?: unknown;
      notes?: unknown[];
    };
    expect(parsed.entity_type).toBe("company");
    expect(parsed.fields !== undefined).toBe(true);
    expect(Array.isArray(parsed.notes)).toBe(true);
  });
});
