import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
const exec = promisify(execFile);
const root = resolve(".");

it("compiles canonical consumer examples and rejects unkeyed legacy signatures", async () => {
  const result = await exec(
    process.execPath,
    [
      "node_modules/typescript/bin/tsc",
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "tests/fixtures/client_correction/consumer_types.mts",
    ],
    { timeout: 30_000 }
  );
  expect(result.stdout).toBe("");
});

describe.each(["local", "http"])("built SDK correction consumer, %s", (mode) => {
  it("persists canonical and reviewed corrections, replays keys, refuses invalid/partial writes", async () => {
    const home = await mkdtemp(join(tmpdir(), "sdk-client-"));
    const env: NodeJS.ProcessEnv = {
      HOME: home,
      USERPROFILE: home,
      NODE_ENV: "test",
      NEOTOMA_ENV: "development",
      NEOTOMA_DATA_DIR: join(home, "data"),
      NEOTOMA_SQLITE_PATH: join(home, "data/neotoma.db"),
      NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR: "1",
      OPENAI_API_KEY: "",
      ICON_GENERATION_ENABLED: "false",
      TUNNEL_AUTO_DISCOVER: "0",
      // Bind all synthetic consumers to the same legacy test principal.
      NEOTOMA_FORCE_MODE: "refuse",
      NEOTOMA_REFUSE_MODE: "warn",
    };
    for (const key of [
      "PATH",
      "LANG",
      "TMPDIR",
      "NODE_OPTIONS",
      "SCHEMA_GATE_IPC_ROOT",
      "SCHEMA_GATE_NETWORK_JOURNAL",
    ]) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    try {
      const result = await exec(
        process.execPath,
        ["tests/fixtures/client_correction/consumer.mjs", root, mode],
        { env, timeout: 45_000, maxBuffer: 4 * 1024 * 1024 }
      );
      const line = result.stdout
        .split("\n")
        .find((item) => item.startsWith("SDK_CORRECTION_RESULT="));
      expect(line, result.stderr).toBeDefined();
      expect(JSON.parse(line!.split("=")[1])).toEqual({
        mode,
        complete: true,
        observationCount: 6,
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
