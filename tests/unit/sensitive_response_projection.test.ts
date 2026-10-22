import { describe, expect, it } from "vitest";

import { projectSensitiveResponse } from "../../src/services/sensitive_response_projection.js";

const PLANTED_GUEST_TOKEN = "planted-red-guest-token-value";
const PLANTED_ACCESS_TOKEN = "planted-red-access-token-value";

describe("sensitive response projection", () => {
  it("removes credential values from a direct entity snapshot while preserving metadata", () => {
    const projected = projectSensitiveResponse({
      entity_id: "ent_direct",
      entity_type: "issue",
      snapshot: {
        title: "Safe title",
        guest_access_token: PLANTED_GUEST_TOKEN,
      },
    });

    expect(JSON.stringify(projected)).not.toContain(PLANTED_GUEST_TOKEN);
    expect(projected).toEqual({
      entity_id: "ent_direct",
      entity_type: "issue",
      snapshot: { title: "Safe title" },
    });
  });

  it("removes credentials from relationship-hydrated and store response shapes at any depth", () => {
    const projected = projectSensitiveResponse({
      entities: [
        {
          entity_id: "ent_store",
          snapshot: { access_token: PLANTED_ACCESS_TOKEN, status: "created" },
        },
      ],
      related_entities: {
        ent_related: {
          entity_id: "ent_related",
          snapshot: {
            guestAccessToken: PLANTED_GUEST_TOKEN,
            title: "Related title",
          },
        },
      },
    });

    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain(PLANTED_GUEST_TOKEN);
    expect(serialized).not.toContain(PLANTED_ACCESS_TOKEN);
    expect(projected).toEqual({
      entities: [
        {
          entity_id: "ent_store",
          snapshot: { status: "created" },
        },
      ],
      related_entities: {
        ent_related: {
          entity_id: "ent_related",
          snapshot: { title: "Related title" },
        },
      },
    });
  });

  it("allows only an explicitly issued top-level credential field", () => {
    const projected = projectSensitiveResponse(
      {
        entity_id: "ent_submission",
        guest_access_token: PLANTED_GUEST_TOKEN,
        snapshot: { guest_access_token: "stored-copy-must-not-escape" },
      },
      { allowTopLevelFields: ["guest_access_token"] }
    );

    expect(projected).toEqual({
      entity_id: "ent_submission",
      guest_access_token: PLANTED_GUEST_TOKEN,
      snapshot: {},
    });
  });
});
