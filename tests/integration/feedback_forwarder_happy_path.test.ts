/**
 * Happy-path integration test for the Netlify -> Neotoma forwarder.
 *
 * Exercises `forwardToNeotoma()` with a stub signer-fetch that plays the
 * `store_structured` response shape. Asserts:
 *   - The outbound request carries the Cloudflare Access service-token
 *     headers, the self-reported agent label, and JSON body.
 *   - The mapped payload includes the full `neotoma_feedback` entity and
 *     a deterministic `idempotency_key` per feedback_id.
 *   - A subsequent update-path forward with op=update patches the SAME
 *     entity (same idempotency_key) rather than forking a duplicate.
 *   - Authentication flows via AAuth signing, not a bearer token.
 */

import { describe, expect, it } from "vitest";

import { forwardToNeotoma } from "../../services/agent-site/netlify/lib/forwarder.js";
import type { StoredFeedback } from "../../services/agent-site/netlify/lib/types.js";
import type { signedFetch as SignedFetchFn } from "../../services/agent-site/netlify/lib/aauth_signer.js";

function baseRecord(overrides: Partial<StoredFeedback> = {}): StoredFeedback {
  return {
    id: "fbk_happy_1",
    submitter_id: "agent-cursor-test",
    kind: "incident",
    title: "Happy-path submission",
    body: "Body with no PII.",
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
      related_entity_ids: ["ent_issue_1"],
      notes_markdown: "",
      verifications: [],
    },
    upgrade_guidance: null,
    triage_notes: null,
    last_activity_at: null,
    next_check_suggested_at: "2026-04-22T13:00:00.000Z",
    access_token_hash: "hashA",
    redaction_applied: true,
    redaction_backstop_hits: [],
    consecutive_same_status_polls: 0,
    ...overrides,
  };
}

describe("feedback forwarder happy path", () => {
  it("sends the expected entity payload and captures the returned entity_id", async () => {
    const captured: Array<Parameters<typeof SignedFetchFn>> = [];

    const stubSignedFetch = (async (url, options) => {
      captured.push([url, options]);
      return new Response(
        JSON.stringify({
          structured: {
            entities: [
              { entity_type: "neotoma_feedback", entity_id: "ent_feedback_abc" },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) satisfies typeof SignedFetchFn;

    const result = await forwardToNeotoma(baseRecord(), "create", {
      mode: "best_effort",
      tunnelUrl: "https://neotoma-tunnel.example.com",
      cfAccessClientId: "cf-id",
      cfAccessClientSecret: "cf-secret",
      agentLabel: "agent-site@neotoma.io",
      timeoutMs: 2000,
      signedFetchImpl: stubSignedFetch,
    });

    expect(result.mirrored).toBe(true);
    expect(result.entity_id).toBe("ent_feedback_abc");

    expect(captured).toHaveLength(1);
    const [url, options] = captured[0]!;
    expect(url).toBe("https://neotoma-tunnel.example.com/store");
    expect(options.method).toBe("POST");

    const headers = options.headers as Record<string, string>;
    // Bearer is retired — AAuth signer adds its own Authorization header
    // inside `@hellocoop/httpsig`; forwarder itself no longer attaches one.
    expect(headers.authorization).toBeUndefined();
    expect(headers["cf-access-client-id"]).toBe("cf-id");
    expect(headers["cf-access-client-secret"]).toBe("cf-secret");
    expect(headers["x-agent-label"]).toBe("agent-site@neotoma.io");
    expect(headers["content-type"]).toBe("application/json");

    const body = JSON.parse(String(options.body));
    expect(body.idempotency_key).toBe("neotoma_feedback-fbk_happy_1");
    expect(Array.isArray(body.entities)).toBe(true);
    const entity = body.entities[0];
    expect(entity.entity_type).toBe("neotoma_feedback");
    expect(entity.feedback_id).toBe("fbk_happy_1");
    expect(entity.neotoma_version).toBe("0.5.1");
    expect(entity.data_source).toMatch(/^agent-site netlify submit /);
    expect(body.related_entity_ids).toEqual(["ent_issue_1"]);
  });

  it("op=update reuses the idempotency_key so admin patches land on the same entity", async () => {
    const captured: unknown[] = [];

    const stubSignedFetch = (async (_url, options) => {
      captured.push(JSON.parse(String(options.body)));
      return new Response(
        JSON.stringify({
          structured: {
            entities: [
              { entity_type: "neotoma_feedback", entity_id: "ent_feedback_abc" },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) satisfies typeof SignedFetchFn;

    const baseConfig = {
      mode: "best_effort" as const,
      tunnelUrl: "https://neotoma-tunnel.example.com",
      signedFetchImpl: stubSignedFetch,
    };

    const first = await forwardToNeotoma(baseRecord(), "create", baseConfig);
    const second = await forwardToNeotoma(
      baseRecord({ status: "in_progress" }),
      "update",
      baseConfig,
    );

    expect(first.entity_id).toBe("ent_feedback_abc");
    expect(second.entity_id).toBe("ent_feedback_abc");

    const [firstBody, secondBody] = captured as Array<Record<string, unknown>>;
    expect(firstBody.idempotency_key).toBe("neotoma_feedback-fbk_happy_1");
    expect(secondBody.idempotency_key).toBe("neotoma_feedback-fbk_happy_1");
    expect((secondBody.entities as Array<Record<string, unknown>>)[0]!.data_source).toMatch(
      /^agent-site netlify update /,
    );
  });

  it("returns disabled without a network call when mode=off", async () => {
    let called = 0;
    const stubSignedFetch = (async () => {
      called++;
      return new Response("{}", { status: 200 });
    }) satisfies typeof SignedFetchFn;

    const result = await forwardToNeotoma(baseRecord(), "create", {
      mode: "off",
      tunnelUrl: "https://x",
      signedFetchImpl: stubSignedFetch,
    });

    expect(result.mirrored).toBe(false);
    expect(result.reason).toBe("disabled");
    expect(called).toBe(0);
  });

  it("returns misconfigured when tunnel URL is missing", async () => {
    const stubSignedFetch = (async () =>
      new Response("{}")) satisfies typeof SignedFetchFn;
    const result = await forwardToNeotoma(baseRecord(), "create", {
      mode: "best_effort",
      tunnelUrl: undefined,
      signedFetchImpl: stubSignedFetch,
    });
    expect(result.mirrored).toBe(false);
    expect(result.reason).toBe("misconfigured");
  });

  it("returns signer_misconfigured when the signer rejects at call-time", async () => {
    const { SignerConfigError } = await import(
      "../../services/agent-site/netlify/lib/aauth_signer.js"
    );
    const stubSignedFetch = (async () => {
      throw new SignerConfigError("AGENT_SITE_AAUTH_PRIVATE_JWK missing");
    }) satisfies typeof SignedFetchFn;

    const result = await forwardToNeotoma(baseRecord(), "create", {
      mode: "best_effort",
      tunnelUrl: "https://neotoma-tunnel.example.com",
      signedFetchImpl: stubSignedFetch,
    });

    expect(result.mirrored).toBe(false);
    expect(result.reason).toBe("signer_misconfigured");
  });
});
