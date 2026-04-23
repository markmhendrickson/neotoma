/**
 * Integration test covering the tunnel-down failure mode for the Netlify
 * -> Neotoma forwarder.
 *
 * Asserts:
 *   - `forwardToNeotoma` returns `{ mirrored: false, reason: 'http_503' }`
 *     when the local Neotoma endpoint (or the tunnel fronting it) is down.
 *     It never throws, so the submit path can ignore the failure and still
 *     answer the agent in <300ms.
 *   - Running the scheduled `push_webhook_worker` with a queued mirror task
 *     surfaces the failure onto the Blobs-side record (`mirror_last_error`,
 *     `mirrored_to_neotoma=false`) and requeues with exponential backoff.
 *   - A later drain, when the tunnel is back, stamps
 *     `mirrored_to_neotoma=true` + `neotoma_entity_id` and clears
 *     `mirror_last_error`.
 *   - Authentication flows via the AAuth signer module, not a bearer token.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { forwardToNeotoma } from "../../services/agent-site/netlify/lib/forwarder.js";
import type { signedFetch as SignedFetchFn } from "../../services/agent-site/netlify/lib/aauth_signer.js";
import type {
  MirrorTask,
  WebhookTask,
} from "../../services/agent-site/netlify/lib/storage.js";
import type { StoredFeedback } from "../../services/agent-site/netlify/lib/types.js";

function baseRecord(overrides: Partial<StoredFeedback> = {}): StoredFeedback {
  return {
    id: "fbk_tunneldown_1",
    submitter_id: "agent-cursor-test",
    kind: "incident",
    title: "Tunnel-down submission",
    body: "Body.",
    metadata: {
      environment: {
        neotoma_version: "0.5.1",
        client_name: "cursor-agent",
        os: "darwin",
      },
    },
    submitted_at: "2026-04-22T12:00:00.000Z",
    status: "submitted",
    status_updated_at: "2026-04-22T12:00:00.000Z",
    classification: null,
    resolution_links: {
      github_issue_urls: [],
      pull_request_urls: [],
      commit_shas: [],
      duplicate_of_feedback_id: null,
      related_entity_ids: [],
      notes_markdown: "",
      verifications: [],
    },
    upgrade_guidance: null,
    triage_notes: null,
    last_activity_at: null,
    next_check_suggested_at: null,
    access_token_hash: "hashA",
    redaction_applied: false,
    redaction_backstop_hits: [],
    consecutive_same_status_polls: 0,
    ...overrides,
  };
}

describe("forwarder: tunnel returns 503", () => {
  it("returns a structured failure without throwing", async () => {
    const stubSignedFetch = (async () =>
      new Response("tunnel down", { status: 503 })) satisfies typeof SignedFetchFn;

    const result = await forwardToNeotoma(baseRecord(), "create", {
      mode: "best_effort",
      tunnelUrl: "https://neotoma-tunnel.example.com",
      signedFetchImpl: stubSignedFetch,
    });

    expect(result.mirrored).toBe(false);
    expect(result.reason).toBe("http_503");
    expect(result.http_status).toBe(503);
  });

  it("classifies network aborts as `timeout`", async () => {
    const stubSignedFetch = (async (_url, options) => {
      // Force the abort signal to fire by waiting past the configured timeout.
      await new Promise((resolve) => setTimeout(resolve, 50));
      options.signal?.throwIfAborted?.();
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    }) satisfies typeof SignedFetchFn;

    const result = await forwardToNeotoma(baseRecord(), "create", {
      mode: "best_effort",
      tunnelUrl: "https://neotoma-tunnel.example.com",
      timeoutMs: 250,
      signedFetchImpl: stubSignedFetch,
    });

    expect(result.mirrored).toBe(false);
    expect(["timeout", "network"]).toContain(result.reason);
  });
});

describe("push_webhook_worker: mirror drain with tunnel flake", () => {
  const records = new Map<string, StoredFeedback>();
  let mirrorQueue: MirrorTask[] = [];
  let webhookQueue: WebhookTask[] = [];
  let fetchCalls: Array<{ url: string; options: unknown }> = [];
  let fetchQueue: Array<() => Promise<Response>> = [];

  beforeEach(() => {
    vi.resetModules();
    records.clear();
    mirrorQueue = [];
    webhookQueue = [];
    fetchCalls = [];
    fetchQueue = [];

    process.env.NEOTOMA_FEEDBACK_FORWARD_MODE = "best_effort";
    process.env.NEOTOMA_TUNNEL_URL = "https://neotoma-tunnel.example.com";
    process.env.CF_ACCESS_CLIENT_ID = "cf-id";
    process.env.CF_ACCESS_CLIENT_SECRET = "cf-secret";

    // Mock the signer module so the worker (which invokes forwardToNeotoma
    // without a config override) does not attempt to load a private JWK.
    vi.doMock("../../services/agent-site/netlify/lib/aauth_signer.js", () => {
      class SignerConfigError extends Error {
        readonly code = "signer_misconfigured" as const;
      }
      const signedFetch = (async (url: string, options: {
        method: string;
        headers?: Record<string, string>;
        body?: string;
        signal?: AbortSignal;
      }) => {
        fetchCalls.push({ url, options });
        const next = fetchQueue.shift();
        if (!next) {
          return new Response("{}", {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return next();
      }) as typeof SignedFetchFn;
      return {
        signedFetch,
        SignerConfigError,
        loadSignerConfigFromEnv: () => ({
          privateJwk: {},
          sub: "agent-site@neotoma.io",
          iss: "https://agent.neotoma.io",
        }),
      };
    });

    vi.doMock("../../services/agent-site/netlify/lib/storage.js", () => {
      return {
        readFeedback: async (id: string) => records.get(id) ?? null,
        writeFeedback: async (r: StoredFeedback) => {
          records.set(r.id, structuredClone(r));
        },
        drainMirrorQueue: async (now: Date) => {
          const due = mirrorQueue.filter(
            (t) => new Date(t.next_try_at).getTime() <= now.getTime(),
          );
          mirrorQueue = mirrorQueue.filter(
            (t) => new Date(t.next_try_at).getTime() > now.getTime(),
          );
          return due;
        },
        requeueMirror: async (t: MirrorTask) => {
          mirrorQueue = mirrorQueue.filter(
            (q) => !(q.feedback_id === t.feedback_id && q.op === t.op),
          );
          mirrorQueue.push(t);
        },
        drainWebhookQueue: async () => {
          const out = webhookQueue;
          webhookQueue = [];
          return out;
        },
        requeueWebhook: async (t: WebhookTask) => {
          webhookQueue.push(t);
        },
      };
    });
  });

  afterEach(() => {
    vi.resetModules();
    vi.unmock("../../services/agent-site/netlify/lib/storage.js");
    vi.unmock("../../services/agent-site/netlify/lib/aauth_signer.js");
    delete process.env.NEOTOMA_FEEDBACK_FORWARD_MODE;
    delete process.env.NEOTOMA_TUNNEL_URL;
    delete process.env.CF_ACCESS_CLIENT_ID;
    delete process.env.CF_ACCESS_CLIENT_SECRET;
  });

  it("first drain surfaces failure and requeues; later drain succeeds", async () => {
    const record = baseRecord();
    records.set(record.id, record);
    mirrorQueue.push({
      feedback_id: record.id,
      op: "create",
      attempts: 0,
      next_try_at: "2026-04-22T12:00:00.000Z",
      enqueued_at: "2026-04-22T12:00:00.000Z",
    });

    fetchQueue.push(async () => new Response("down", { status: 503 }));

    const worker = await import(
      "../../services/agent-site/netlify/functions/push_webhook_worker.js"
    );
    const res1 = await worker.default(new Request("https://x/"));
    expect(res1.status).toBe(200);

    const afterFailure = records.get(record.id)!;
    expect(afterFailure.mirrored_to_neotoma).toBe(false);
    expect(afterFailure.mirror_last_error).toBe("http_503");
    expect(afterFailure.mirror_attempts).toBe(1);
    expect(mirrorQueue).toHaveLength(1);
    expect(new Date(mirrorQueue[0]!.next_try_at).getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(mirrorQueue[0]!.attempts).toBe(1);

    mirrorQueue[0]!.next_try_at = new Date(Date.now() - 1000).toISOString();
    fetchQueue.push(
      async () =>
        new Response(
          JSON.stringify({
            structured: {
              entities: [
                {
                  entity_type: "neotoma_feedback",
                  entity_id: "ent_recovered_1",
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    const res2 = await worker.default(new Request("https://x/"));
    expect(res2.status).toBe(200);

    const afterSuccess = records.get(record.id)!;
    expect(afterSuccess.mirrored_to_neotoma).toBe(true);
    expect(afterSuccess.neotoma_entity_id).toBe("ent_recovered_1");
    expect(afterSuccess.mirror_last_error).toBeUndefined();
    expect(mirrorQueue).toHaveLength(0);
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0]!.url).toBe(
      "https://neotoma-tunnel.example.com/store",
    );
  });

  it("skips forwarding entirely when NEOTOMA_FEEDBACK_FORWARD_MODE=off", async () => {
    process.env.NEOTOMA_FEEDBACK_FORWARD_MODE = "off";
    records.set("fbk_off", baseRecord({ id: "fbk_off" }));
    mirrorQueue.push({
      feedback_id: "fbk_off",
      op: "create",
      attempts: 0,
      next_try_at: new Date(Date.now() - 1000).toISOString(),
      enqueued_at: new Date().toISOString(),
    });

    const worker = await import(
      "../../services/agent-site/netlify/functions/push_webhook_worker.js"
    );
    const res = await worker.default(new Request("https://x/"));
    const body = await res.json();
    expect(body.mirrors_processed).toBe(0);
    expect(fetchCalls).toHaveLength(0);
    expect(mirrorQueue).toHaveLength(1);
  });
});
