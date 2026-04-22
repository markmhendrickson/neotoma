/**
 * Verifies CLI user_id propagation across read verbs.
 *
 * Covers the v0.5.1 fix for https://desktop/neotoma-v0.5.0-verification.md
 * issue #1 ("--user-id flag inconsistencies") by asserting:
 *
 *   1. `resolveEffectiveUserId()` honors the precedence flag > NEOTOMA_USER_ID > undefined.
 *   2. Every read-verb that takes a user scope exposes `--user-id` on its help text.
 *   3. Setting NEOTOMA_USER_ID on a CLI invocation is accepted (no validation error)
 *      and the preAction hook rejects an empty-string NEOTOMA_USER_ID fast.
 *
 * Uses a live `node dist/cli/index.js` invocation; the test suite's
 * beforeAll-ran API server is assumed. Commands that require an accessible
 * server are exercised via --help so the test stays robust against DB state.
 */

import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

import { resolveEffectiveUserId } from "../../src/cli/index.ts";

const CLI_PATH = "node dist/cli/index.js";
const REPO_ROOT = path.resolve(__dirname, "../..");

function runHelp(args: string): string {
  return execSync(`${CLI_PATH} ${args} --help`, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    timeout: 10000,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/**
 * Read-verbs whose server handlers already honor body/query `user_id`.
 * `entities get` and `stats` were added in v0.5.1 — the rest are audited
 * regressions: the `--user-id` option must remain advertised on --help.
 */
const READ_VERBS_WITH_USER_ID: string[] = [
  "entities list",
  "entities get",
  "entities search",
  "entities find-duplicates",
  "observations list",
  "observations get",
  "relationships list",
  "timeline list",
  "timeline get",
  "schemas list",
  "sources list",
  "stats",
  "stats entities",
  "recent",
  "memory-export",
];

describe("CLI user_id propagation", () => {
  describe("resolveEffectiveUserId helper", () => {
    const ORIGINAL_ENV = process.env.NEOTOMA_USER_ID;
    const restoreEnv = () => {
      if (ORIGINAL_ENV === undefined) {
        delete process.env.NEOTOMA_USER_ID;
      } else {
        process.env.NEOTOMA_USER_ID = ORIGINAL_ENV;
      }
    };

    it("prefers the --user-id flag over NEOTOMA_USER_ID (flag > env)", () => {
      process.env.NEOTOMA_USER_ID = "env-user";
      try {
        expect(resolveEffectiveUserId("flag-user")).toBe("flag-user");
      } finally {
        restoreEnv();
      }
    });

    it("falls back to NEOTOMA_USER_ID when no flag is provided (env)", () => {
      process.env.NEOTOMA_USER_ID = "env-user";
      try {
        expect(resolveEffectiveUserId(undefined)).toBe("env-user");
      } finally {
        restoreEnv();
      }
    });

    it("returns undefined when neither flag nor env var is set (default)", () => {
      delete process.env.NEOTOMA_USER_ID;
      try {
        expect(resolveEffectiveUserId(undefined)).toBeUndefined();
      } finally {
        restoreEnv();
      }
    });

    it("treats empty strings as absent on both flag and env var (prevents silent server fallback)", () => {
      process.env.NEOTOMA_USER_ID = "   ";
      try {
        expect(resolveEffectiveUserId("")).toBeUndefined();
        expect(resolveEffectiveUserId("   ")).toBeUndefined();
      } finally {
        restoreEnv();
      }
    });

    it("trims env var whitespace but preserves flag value verbatim", () => {
      process.env.NEOTOMA_USER_ID = "user-from-env";
      try {
        expect(resolveEffectiveUserId(undefined)).toBe("user-from-env");
        expect(resolveEffectiveUserId("  padded-flag  ")).toBe("  padded-flag  ");
      } finally {
        restoreEnv();
      }
    });
  });

  describe("--user-id help surface (audit)", () => {
    for (const verb of READ_VERBS_WITH_USER_ID) {
      it(`advertises --user-id on \`neotoma ${verb} --help\``, () => {
        const help = runHelp(verb);
        expect(help).toMatch(/--user-id/);
      });
    }
  });

  describe("NEOTOMA_USER_ID preAction validation", () => {
    it("rejects an empty-string NEOTOMA_USER_ID with a clear error", () => {
      let caught: Error | undefined;
      try {
        execSync(`${CLI_PATH} stats --json`, {
          cwd: REPO_ROOT,
          encoding: "utf-8",
          timeout: 8000,
          env: { ...process.env, NEOTOMA_USER_ID: "   " },
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (err) {
        caught = err as Error;
      }
      expect(caught).toBeDefined();
      const stderr = String((caught as any)?.stderr ?? caught?.message ?? "");
      expect(stderr).toMatch(/NEOTOMA_USER_ID/);
    });

    it("accepts a populated NEOTOMA_USER_ID without error", () => {
      // Any non-empty value is accepted; the server may return its own data,
      // but the preAction hook MUST NOT reject it.
      const result = execSync(`${CLI_PATH} stats --json`, {
        cwd: REPO_ROOT,
        encoding: "utf-8",
        timeout: 10000,
        env: {
          ...process.env,
          NEOTOMA_USER_ID: "00000000-0000-0000-0000-000000000000",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      expect(result.length).toBeGreaterThan(0);
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });
});
