/**
 * `neotoma instructions print` states the skipped standing-rule count in the
 * printed text, for the case where every stored rule lacks `rule_text`.
 *
 * Starts an isolated Neotoma server, stores a synthetic `standing_rule` with
 * no `rule_text` over HTTP, then runs the built CLI against it through the
 * local-target helper. The rules section must still render (it would
 * otherwise be absent, reading as "no rules") and carry the count line, and
 * the printed text must equal what GET /mcp-interaction-instructions serves.
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

const SKIPPED_LINE = "1 stored standing rule could not be applied because it has no rule text.";

describe(
  "neotoma instructions print with every standing rule skipped",
  { timeout: 180_000 },
  () => {
    let server: IsolatedServer;
    let home: string;

    beforeAll(async () => {
      server = await startIsolatedNeotomaServer({ useTsx: false });
      home = mkdtempSync(path.join(tmpdir(), "neotoma-rules-cli-skipped-home-"));
      const store = await fetch(`${server.baseUrl}/store`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${server.token}` },
        body: JSON.stringify({
          idempotency_key: "standing-rules-cli-skipped-seed",
          entities: [
            {
              entity_type: "standing_rule",
              title: "Synthetic rule without text",
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

    it("prints the rules section with the count line, matching the REST endpoint", async () => {
      const { stdout, stderr } = await execAsync(
        `node dist/cli/index.js --base-url ${server.baseUrl} instructions print`,
        {
          env: {
            ...process.env,
            HOME: home,
            NEOTOMA_ENCRYPTION_ENABLED: "false",
            NEOTOMA_BEARER_TOKEN: server.token,
          },
          maxBuffer: 16 * 1024 * 1024,
        }
      );
      expect(stdout.startsWith("[STANDING RULES]\n")).toBe(true);
      const block = stdout.slice(0, stdout.indexOf("\n[END STANDING RULES]"));
      expect(block).toContain(SKIPPED_LINE);
      // Count only: the skipped rule's title is not named.
      expect(block).not.toContain("Synthetic rule without text");
      expect(stderr.trim().split("\n").pop()).toContain("composed for the configured identity");

      const served = await fetch(`${server.baseUrl}/mcp-interaction-instructions`, {
        headers: { Authorization: `Bearer ${server.token}` },
      });
      expect(stdout).toBe(`${(await served.text()).replace(/\n$/, "")}\n`);
    });
  }
);
