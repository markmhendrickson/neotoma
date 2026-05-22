import { describe, it, expect } from "vitest";
import { extractExternalActor } from "../../inspector/src/components/shared/external_actor_badge.js";

describe("extractExternalActor", () => {
  it("extracts external_actor from provenance object", () => {
    const provenance = {
      attribution_tier: "software",
      external_actor: {
        provider: "github",
        login: "octocat",
        id: 1,
        type: "User",
        verified_via: "webhook_signature",
        delivery_id: "del-1",
      },
    };
    const result = extractExternalActor(provenance);
    expect(result).not.toBeNull();
    expect(result!.login).toBe("octocat");
    expect(result!.verified_via).toBe("webhook_signature");
  });

  it("extracts from JSON string provenance", () => {
    const provenance = JSON.stringify({
      external_actor: {
        provider: "github",
        login: "alice",
        id: 42,
        type: "User",
        verified_via: "claim",
      },
    });
    const result = extractExternalActor(provenance);
    expect(result!.login).toBe("alice");
  });

  it("returns null when provenance is null", () => {
    expect(extractExternalActor(null)).toBeNull();
  });

  it("returns null when external_actor is absent", () => {
    expect(extractExternalActor({ attribution_tier: "software" })).toBeNull();
  });

  it("returns null for invalid external_actor shape", () => {
    expect(extractExternalActor({ external_actor: "not an object" })).toBeNull();
    expect(extractExternalActor({ external_actor: { login: 123 } })).toBeNull();
  });
});
