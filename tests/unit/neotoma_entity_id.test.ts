import { describe, expect, it } from "vitest";

import { isNeotomaEntityId, NEOTOMA_ENTITY_ID_REGEX } from "../../src/shared/neotoma_entity_id.js";

describe("isNeotomaEntityId", () => {
  it("accepts ids matching generateEntityId shape", () => {
    expect(isNeotomaEntityId("ent_a1898c06c308a47bb0d454e9")).toBe(true);
    expect(isNeotomaEntityId("ent_0123456789abcdef01234567")).toBe(true);
  });

  it("rejects placeholders and malformed strings", () => {
    expect(isNeotomaEntityId("PLACEHOLDER")).toBe(false);
    expect(isNeotomaEntityId("ent_source")).toBe(false);
    expect(isNeotomaEntityId("ent_123")).toBe(false);
    expect(isNeotomaEntityId("")).toBe(false);
    expect(isNeotomaEntityId("uuid-here-not-ent-prefix")).toBe(false);
  });

  it("trims whitespace before checking", () => {
    expect(isNeotomaEntityId("  ent_a1898c06c308a47bb0d454e9  ")).toBe(true);
  });

  it("documents regex for schema alignment", () => {
    expect(NEOTOMA_ENTITY_ID_REGEX.test("ent_" + "a".repeat(24))).toBe(true);
  });
});
