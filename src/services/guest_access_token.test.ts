import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  generateGuestAccessToken,
  hashGuestAccessToken,
  validateGuestAccessToken,
  tokenGrantsAccessTo,
} from "../services/guest_access_token.js";

const mockDbState = vi.hoisted(() => ({
  entities: [] as Array<Record<string, unknown>>,
  observations: [] as Array<Record<string, unknown>>,
  insertErrors: new Map<string, { message: string }>(),
}));

vi.mock("../db.js", () => {
  function rowsForTable(table: string): Array<Record<string, unknown>> {
    return table === "entities" ? mockDbState.entities : mockDbState.observations;
  }

  return {
    db: {
      from: (table: string) => ({
        insert: async (row: Record<string, unknown>) => {
          const error = mockDbState.insertErrors.get(table);
          if (error) return { error };
          rowsForTable(table).push(row);
          return { error: null };
        },
        select: (_cols: string) => ({
          order: (_col: string, _opts: unknown) => {
            return Promise.resolve({
              data: rowsForTable(table).filter((o) => o.entity_type === "guest_access_token"),
              error: null,
            });
          },
          eq: (_col: string, _val: unknown) => ({
            order: (_col2: string, _opts: unknown) => {
              return Promise.resolve({
                data: rowsForTable(table).filter(
                  (o) => o.entity_type === "guest_access_token" && o[_col] === _val
                ),
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
  beforeEach(() => {
    mockDbState.entities.length = 0;
    mockDbState.observations.length = 0;
    mockDbState.insertErrors.clear();
    delete process.env.NEOTOMA_GUEST_TOKEN_TTL_SECONDS;
    vi.useRealTimers();
  });

  afterEach(() => {
    delete process.env.NEOTOMA_GUEST_TOKEN_TTL_SECONDS;
    vi.useRealTimers();
  });

  describe("generateGuestAccessToken", () => {
    it("returns a UUID-format token", async () => {
      const token = await generateGuestAccessToken({
        entityIds: ["entity-1", "entity-2"],
        userId: "user-1",
        thumbprint: "thumb-1",
      });
      expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(mockDbState.observations[0]?.fields).toMatchObject({
        ttl_seconds: 30 * 24 * 60 * 60,
        revoked_at: null,
      });
    });

    it("throws instead of returning an unbacked token when entity persistence fails", async () => {
      mockDbState.insertErrors.set("entities", { message: "entity insert failed" });

      await expect(
        generateGuestAccessToken({
          entityIds: ["entity-1"],
          userId: "user-1",
        })
      ).rejects.toThrow(/Failed to persist guest access token entity/);
      expect(mockDbState.observations).toHaveLength(0);
    });

    it("throws instead of returning an unbacked token when observation persistence fails", async () => {
      mockDbState.insertErrors.set("observations", { message: "observation insert failed" });

      await expect(
        generateGuestAccessToken({
          entityIds: ["entity-1"],
          userId: "user-1",
        })
      ).rejects.toThrow(/Failed to persist guest access token observation/);
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
      expect(result!.ttl_seconds).toBe(30 * 24 * 60 * 60);
    });

    it("returns null for an invalid token", async () => {
      const result = await validateGuestAccessToken("nonexistent-token");
      expect(result).toBeNull();
    });

    it("queries by deterministic token entity id instead of scanning all observations", async () => {
      const token = await generateGuestAccessToken({
        entityIds: ["ent-a"],
        userId: "user-1",
      });
      const tokenHash = hashGuestAccessToken(token);
      mockDbState.observations.push({
        entity_id: "guest_token_unrelated",
        entity_type: "guest_access_token",
        fields: {
          token_hash: tokenHash,
          entity_ids: ["ent-should-not-match"],
          created_at: new Date().toISOString(),
          ttl_seconds: 30 * 24 * 60 * 60,
          revoked_at: null,
        },
      });

      const result = await validateGuestAccessToken(token);

      expect(result?.entity_ids).toEqual(["ent-a"]);
    });

    it("returns null for an expired token", async () => {
      process.env.NEOTOMA_GUEST_TOKEN_TTL_SECONDS = "10";
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));
      const token = await generateGuestAccessToken({
        entityIds: ["ent-a"],
        userId: "user-1",
      });

      vi.setSystemTime(new Date("2026-05-01T00:00:11.000Z"));

      await expect(validateGuestAccessToken(token)).resolves.toBeNull();
    });

    it("returns null for a revoked token", async () => {
      const token = await generateGuestAccessToken({
        entityIds: ["ent-a"],
        userId: "user-1",
      });
      const fields = mockDbState.observations[0]?.fields as Record<string, unknown>;
      fields.revoked_at = "2026-05-01T00:00:00.000Z";

      await expect(validateGuestAccessToken(token)).resolves.toBeNull();
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
