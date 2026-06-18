import { describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/cli/index.ts";

/**
 * Behavioral coverage for the `neotoma doctor` → `neotoma status` rename (#361).
 *
 * Contract:
 * - `neotoma status` and `neotoma doctor` both invoke the same diagnostics.
 * - The deprecated `doctor` alias writes a one-line deprecation notice to
 *   stderr only; stdout (including the `--json` payload) is unaffected so
 *   machine parsing of `status --json` / `doctor --json` stays byte-clean.
 * - `status` emits no deprecation notice.
 */
async function runNeotomaCli(
  argvSuffix: string[],
): Promise<{ stdout: string; stderr: string }> {
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
  try {
    await runCli(["node", "neotoma", ...argvSuffix]);
  } catch {
    /* the diagnostics command does not throw on a healthy/unhealthy report */
  }
  process.exitCode = prevExit;

  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();

  return { stdout: stdoutParts.join(""), stderr: stderrParts.join("") };
}

const DEPRECATION_MATCH = /`neotoma doctor` is deprecated/;

describe("neotoma status / doctor alias (#361)", () => {
  it("`status --json` emits no deprecation notice and a parseable JSON report", async () => {
    const { stdout, stderr } = await runNeotomaCli(["--json", "status"]);

    expect(stderr).not.toMatch(DEPRECATION_MATCH);
    // stdout is a single JSON document the agent can parse.
    const parsed = JSON.parse(stdout);
    expect(parsed).toBeTypeOf("object");
  });

  it("`doctor --json` warns on stderr but keeps stdout byte-clean JSON", async () => {
    const { stdout, stderr } = await runNeotomaCli(["--json", "doctor"]);

    // The deprecation notice goes to stderr only.
    expect(stderr).toMatch(DEPRECATION_MATCH);
    expect(stdout).not.toMatch(DEPRECATION_MATCH);

    // stdout still parses as a single JSON document.
    const parsed = JSON.parse(stdout);
    expect(parsed).toBeTypeOf("object");
  });

  it("`status` and `doctor` produce identical stdout payloads", async () => {
    const statusRun = await runNeotomaCli(["--json", "status"]);
    const doctorRun = await runNeotomaCli(["--json", "doctor"]);

    // The reports may carry volatile fields (timestamps, pids); compare the
    // stable top-level key set rather than the full document.
    const statusKeys = Object.keys(JSON.parse(statusRun.stdout)).sort();
    const doctorKeys = Object.keys(JSON.parse(doctorRun.stdout)).sort();
    expect(doctorKeys).toEqual(statusKeys);
  });
});
