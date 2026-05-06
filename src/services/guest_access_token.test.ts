import { describe, it, expect, vi } from "vitest";
import { generateGuestAccessToken, validateGuestAccessToken, tokenGrantsAccessTo } from "../services/guest_access_token.js";

vi.mock("../db.js", () => {
  const observations: Array<Record<string, unknown>> = [];
  return {
    db: {
      from: (_table: string) => ({
        insert: async (row: Record<string, unknown>) => {
          observations.push(row);
          return { error: null };
        },
        select: (_cols: string) => ({
          eq: (_col: string, _val: unknown) => ({
            order: (_col2: string, _opts: unknown) => {
              return Promise.resolve({
                data: observations.filter((o) => o.entity_type === "guest_access_token"),
                error: null,
              });
            },
          }),
        }),
      }),
    },
  };
});

vi.mock("../utils/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Guest Access Token Service", () => {
  describe("generateGuestAccessToken", () => {
    it("returns a UUID-format token", async () => {
      const token = await generateGuestAccessToken({
        entityIds: ["entity-1", "entity-2"],
        userId: "user-1",
        thumbprint: "thumb-1",
      });
      expect(token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe("validateGuestAccessToken", () => {
    it("returns entity_ids for a valid token", async () => {
      const token = await generateGuestAccessToken({
        entityIds: ["ent-a", "ent-b"],
        userId: "user-1",
        thumbprint: "thumb-1",
      });

      const result = await validateGuestAccessToken(token);
      expect(result).not.toBeNull();
      expect(result!.entity_ids).toEqual(["ent-a", "ent-b"]);
      expect(result!.thumbprint).toBe("thumb-1");
    });

    it("returns null for an invalid token", async () => {
      const result = await validateGuestAccessToken("nonexistent-token");
      expect(result).toBeNull();
    });
  });

  describe("tokenGrantsAccessTo", () => {
    it("returns true for an entity covered by the token", async () => {
      const token = await generateGuestAccessToken({
        entityIds: ["target-entity"],
        userId: "user-1",
      });

      const granted = await tokenGrantsAccessTo(token, "target-entity");
      expect(granted).toBe(true);
    });

    it("returns false for an entity not covered by the token", async () => {
      const token = await generateGuestAccessToken({
        entityIds: ["other-entity"],
        userId: "user-1",
      });

      const granted = await tokenGrantsAccessTo(token, "different-entity");
      expect(granted).toBe(false);
    });
  });
});
