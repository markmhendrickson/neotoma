/**
 * Sink-level wiring gate — SSRF guard, per caller-facing sink.
 *
 * `ssrf_outbound_host_guard.test.ts` locks the shared guard function
 * (`isPublicFetchUrlAllowed` / `isPrivateOrLoopbackHostname`) itself. It does
 * not prove any given sink actually calls that guard before its own `fetch`.
 * QA review on PR #2163 flagged exactly this gap: deleting the guard call
 * from `probePeerRemoteHealth` left the suite green, because nothing
 * exercised the sink with a private-host target and a stubbed `fetch` that
 * would fail the test if reached.
 *
 * Each test here stubs global `fetch` to throw if called, then asserts the
 * sink refuses a private/link-local target under hosted mode *before* ever
 * reaching that stub. A regression that removes the guard call turns "no
 * network call happened" into "the stub was called", which throws and fails
 * the test — the same class of proof the PR review asked for.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HOSTED = "NEOTOMA_HOSTED_MODE";
const CLOUD_METADATA = "169.254.169.254";

describe("SSRF sink wiring (hosted mode, stubbed fetch)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env[HOSTED] = "1";
    fetchSpy = vi.fn(() => {
      throw new Error("fetch should not have been called for a private-host target");
    });
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    delete process.env[HOSTED];
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("peer_health.probePeerRemoteHealth refuses before fetching", async () => {
    const { probePeerRemoteHealth } = await import("../../src/services/sync/peer_health.js");
    const result = await probePeerRemoteHealth(`http://${CLOUD_METADATA}`);
    expect(result.reachable).toBe(false);
    expect(result.error).toBe("peer_url_not_public");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sync_webhook_outbound.postOutboundSyncWebhook refuses before fetching", async () => {
    const { postOutboundSyncWebhook } =
      await import("../../src/services/sync/sync_webhook_outbound.js");
    const result = await postOutboundSyncWebhook({
      peerUrlBase: `http://${CLOUD_METADATA}`,
      sharedSecret: "shh",
      payload: { peer_id: "p1", events: [] } as never,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("peer_url_not_public");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sync_webhook_outbound.postOutboundSyncEntitiesRequest refuses before fetching", async () => {
    const { postOutboundSyncEntitiesRequest } =
      await import("../../src/services/sync/sync_webhook_outbound.js");
    const result = await postOutboundSyncEntitiesRequest({
      peerUrlBase: `http://${CLOUD_METADATA}`,
      sharedSecret: "shh",
      payload: { peer_id: "p1", entity_ids: [] } as never,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("peer_url_not_public");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("webhook_mirror.postEntityToWebhookMirror refuses before fetching", async () => {
    const { postEntityToWebhookMirror } =
      await import("../../src/services/entity_submission/mirrors/webhook_mirror.js");
    // The sink swallows the rejection (logs + returns) rather than throwing,
    // so the assertion is on the stub never being reached.
    await postEntityToWebhookMirror({
      url: `http://${CLOUD_METADATA}`,
      payload: { hello: "world" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("conflict_resolver resolveSyncConflict(prefer_remote) refuses before fetching", async () => {
    const { resolveSyncConflict } = await import("../../src/services/sync/conflict_resolver.js");
    const result = await resolveSyncConflict({
      userId: "user_test",
      entity_id: "ent_test",
      strategy: "prefer_remote",
      sender_peer_url: `http://${CLOUD_METADATA}`,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/public host/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
