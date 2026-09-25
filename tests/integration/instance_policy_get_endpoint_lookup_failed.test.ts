/**
 * `GET /instance-policy` must let a remote client tell "no policy configured"
 * apart from "policy unreadable".
 *
 * Before this fix the route (`src/actions.ts`) called the strict
 * `getInstancePolicyResult()` but returned only
 * `{ policy: result.policy ?? null, entity_id: result.entity_id ?? null }` —
 * `lookup_failed` was read off the result and then dropped on the floor. A
 * failed lookup and a genuinely unconfigured instance both looked exactly like
 * `{ policy: null, entity_id: null }` on the wire, which is the same
 * conflation #2131 fixed for standing rules, reappearing on this response.
 *
 * `policy: null` is kept for the not-configured case (existing clients must
 * not break); `lookup_failed: true` (and an `error` message) is ADDED for the
 * failed case, so old clients that only look at `policy` see no change and new
 * clients can distinguish the two.
 */

import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../../src/cli/index.ts";

let failInstancePolicyLookup = false;

vi.mock("../../src/db.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/db.js")>("../../src/db.js");
  const realFrom = actual.db.from.bind(actual.db);

  const wrappedFrom = (table: string) => {
    const real = realFrom(table);
    if (!failInstancePolicyLookup) return real;
    if (table !== "entity_snapshots" && table !== "entities") return real;

    const realSelect = (real as { select: (...a: unknown[]) => unknown }).select.bind(real);
    return {
      ...real,
      select: (...selectArgs: unknown[]) => {
        const chain = realSelect(...selectArgs) as Record<string, unknown>;
        const realEq = (chain.eq as (...a: unknown[]) => unknown).bind(chain);
        return {
          ...chain,
          eq: (col: string, val: unknown) => {
            if (col === "entity_type" && val === "instance_policy") {
              return {
                then: (resolve: (v: unknown) => unknown) =>
                  Promise.resolve({
                    data: null,
                    error: { message: "mocked instance_policy lookup failure" },
                  }).then(resolve),
              };
            }
            return realEq(col, val);
          },
        };
      },
    };
  };

  return { db: { ...actual.db, from: wrappedFrom } };
});

const { app } = await import("../../src/actions.js");

describe("GET /instance-policy — lookup_failed signal", () => {
  let httpServer: ReturnType<typeof createServer>;
  let baseUrl: string;

  beforeEach(async () => {
    failInstancePolicyLookup = false;
    httpServer = createServer(app);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
    const addr = httpServer.address();
    if (!addr || typeof addr === "string") throw new Error("expected TCP listen address");
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    failInstancePolicyLookup = false;
    await new Promise<void>((resolve, reject) =>
      httpServer.close((err) => (err ? reject(err) : resolve()))
    );
  });

  it("returns policy: null with no lookup_failed flag when no policy is configured", async () => {
    const res = await fetch(`${baseUrl}/instance-policy`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      policy: unknown;
      entity_id: unknown;
      lookup_failed?: boolean;
    };
    expect(body.policy).toBeNull();
    expect(body.lookup_failed).toBeFalsy();
  });

  it("returns lookup_failed: true and keeps policy: null when the read fails", async () => {
    failInstancePolicyLookup = true;
    const res = await fetch(`${baseUrl}/instance-policy`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      policy: unknown;
      entity_id: unknown;
      lookup_failed?: boolean;
      error?: string;
    };
    // policy stays null on a failed read too — a remote client reading only
    // `policy` and not `lookup_failed` must not observe a behavior change.
    expect(body.policy).toBeNull();
    expect(body.lookup_failed).toBe(true);
  });
});

/**
 * CLI consumer of the same endpoint. Before this fix, `neotoma instance-policy
 * show` read only `envelope.policy` off the HTTP response — a failed lookup
 * (`lookup_failed: true, policy: null`) was indistinguishable on the CLI from
 * a genuinely unconfigured instance, and both printed "No instance policy
 * configured... writes are not policy-restricted", which is the wrong answer
 * to give an operator when policy state is actually unknown.
 */
describe("CLI `instance-policy show` — lookup_failed signal", () => {
  let httpServer: ReturnType<typeof createServer>;
  let baseUrl: string;

  beforeEach(async () => {
    failInstancePolicyLookup = false;
    httpServer = createServer(app);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
    const addr = httpServer.address();
    if (!addr || typeof addr === "string") throw new Error("expected TCP listen address");
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    failInstancePolicyLookup = false;
    await new Promise<void>((resolve, reject) =>
      httpServer.close((err) => (err ? reject(err) : resolve()))
    );
  });

  async function runCliJson(argvSuffix: string[]): Promise<{ exitCode: number; body: unknown }> {
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
      throw new Error(
        `CLI produced no JSON envelope; stdout=${JSON.stringify(stdoutParts.join(""))}`
      );
    }
    return { exitCode, body: JSON.parse(jsonLine) };
  }

  // NOTE ON ORDER: this text-mode test MUST run before any `--json` call in
  // this describe block. `runCli` parses argv into the module-level Commander
  // `program` singleton, and Commander does not reset a previously-set
  // boolean flag when a later `parseAsync` omits it — so a `--json` call
  // earlier in this file's execution would leak `opts().json === true` into
  // this test even though its own argv never passes `--json`. Tests run in
  // declaration order within a file, so declaring this one first is what
  // keeps it deterministic; a `vi.resetModules()` + re-import per call (the
  // pattern `tests/cli/cli_access_commands.test.ts` uses) would fix this at
  // the root but risks decoupling from this file's `vi.mock("../../src/db.js")`
  // closure over `failInstancePolicyLookup`, so it isn't used here.
  it("text mode exits non-zero and writes an UNKNOWN-not-absent message to stderr on a failed lookup", async () => {
    failInstancePolicyLookup = true;
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
    try {
      await runCli([
        "node",
        "neotoma",
        "--api-only",
        "--base-url",
        baseUrl,
        "instance-policy",
        "show",
      ]);
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
    const exitCode = process.exitCode ?? 0;
    process.exitCode = prevExit;

    expect(exitCode).toBe(1);
    const stderrText = stderrParts.join("");
    expect(stderrText).toMatch(/UNKNOWN/);
    // Must NOT print the success-path "No instance policy configured" message
    // (the exact string the unconfigured case prints below) — a failed lookup
    // reporting itself as unconfigured is the bug this test guards against.
    // The stderr message DOES legitimately mention "no policy configured" as
    // a phrase inside its own contrastive sentence ("NOT the same as no
    // policy configured"), so match the specific misleading sentence, not
    // the substring.
    expect(stderrText).not.toMatch(/^No instance policy configured/im);
    // Must NOT print the "unrestricted" text a genuinely unconfigured instance gets.
    expect(stdoutParts.join("")).not.toMatch(/writes are not policy-restricted/);
  });

  it("--json reports no lookup_failed key when the read succeeds with no policy configured", async () => {
    const { exitCode, body } = await runCliJson(["instance-policy", "show"]);
    expect(exitCode).toBe(0);
    expect((body as { policy: unknown }).policy).toBeNull();
    expect((body as { lookup_failed?: boolean }).lookup_failed).toBeFalsy();
  });

  it("--json surfaces lookup_failed: true rather than reporting 'no policy configured'", async () => {
    failInstancePolicyLookup = true;
    const { exitCode, body } = await runCliJson(["instance-policy", "show"]);
    expect(exitCode).toBe(1);
    expect((body as { lookup_failed?: boolean }).lookup_failed).toBe(true);
    expect((body as { policy: unknown }).policy).toBeNull();
  });
});
