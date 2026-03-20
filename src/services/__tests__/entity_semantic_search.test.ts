// Unit tests for entity semantic search (local and remote paths)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { semanticSearchEntities } from "../entity_semantic_search.js";

vi.mock("../../embeddings.js", () => ({
  generateEmbedding: vi.fn(),
}));
vi.mock("../local_entity_embedding.js", () => ({
  searchLocalEntityEmbeddings: vi.fn(),
}));

const { generateEmbedding } = await import("../../embeddings.js");
const { searchLocalEntityEmbeddings } = await import("../local_entity_embedding.js");

describe("entity_semantic_search", () => {
  beforeEach(() => {
    vi.mocked(generateEmbedding).mockReset();
    vi.mocked(searchLocalEntityEmbeddings).mockReset();
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
      vi.mocked(searchLocalEntityEmbeddings).mockReturnValue({ entityIds: [], total: 0 });

      const result = await semanticSearchEntities({
        searchText: "test",
        userId: "user_test",
        limit: 10,
        offset: 0,
      });

      expect(result).toEqual({ entityIds: [], total: 0 });
    });

    it("returns total from local semantic backend (not page length)", async () => {
      vi.mocked(generateEmbedding).mockResolvedValue(new Array(1536).fill(0));
      vi.mocked(searchLocalEntityEmbeddings).mockReturnValue({
        entityIds: ["ent_1", "ent_2"],
        total: 42,
      });

      const result = await semanticSearchEntities({
        searchText: "semantic total test",
        userId: "user_test",
        limit: 2,
        offset: 0,
      });

      expect(result).toEqual({ entityIds: ["ent_1", "ent_2"], total: 42 });
    });
  });
});
