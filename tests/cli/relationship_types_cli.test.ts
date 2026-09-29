import { describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/cli/index.ts";

function resolveTestApiBaseUrl(): string {
  const port = process.env.NEOTOMA_SESSION_DEV_PORT || process.env.NEOTOMA_HTTP_PORT || "18080";
  return `http://127.0.0.1:${port}`;
}

async function runNeotomaCli(
  argvSuffix: string[],
  env: Record<string, string | undefined>
): Promise<{ exitCode: number; stdout: string; stderr: string; error?: unknown }> {
  const stdoutParts: string[] = [];
  const stderrParts: string[] = [];
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdoutParts.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8")
    );
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderrParts.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8")
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

describe("relationship-types CLI", () => {
  const args = [
    "--json",
    "--api-only",
    "--base-url",
    resolveTestApiBaseUrl(),
    "relationship-types",
  ];
  it("lists the actual registry including seeded types", async () => {
    const result = await runNeotomaCli([...args, "list"], {});
    expect(result.exitCode, result.stderr + result.stdout).toBe(0);
    expect(
      JSON.parse(result.stdout).relationship_types.some(
        (r: any) => r.relationship_type === "PART_OF"
      )
    ).toBe(true);
  });
  it("reaches registration and preserves the server's capability refusal", async () => {
    const result = await runNeotomaCli(
      [...args, "register", "--relationship-type", "cli_registry_probe"],
      {}
    );
    expect(result.exitCode).toBe(1);
    expect(String(result.error) + result.stderr).toMatch(/capability|not permitted/i);
    expect((result.error as { hint?: { code?: string; hint?: string } })?.hint).toMatchObject({
      code: expect.stringMatching(/capability/i),
      hint: expect.stringMatching(/agent_grant|capability/i),
    });
  });

  it("preserves the server error code when list rejects an invalid scope", async () => {
    const result = await runNeotomaCli([...args, "list", "--scope", "not-a-scope"], {});
    expect(result.exitCode).toBe(1);
    expect((result.error as { hint?: { code?: string } })?.hint?.code).toMatch(/validation/i);
  });
});
