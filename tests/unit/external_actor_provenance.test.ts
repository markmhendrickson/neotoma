import { describe, it, expect } from "vitest";
import {
  toAttributionProvenance,
  type AgentIdentity,
  type ExternalActor,
} from "../../src/crypto/agent_identity.js";
import {
  getCurrentAttribution,
  getCurrentExternalActor,
  runWithExternalActor,
  runWithRequestContext,
} from "../../src/services/request_context.js";

describe("toAttributionProvenance with externalActor", () => {
  const identity: AgentIdentity = {
    tier: "software",
    thumbprint: "test-thumb",
    sub: "agent@test",
    iss: "https://test.local",
  };

  const actor: ExternalActor = {
    provider: "github",
    login: "octocat",
    id: 123,
    type: "User",
    verified_via: "claim",
  };

  it("omits external_actor when not provided", () => {
    const result = toAttributionProvenance(identity);
    expect(result.external_actor).toBeUndefined();
  });

  it("omits external_actor when null", () => {
    const result = toAttributionProvenance(identity, null);
    expect(result.external_actor).toBeUndefined();
  });

  it("includes external_actor when provided", () => {
    const result = toAttributionProvenance(identity, actor);
    expect(result.external_actor).toEqual(actor);
    expect(result.agent_thumbprint).toBe("test-thumb");
    expect(result.attribution_tier).toBe("software");
  });

  it("includes external_actor even without identity", () => {
    const result = toAttributionProvenance(null, actor);
    expect(result.external_actor).toEqual(actor);
    expect(result.attribution_tier).toBeUndefined();
  });

  it("returns empty when both are null", () => {
    const result = toAttributionProvenance(null, null);
    expect(result).toEqual({});
  });
});

describe("runWithExternalActor", () => {
  const actor: ExternalActor = {
    provider: "github",
    login: "alice",
    id: 456,
    type: "User",
    verified_via: "webhook_signature",
    delivery_id: "abc-123",
  };

  it("makes external actor accessible via getCurrentExternalActor", async () => {
    let captured: ExternalActor | null = null;
    await runWithExternalActor(actor, () => {
      captured = getCurrentExternalActor();
    });
    expect(captured).toEqual(actor);
  });

  it("propagates external actor into getCurrentAttribution", async () => {
    let attribution: ReturnType<typeof getCurrentAttribution> | null = null;
    await runWithExternalActor(actor, () => {
      attribution = getCurrentAttribution();
    });
    expect(attribution!.external_actor).toEqual(actor);
  });

  it("preserves existing agentIdentity from outer context", async () => {
    const identity: AgentIdentity = {
      tier: "software",
      thumbprint: "outer-thumb",
      sub: "outer-sub",
    };

    let attribution: ReturnType<typeof getCurrentAttribution> | null = null;
    await runWithRequestContext({ agentIdentity: identity }, async () => {
      await runWithExternalActor(actor, () => {
        attribution = getCurrentAttribution();
      });
    });

    expect(attribution!.agent_thumbprint).toBe("outer-thumb");
    expect(attribution!.external_actor).toEqual(actor);
  });

  it("does not leak external actor outside its scope", async () => {
    await runWithExternalActor(actor, () => {});
    const current = getCurrentExternalActor();
    expect(current).toBeNull();
  });
});
