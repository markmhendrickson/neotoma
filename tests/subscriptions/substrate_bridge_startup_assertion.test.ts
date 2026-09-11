/**
 * Unit test: the startup assertion that a persisting substrate-event
 * listener exists (#2326).
 *
 * This is the half of #2326 that fixes the *class* rather than the
 * instance. The original defect was that `installSubscriptionBridge()`
 * was called only from the HTTP startup path, so under MCP stdio every
 * substrate event was emitted into a bus with no persisting listener and
 * silently discarded. It went unnoticed because "no listener" and
 * "healthy" were indistinguishable: the bus swallows listener throws, the
 * bridge swallows persist failures, and an empty listener list throws
 * nothing at all.
 *
 * The assertion makes absence loud at startup. It throws rather than
 * warns because the MCP stdio entrypoint suppresses logging to protect
 * JSON-RPC framing — a warning there is the same silence.
 *
 * Scope note: this asserts *wiring*, once, at startup. It is not a
 * per-event delivery guarantee. `philosophy.md` §5.9 bars the substrate
 * from retry queues, dead-letter queues, delivery acks, ordering, and
 * exactly-once semantics; a startup wiring check stays clear of that
 * line.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MODULE_PATH = "../../src/services/subscriptions/install_subscription_bridge.js";

describe("substrate listener startup assertion (#2326)", () => {
  const originalFlag = process.env.NEOTOMA_ALLOW_NO_EVENT_LISTENER;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEOTOMA_ALLOW_NO_EVENT_LISTENER;
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.NEOTOMA_ALLOW_NO_EVENT_LISTENER;
    else process.env.NEOTOMA_ALLOW_NO_EVENT_LISTENER = originalFlag;
    vi.resetModules();
  });

  it("reports the bridge as not installed in a fresh module registry", async () => {
    const mod = await import(MODULE_PATH);
    expect(mod.isSubscriptionBridgeInstalled()).toBe(false);
  });

  it("throws when no persisting listener is registered", async () => {
    const mod = await import(MODULE_PATH);
    expect(() => mod.assertSubstrateListenerInstalled()).toThrow(
      /No persisting substrate-event listener/i
    );
  });

  it("names the remedy in the message rather than only the symptom", async () => {
    const mod = await import(MODULE_PATH);
    let message = "";
    try {
      mod.assertSubstrateListenerInstalled();
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toMatch(/installSubscriptionBridge\(\)/);
    expect(message).toMatch(/initDatabase\(\)/);
  });

  it("does not throw when the embedded-use escape hatch is set", async () => {
    process.env.NEOTOMA_ALLOW_NO_EVENT_LISTENER = "1";
    const mod = await import(MODULE_PATH);
    expect(() => mod.assertSubstrateListenerInstalled()).not.toThrow();
    // The escape hatch suppresses the throw; it does not fake installation.
    expect(mod.isSubscriptionBridgeInstalled()).toBe(false);
  });

  it("does not throw once the bridge is installed, and the flag flips", async () => {
    const mod = await import(MODULE_PATH);
    expect(mod.isSubscriptionBridgeInstalled()).toBe(false);
    mod.installSubscriptionBridge();
    expect(mod.isSubscriptionBridgeInstalled()).toBe(true);
    expect(() => mod.assertSubstrateListenerInstalled()).not.toThrow();
  });
});
