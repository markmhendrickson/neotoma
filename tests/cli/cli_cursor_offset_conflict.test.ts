/**
 * #1943: `neotoma entities list --cursor X --offset N` must be rejected with a
 * structured, machine-readable error — not silently resolved.
 *
 * Caught by the qa lens on PR #1946: the guard had zero coverage. The unit test
 * in cli_error_envelope_preservation.test.ts exercises the errorCodeOf/hintOf
 * EXTRACTION seam against a mocked envelope; the server-side case in
 * action_schemas_validation.test.ts exercises the Zod schema. Neither touches
 * this CLI pre-flight branch, which is a third, independent code path.
 *
 * Why the branch is delicate enough to need its own test: `--offset` carries a
 * "0" default, so "was it supplied?" cannot be read off the value — it comes from
 * Commander's option SOURCE. My first cut got this wrong and silently dropped an
 * explicit --offset, returning a page the caller never asked for. That is the
 * regression this pins.
 *
 * Drives the real command through runCli (the pattern in backup_verify.test.ts)
 * rather than asserting on a helper, so the guard and the option-source read are
 * exercised end to end. runCli THROWS the CliHintError — the binary's top-level
 * handler is what renders it — so the assertion is on the thrown error's `hint`,
 * plus writeCliError's rendering of it, which together are the contract an agent
 * consumes via `--json`.
 */
import { describe, it, expect, vi } from "vitest";

import { runCli, writeCliError } from "../../src/cli/index.ts";

/** A well-formed opaque cursor for the default entity_id/asc ordering. */
const CURSOR = Buffer.from(
  JSON.stringify({ v: 1, sort_by: "entity_id", sort_order: "asc", entity_id: "ent_x" }),
  "utf8"
).toString("base64url");

async function runNeotomaCli(
  argvSuffix: string[]
): Promise<{ stdout: string; stderr: string; error?: unknown }> {
  const stdoutParts: string[] = [];
  const stderrParts: string[] = [];
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdoutParts.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8")
    );
    return true;
  });
  // writeCliError renders the JSON error envelope to STDERR, not stdout.
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderrParts.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8")
    );
    return true;
  });
  const prevExit = process.exitCode;
  process.exitCode = undefined;

  let caught: unknown;
  try {
    await runCli(["node", "neotoma", ...argvSuffix]);
  } catch (err) {
    caught = err;
  }

  process.exitCode = prevExit;
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  return { stdout: stdoutParts.join(""), stderr: stderrParts.join(""), error: caught };
}

describe("#1943 CLI rejects --cursor + --offset", () => {
  it("emits a structured CURSOR_OFFSET_CONFLICT when both are supplied explicitly", async () => {
    const { error } = await runNeotomaCli([
      "--env", "dev", "entities", "list",
      "--type", "cursor_conflict_probe",
      "--cursor", CURSOR,
      "--offset", "10",
      "--json",
    ]);

    // The guard fires and carries a machine-readable code — prose is not a contract.
    const hint = (error as { hint?: { code?: string; hint?: string } } | undefined)?.hint;
    expect(hint?.code).toBe("CURSOR_OFFSET_CONFLICT");
    expect(String((error as Error).message)).toMatch(/cannot be combined/i);
    expect(hint?.hint).toMatch(/--cursor/);

    // ...and it renders into the --json envelope an agent actually parses.
    const rendered: string[] = [];
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((c: unknown) => {
      rendered.push(String(c));
      return true;
    });
    const prevJson = process.env.NEOTOMA_OUTPUT;
    process.env.NEOTOMA_OUTPUT = "json";
    writeCliError(error);
    process.env.NEOTOMA_OUTPUT = prevJson;
    spy.mockRestore();

    const body = JSON.parse(rendered.join("").trim()) as { hint?: { code?: string } };
    expect(body.hint?.code).toBe("CURSOR_OFFSET_CONFLICT");
  });

  it("does NOT reject a bare --cursor (the `--offset` default must not count as supplied)", async () => {
    // The regression this guards: --offset defaults to "0", so a naive
    // `if (opts.cursor && opts.offset)` would reject every cursor call. The guard
    // must read Commander's option source, not the value.
    const { error } = await runNeotomaCli([
      "--env", "dev", "entities", "list",
      "--type", "cursor_conflict_probe",
      "--cursor", CURSOR,
      "--json",
    ]);

    const hint = (error as { hint?: { code?: string } } | undefined)?.hint;
    expect(hint?.code).not.toBe("CURSOR_OFFSET_CONFLICT");
  });

  it("does NOT reject a bare --offset", async () => {
    const { error } = await runNeotomaCli([
      "--env", "dev", "entities", "list",
      "--type", "cursor_conflict_probe",
      "--offset", "10",
      "--json",
    ]);

    const hint = (error as { hint?: { code?: string } } | undefined)?.hint;
    expect(hint?.code).not.toBe("CURSOR_OFFSET_CONFLICT");
  });
});
