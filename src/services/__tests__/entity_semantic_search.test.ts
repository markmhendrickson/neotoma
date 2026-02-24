// Unit tests for entity semantic search (local and remote paths)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { semanticSearchEntities } from "../entity_semantic_search.js";

vi.mock("../../embeddings.js", () => ({
  generateEmbedding: vi.fn(),
}));

const { generateEmbedding } = await import("../../embeddings.js");

describe("entity_semantic_search", () => {
  beforeEach(() => {
    vi.mocked(generateEmbedding).mockReset();
  });

  describe("semanticSearchEntities", () => {
    it("returns empty when generateEmbedding returns null", async () => {
      vi.mocked(generateEmbedding).mockResolvedValue(null);

      const result = await semanticSearchEntities({
        searchText: "test query",
        userId: "user_test",
        limit: 10,
        offset: 0,
      });

      expect(result).toEqual({ entityIds: [], total: 0 });
      expect(generateEmbedding).toHaveBeenCalledWith("test query");
    });

    it("returns empty when generateEmbedding returns empty array", async () => {
      vi.mocked(generateEmbedding).mockResolvedValue([]);

      const result = await semanticSearchEntities({
        searchText: "test",
        userId: "user_test",
        limit: 10,
        offset: 0,
      });

      expect(result).toEqual({ entityIds: [], total: 0 });
    });
  });
});
