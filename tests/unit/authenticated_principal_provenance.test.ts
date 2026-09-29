/**
 * #2240 — the signed-in person rides the request-scoped attribution context
 * into write provenance as `authenticated_actor_id`.
 *
 * Unit-level contract for the carrier. The end-to-end effect (two members'
 * stored observations differ; static-token and pre-identity writes name no
 * one) lives in tests/integration/shared_graph_write_attribution.test.ts.
 */

import { describe, expect, it } from "vitest";

import {
  createAgentIdentity,
  toAttributionProvenance,
  type ExternalActor,
} from "../../src/crypto/agent_identity.js";
import {
  getCurrentAttribution,
  getCurrentAuthenticatedPrincipal,
  getRequestContext,
  runWithAuthenticatedPrincipal,
  runWithExternalActor,
  runWithRequestContext,
} from "../../src/services/request_context.js";

const PRINCIPAL = { actorId: "11111111-2240-4111-8111-111111111111" };

const ACTOR: ExternalActor = {
  provider: "github",
  login: "octo",
  id: 1,
  type: "User",
  verified_via: "claim",
};

describe("toAttributionProvenance with an authenticated principal (#2240)", () => {
  it("records the principal as authenticated_actor_id even without an agent identity", () => {
    expect(toAttributionProvenance(null, null, PRINCIPAL)).toEqual({
      authenticated_actor_id: PRINCIPAL.actorId,
    });
  });

  it("records the principal alongside, not instead of, the agent and external actor", () => {
    const identity = createAgentIdentity({ clientName: "probe-client" });
    const prov = toAttributionProvenance(identity, ACTOR, PRINCIPAL);
    expect(prov.authenticated_actor_id).toBe(PRINCIPAL.actorId);
    expect(prov.attribution_tier).toBe("unverified_client");
    expect(prov.client_name).toBe("probe-client");
    expect(prov.external_actor).toEqual(ACTOR);
  });

  it("emits no authenticated_actor_id key when there is no principal", () => {
    const identity = createAgentIdentity({ clientName: "probe-client" });
    expect(toAttributionProvenance(identity, null, null)).not.toHaveProperty(
      "authenticated_actor_id"
    );
    expect(toAttributionProvenance(identity)).not.toHaveProperty("authenticated_actor_id");
    expect(toAttributionProvenance(null, null, { actorId: "" })).toEqual({});
  });
});

describe("request context carries the principal (#2240)", () => {
  it("is absent outside any context and in a context that never set one", async () => {
    expect(getCurrentAuthenticatedPrincipal()).toBeNull();
    await runWithRequestContext({ agentIdentity: null }, () => {
      expect(getCurrentAuthenticatedPrincipal()).toBeNull();
      expect(getCurrentAttribution()).not.toHaveProperty("authenticated_actor_id");
    });
  });

  it("runWithAuthenticatedPrincipal adds the principal and preserves every other slot", async () => {
    const identity = createAgentIdentity({ clientName: "probe-client" });
    const admission = { admitted: true, reason: "matched", user_id: "u" } as never;
    await runWithRequestContext(
      {
        agentIdentity: identity,
        aauthAdmission: admission,
        externalActor: ACTOR,
        mcpConnectionId: "conn-2240",
      },
      () =>
        runWithAuthenticatedPrincipal(PRINCIPAL, () => {
          const ctx = getRequestContext();
          expect(ctx?.agentIdentity).toBe(identity);
          expect(ctx?.aauthAdmission).toBe(admission);
          expect(ctx?.externalActor).toBe(ACTOR);
          expect(ctx?.mcpConnectionId).toBe("conn-2240");
          expect(getCurrentAttribution().authenticated_actor_id).toBe(PRINCIPAL.actorId);
        })
    );
  });

  it("a nested runWithExternalActor keeps the principal", async () => {
    await runWithAuthenticatedPrincipal(PRINCIPAL, () =>
      runWithExternalActor(ACTOR, () => {
        const prov = getCurrentAttribution();
        expect(prov.authenticated_actor_id).toBe(PRINCIPAL.actorId);
        expect(prov.external_actor).toEqual(ACTOR);
      })
    );
  });

  it("passing null clears the principal for a nested scope", async () => {
    await runWithAuthenticatedPrincipal(PRINCIPAL, () =>
      runWithAuthenticatedPrincipal(null, () => {
        expect(getCurrentAuthenticatedPrincipal()).toBeNull();
        expect(getCurrentAttribution()).not.toHaveProperty("authenticated_actor_id");
      })
    );
  });
});
