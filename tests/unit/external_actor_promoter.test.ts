import { describe, it, expect } from "vitest";
import { promoteExternalActorViaGrant } from "../../src/services/external_actor_promoter.js";
import type { ExternalActor } from "../../src/crypto/agent_identity.js";

describe("promoteExternalActorViaGrant", () => {
  const baseActor: ExternalActor = {
    provider: "github",
    login: "alice",
    id: 42,
    type: "User",
    verified_via: "claim",
  };

  it("promotes to oauth_link when grant's github id matches", () => {
    const grant = {
      linked_github_user_id: 42,
      linked_github_login: "alice",
      user_id: "user-123",
    };
    const result = promoteExternalActorViaGrant(baseActor, grant);
    expect(result.verified_via).toBe("oauth_link");
    expect(result.linked_neotoma_user_id).toBe("user-123");
  });

  it("sets provenance_warning on mismatch", () => {
    const grant = {
      linked_github_user_id: 999,
      linked_github_login: "bob",
      user_id: "user-456",
    };
    const result = promoteExternalActorViaGrant(baseActor, grant);
    expect(result.verified_via).toBe("claim");
    expect(result.provenance_warning).toBe("github_actor_grant_mismatch");
  });

  it("does not downgrade webhook_signature actors", () => {
    const webhookActor: ExternalActor = {
      ...baseActor,
      verified_via: "webhook_signature",
    };
    const grant = {
      linked_github_user_id: 42,
      linked_github_login: "alice",
      user_id: "user-123",
    };
    const result = promoteExternalActorViaGrant(webhookActor, grant);
    expect(result.verified_via).toBe("webhook_signature");
  });

  it("returns actor unchanged when grant is null", () => {
    const result = promoteExternalActorViaGrant(baseActor, null);
    expect(result).toEqual(baseActor);
  });

  it("returns actor unchanged when grant has no linked github", () => {
    const grant = {
      linked_github_user_id: null as number | null,
      linked_github_login: null as string | null,
      user_id: "user-789",
    };
    const result = promoteExternalActorViaGrant(baseActor, grant);
    expect(result).toEqual(baseActor);
  });
});
