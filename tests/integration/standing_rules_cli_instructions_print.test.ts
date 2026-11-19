/**
 * `neotoma instructions print` against an isolated server with a synthetic
 * Bearer token: when the configured identity authenticates, stdout is the
 * composed text (standing rules first) the instructions endpoint serves for
 * that identity, and a stderr line says so; without a token, stdout is the
 * global text and the stderr line says that instead.
 *
 * The server is the real Express app booted in this process on a throwaway
 * data directory; the rule lookup is mocked so the rule set is exact. The CLI
 * runs as a separate process from the built dist with an isolated HOME.
 */

import { exec } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { StandingRule } from "../../src/services/standing_rules.js";
import {
  bootMcpApp,
  prepareMcpTestEnv,
  type BootedMcpApp,
  type McpTestEnv,
} from "../helpers/mcp_http_modern.js";

const execAsync = promisify(exec);

const state: { rules: StandingRule[] } = { rules: [] };

vi.mock("../../src/services/standing_rules.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/standing_rules.js")>();
  return {
    ...actual,
    getActiveStandingRulesResult: vi.fn(async () => ({ rules: state.rules, lookup_failed: false })),
  };
});

const SYNTHETIC_BEARER = "synthetic-cli-print-bearer-token";

describe("neotoma instructions print with standing rules", { timeout: 120_000 }, () => {
  let env: McpTestEnv;
  let app: BootedMcpApp;
  let home: string;

  beforeAll(async () => {
    env = prepareMcpTestEnv("neotoma-rules-cli-");
    process.env.NEOTOMA_BEARER_TOKEN = SYNTHETIC_BEARER;
    app = await bootMcpApp();
    home = mkdtempSync(path.join(tmpdir(), "neotoma-rules-cli-home-"));
  }, 120_000);

  afterAll(async () => {
    await app.close();
    vi.resetModules();
    env.restore();
    rmSync(home, { recursive: true, force: true });
  });

  async function printInstructions(token: string | null) {
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: home,
      NEOTOMA_ENCRYPTION_ENABLED: "false",
    };
    if (token) childEnv.NEOTOMA_BEARER_TOKEN = token;
    else delete childEnv.NEOTOMA_BEARER_TOKEN;
    return execAsync(`node dist/cli/index.js --base-url ${app.baseUrl} instructions print`, {
      env: childEnv,
      maxBuffer: 16 * 1024 * 1024,
    });
  }

  it("prints the composed text for the configured identity and says so on stderr", async () => {
    state.rules = [
      {
        entity_id: "ent_cli_rule_one",
        title: "Synthetic CLI rule one",
        rule_text: "Body of synthetic CLI rule one.",
        priority: 2,
      },
      {
        entity_id: "ent_cli_rule_two",
        title: "Synthetic CLI rule two",
        rule_text: "Body of synthetic CLI rule two.",
        priority: 1,
      },
    ];
    const { stdout, stderr } = await printInstructions(SYNTHETIC_BEARER);
    expect(stdout.startsWith("[STANDING RULES]\n")).toBe(true);
    expect(stdout).toContain("> Body of synthetic CLI rule one.");
    expect(stdout).toContain("> Body of synthetic CLI rule two.");
    expect(stdout).toContain("[TURN LIFECYCLE]");
    expect(stdout).not.toContain("Printed:");
    expect(stderr.trim().split("\n").pop()).toContain("composed for the configured identity");

    const served = await fetch(`${app.baseUrl}/mcp-interaction-instructions`, {
      headers: { Authorization: `Bearer ${SYNTHETIC_BEARER}` },
    });
    expect(stdout).toBe(`${(await served.text()).replace(/\n$/, "")}\n`);
  });

  it("prints the global text without a token and says so on stderr", async () => {
    state.rules = [
      {
        entity_id: "ent_cli_rule_one",
        title: "Synthetic CLI rule one",
        rule_text: "Body of synthetic CLI rule one.",
        priority: 2,
      },
    ];
    const { stdout, stderr } = await printInstructions(null);
    expect(stdout.startsWith("[STANDING RULES]")).toBe(false);
    expect(stdout).not.toContain("Body of synthetic CLI rule one.");
    expect(stdout).toContain("[TURN LIFECYCLE]");
    expect(stderr.trim().split("\n").pop()).toContain("global instructions");
  });
});
