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

/**
 * Same per-path proof with NEOTOMA_HOSTED_MODE unset and the listener bound
 * beyond loopback (NEOTOMA_HTTP_HOST=0.0.0.0). The guard must follow the bind
 * host, so every outbound path refuses a private target without the flag.
 */
describe("SSRF sink wiring (bound to 0.0.0.0, hosted-mode flag unset)", () => {
  const BIND = "NEOTOMA_HTTP_HOST";
  let prevHosted: string | undefined;
  let prevBind: string | undefined;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prevHosted = process.env[HOSTED];
    prevBind = process.env[BIND];
    delete process.env[HOSTED];
    process.env[BIND] = "0.0.0.0";
    fetchSpy = vi.fn(() => {
      throw new Error("fetch should not have been called for a private-host target");
    });
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    if (prevHosted === undefined) delete process.env[HOSTED];
    else process.env[HOSTED] = prevHosted;
    if (prevBind === undefined) delete process.env[BIND];
    else process.env[BIND] = prevBind;
    vi.unstubAllGlobals();
    vi.doUnmock("../../src/services/sync/peer_ops.js");
    vi.doUnmock("../../src/actions.js");
    vi.resetModules();
  });

  it("guardedFetch (outbound webhooks and peers) refuses 127.0.0.1 and 169.254.169.254", async () => {
    const { guardedFetch } = await import("../../src/services/net/private_host_guard.js");
    await expect(guardedFetch("http://127.0.0.1:9000/hook")).rejects.toThrow(/refusing to fetch/);
    await expect(guardedFetch(`http://${CLOUD_METADATA}/latest/meta-data/`)).rejects.toThrow(
      /refusing to fetch/
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("outbound peer webhook and webhook mirror refuse a private target before fetching", async () => {
    const { postOutboundSyncWebhook } =
      await import("../../src/services/sync/sync_webhook_outbound.js");
    const result = await postOutboundSyncWebhook({
      peerUrlBase: "http://127.0.0.1:3080",
      sharedSecret: "shh",
      payload: { peer_id: "p1", events: [] } as never,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("peer_url_not_public");

    const { postEntityToWebhookMirror } =
      await import("../../src/services/entity_submission/mirrors/webhook_mirror.js");
    await postEntityToWebhookMirror({
      url: `http://${CLOUD_METADATA}`,
      payload: { hello: "world" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sync_webhook_inbound refuses a private sender_peer_url before fetching", async () => {
    const peerUrl = "http://127.0.0.1:3080";
    vi.doMock("../../src/services/sync/peer_ops.js", () => ({
      getPeerForAAuthVerification: vi.fn(),
      getPeerSecretForVerification: vi.fn(async () => "secret"),
      listPeersWithSecrets: vi.fn(async () => [
        {
          entity_id: "ent_peer",
          peer_id: "peer-1",
          peer_name: "Peer 1",
          peer_url: peerUrl,
          direction: "bidirectional",
          entity_types: ["note"],
          sync_scope: "all",
          auth_method: "shared_secret",
          shared_secret: "secret",
          conflict_strategy: "last_write_wins",
          active: true,
        },
      ]),
    }));
    vi.doMock("../../src/actions.js", () => ({
      storeStructuredForApi: vi.fn(async () => ({ entities: [{ entity_id: "ent_remote" }] })),
    }));
    const { applyInboundSyncWebhook } =
      await import("../../src/services/sync/sync_webhook_inbound.js");
    const { signWebhookBody } =
      await import("../../src/services/subscriptions/webhook_delivery.js");
    const rawBody = JSON.stringify({
      sender_peer_id: "peer-1",
      sender_peer_url: peerUrl,
      target_user_id: "user-1",
      entity_id: "ent_remote",
      source_observation_id: "obs_remote",
    });
    await expect(
      applyInboundSyncWebhook({ rawBody, signatureHeader: signWebhookBody("secret", rawBody) })
    ).rejects.toThrow("SENDER_PEER_URL_PRIVATE_HOST");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  const manifestFor = (peerUrl: string) => async () =>
    JSON.stringify({
      version: 1,
      repo: "example-owner/example-repo",
      peer: { url: peerUrl, public_key_thumbprint: "thumb-example" },
      policy: { accepted_visibilities: ["public"], required_attestations: [] },
    });

  it("repo_discovery_resolver refuses a private peer.url", async () => {
    const { resolveRepoDiscovery } =
      await import("../../src/services/issues/repo_discovery_resolver.js");
    for (const peerUrl of ["http://127.0.0.1:3080", `http://${CLOUD_METADATA}`]) {
      const result = await resolveRepoDiscovery("example-owner/example-repo", manifestFor(peerUrl));
      expect(result.route, peerUrl).toBeNull();
      expect(result.reason, peerUrl).toBe("peer_url_private_host");
    }
  });

  it("repo_discovery_resolver accepts the same peer.url on a loopback bind (control)", async () => {
    process.env[BIND] = "127.0.0.1";
    const { resolveRepoDiscovery } =
      await import("../../src/services/issues/repo_discovery_resolver.js");
    const result = await resolveRepoDiscovery(
      "example-owner/example-repo",
      manifestFor("http://127.0.0.1:3080")
    );
    expect(result.route).not.toBeNull();
  });
});
