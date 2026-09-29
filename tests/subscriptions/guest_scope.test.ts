import { describe, expect, it } from "vitest";

import { subscriptionWithinGuestScope } from "../../src/services/subscriptions/guest_scope.js";

describe("subscriptionWithinGuestScope", () => {
  it("requires every watched entity to be contained in the guest token grant", () => {
    expect(subscriptionWithinGuestScope(["ent_allowed"], ["ent_allowed", "ent_private"])).toBe(
      false
    );
  });

  it("accepts a fully contained subscription and preserves authenticated-owner access", () => {
    expect(subscriptionWithinGuestScope(["ent_a", "ent_b"], ["ent_b", "ent_a"])).toBe(true);
    expect(subscriptionWithinGuestScope(null, undefined)).toBe(true);
  });

  it("fails closed for an unscoped subscription", () => {
    expect(subscriptionWithinGuestScope(["ent_allowed"], undefined)).toBe(false);
    expect(subscriptionWithinGuestScope(["ent_allowed"], [])).toBe(false);
  });
});
