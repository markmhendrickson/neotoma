/**
 * `neotoma instructions print` serves the standing rules for the configured
 * identity (standing rules, round B).
 *
 * Starts an isolated Neotoma server (child process, temporary data dir, harness
 * bearer token), stores a synthetic `standing_rule` over HTTP, then runs the
 * built CLI against it through the local-target helper. With a token the CLI
 * prints the composed text (rules block first) and says so on stderr; without a
 * token it prints the global text and says so. The composed text must equal what
 * `GET /mcp-interaction-instructions` serves to the same caller.
 *
 * No mocks: the CLI runs as a separate process from the built dist with an
 * isolated HOME.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  startIsolatedNeotomaServer,
  type IsolatedServer,
} from "../../packages/eval-harness/src/isolated_server.js";
import { execAsync } from "../helpers/cli_local_target.js";

const RULE_ONE = "Body of synthetic CLI rule one.";
const RULE_TWO = "Body of synthetic CLI rule two.";

describe("neotoma instructions print with standing rules", { timeout: 180_000 }, () => {
  let server: IsolatedServer;
  let home: string;

  beforeAll(async () => {
    server = await startIsolatedNeotomaServer({ useTsx: false });
    home = mkdtempSync(path.join(tmpdir(), "neotoma-rules-cli-home-"));
    const store = await fetch(`${server.baseUrl}/store`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${server.token}` },
      body: JSON.stringify({
        idempotency_key: "standing-rules-cli-print-seed",
        entities: [
          {
            entity_type: "standing_rule",
            title: "Synthetic CLI rule one",
            rule_text: RULE_ONE,
            enabled: true,
            priority: 2,
          },
          {
            entity_type: "standing_rule",
            title: "Synthetic CLI rule two",
            rule_text: RULE_TWO,
            enabled: true,
            priority: 1,
          },
        ],
      }),
    });
    expect(store.status, `store failed: ${await store.clone().text()}`).toBe(200);
  }, 180_000);

  afterAll(async () => {
    await server?.stop();
    if (home) rmSync(home, { recursive: true, force: true });
  });

  async function printInstructions(token: string | null) {
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: home,
      NEOTOMA_ENCRYPTION_ENABLED: "false",
    };
    if (token) childEnv.NEOTOMA_BEARER_TOKEN = token;
    else delete childEnv.NEOTOMA_BEARER_TOKEN;
    return execAsync(`node dist/cli/index.js --base-url ${server.baseUrl} instructions print`, {
      env: childEnv,
      maxBuffer: 16 * 1024 * 1024,
    });
  }

  it("prints the composed text for the configured identity and says so on stderr", async () => {
    const { stdout, stderr } = await printInstructions(server.token);
    expect(stdout.startsWith("[STANDING RULES]\n")).toBe(true);
    expect(stdout).toContain(`> ${RULE_ONE}`);
    expect(stdout).toContain(`> ${RULE_TWO}`);
    expect(stdout).toContain("[TURN LIFECYCLE]");
    expect(stderr.trim().split("\n").pop()).toContain("composed for the configured identity");

    const served = await fetch(`${server.baseUrl}/mcp-interaction-instructions`, {
      headers: { Authorization: `Bearer ${server.token}` },
    });
    expect(stdout).toBe(`${(await served.text()).replace(/\n$/, "")}\n`);
  });

  it("prints the global text without a token and says so on stderr", async () => {
    const { stdout, stderr } = await printInstructions(null);
    expect(stdout.startsWith("[STANDING RULES]")).toBe(false);
    expect(stdout).not.toContain(RULE_ONE);
    expect(stdout).toContain("[TURN LIFECYCLE]");
    expect(stderr.trim().split("\n").pop()).toContain("global instructions");
  });
});
