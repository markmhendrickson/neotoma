/**
 * Regression test: substrate events survive the MCP stdio process shape
 * (#2326).
 *
 * `installSubscriptionBridge()` used to be called from exactly one place —
 * inside the `tryListen` success branch of HTTP startup in `actions.ts`.
 * The MCP stdio entrypoint (`src/index.ts`) sets
 * `NEOTOMA_ACTIONS_DISABLE_AUTOSTART=1` before any import and never
 * imports `actions.ts` at all, so that branch is never entered. Events
 * *were* produced under stdio — `server.ts` emits `observation.created`
 * and `entity.created` on the MCP store path — into a bus whose only
 * persisting listener had never been registered. `pushSubstrateEventToRing`
 * was never called and SSE resume had no durable floor for that window.
 *
 * Two tests, because they fail for different reasons and only one of them
 * catches a regression in the entrypoint itself.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDb } from "../../src/repositories/db/connection.js";
import { NeotomaServer } from "../../src/server.js";
import { installSubscriptionBridge } from "../../src/services/subscriptions/install_subscription_bridge.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("substrate events under the MCP stdio process shape (#2326)", () => {
  it("T1: an MCP store writes durable substrate_events rows once the bridge is installed", async () => {
    // Stands in for what src/index.ts now does at startup. Before the fix
    // this call did not exist in any MCP entrypoint, so the equivalent
    // process registered no persisting listener and the count below stayed
    // at zero.
    installSubscriptionBridge();

    const server = new NeotomaServer();
    const marker = `stdio-bridge-${Date.now()}`;

    const before = await countEvents();

    await server.executeToolForCli(
      "store",
      {
        entities: [{ entity_type: "note", title: marker, content: marker }],
        idempotency_key: marker,
      },
      TEST_USER_ID
    );

    // The bridge persists asynchronously off the emit; give it a tick.
    await waitFor(async () => (await countEvents()) > before, 5000);

    expect(await countEvents()).toBeGreaterThan(before);
  });

  it("T1b: the MCP stdio entrypoint installs the bridge and asserts the listener", () => {
    // The honest version of T1. T1 calls the installer itself, so it would
    // still pass if someone deleted the call from the entrypoint — which is
    // precisely the defect. This reads the entrypoint source. Crude, but it
    // is the only assertion here that fails on the actual regression, and
    // no test executes `src/index.ts`.
    const source = readFileSync(path.join(REPO_ROOT, "src/index.ts"), "utf8");
    expect(source).toMatch(/install_subscription_bridge\.js/);
    expect(source).toMatch(/installSubscriptionBridge\(\)/);
    expect(source).toMatch(/assertSubstrateListenerInstalled\(\)/);
  });
});

async function countEvents(): Promise<number> {
  const row = (await (await getDb())
    .prepare(`SELECT COUNT(*) AS n FROM substrate_events WHERE user_id = ?`)
    .get(TEST_USER_ID)) as { n: number } | undefined;
  return row?.n ?? 0;
}

async function waitFor(pred: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}
