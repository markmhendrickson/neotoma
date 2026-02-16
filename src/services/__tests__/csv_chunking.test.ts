import { describe, it, expect } from "vitest";
import { chunkCSV, needsChunking, getRecommendedChunkSize } from "../csv_chunking.js";

describe("CSV Chunking Service", () => {
  describe("needsChunking", () => {
    it("should return false for small CSV files", () => {
      const smallCSV = "header1,header2\nvalue1,value2\n";
      expect(needsChunking(smallCSV)).toBe(false);
    });

    it("should return true for large CSV files", () => {
      // Create CSV that exceeds 20000 tokens (default)
      // Each row is ~14 chars, so need ~20000 * 4 / 14 = ~5700 rows
      const largeCSV = "header1,header2\n" + "value1,value2\n".repeat(6000);
      expect(needsChunking(largeCSV)).toBe(true);
    });

    it("should respect custom max tokens", () => {
      const csv = "header1,header2\n" + "value1,value2\n".repeat(100);
      expect(needsChunking(csv, 100)).toBe(true);
      expect(needsChunking(csv, 50000)).toBe(false);
    });
  });

  describe("chunkCSV", () => {
    it("should chunk CSV with 100 rows per chunk by default", () => {
      const header = "col1,col2,col3";
      const rows = Array.from({ length: 250 }, (_, i) => `val${i}_1,val${i}_2,val${i}_3`);
      const csvContent = [header, ...rows].join("\n");

      const chunks = chunkCSV(csvContent);

      expect(chunks).toHaveLength(3);

      // First chunk
      expect(chunks[0].metadata.chunkIndex).toBe(0);
      expect(chunks[0].metadata.totalChunks).toBe(3);
      expect(chunks[0].metadata.rowsInChunk).toBe(100);
      expect(chunks[0].metadata.startRow).toBe(1);
      expect(chunks[0].metadata.endRow).toBe(100);
      expect(chunks[0].content.split("\n")).toHaveLength(101); // header + 100 rows

      // Second chunk
      expect(chunks[1].metadata.chunkIndex).toBe(1);
      expect(chunks[1].metadata.rowsInChunk).toBe(100);
      expect(chunks[1].metadata.startRow).toBe(101);
      expect(chunks[1].metadata.endRow).toBe(200);

      // Third chunk
      expect(chunks[2].metadata.chunkIndex).toBe(2);
      expect(chunks[2].metadata.rowsInChunk).toBe(50);
      expect(chunks[2].metadata.startRow).toBe(201);
      expect(chunks[2].metadata.endRow).toBe(250);
    });

    it("should include header in every chunk", () => {
      const header = "col1,col2,col3";
      const rows = Array.from({ length: 150 }, (_, i) => `val${i}_1,val${i}_2,val${i}_3`);
      const csvContent = [header, ...rows].join("\n");

      const chunks = chunkCSV(csvContent);

      chunks.forEach((chunk) => {
        const lines = chunk.content.split("\n").filter((line) => line.trim() !== "");
        expect(lines[0]).toBe(header);
      });
    });

    it("should handle small CSV without chunking", () => {
      const csvContent = "col1,col2\nval1,val2\nval3,val4";

      const chunks = chunkCSV(csvContent);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].metadata.chunkIndex).toBe(0);
      expect(chunks[0].metadata.totalChunks).toBe(1);
      expect(chunks[0].metadata.rowsInChunk).toBe(2);
    });

    it("should handle CSV with only header", () => {
      const csvContent = "col1,col2,col3";

      const chunks = chunkCSV(csvContent);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].metadata.rowsInChunk).toBe(0);
      expect(chunks[0].content).toBe(csvContent);
    });

    it("should handle custom chunk size", () => {
      const header = "col1,col2";
      const rows = Array.from({ length: 75 }, (_, i) => `val${i}_1,val${i}_2`);
      const csvContent = [header, ...rows].join("\n");

      const chunks = chunkCSV(csvContent, 50);

      expect(chunks).toHaveLength(2);
      expect(chunks[0].metadata.rowsInChunk).toBe(50);
      expect(chunks[1].metadata.rowsInChunk).toBe(25);
    });

    it("should throw error for empty CSV", () => {
      expect(() => chunkCSV("")).toThrow("CSV content is empty");
      expect(() => chunkCSV("\n\n")).toThrow("CSV content is empty");
    });
  });

  describe("getRecommendedChunkSize", () => {
    it("should return 20 for moderate files (50-100KB)", () => {
      expect(getRecommendedChunkSize(51 * 1024)).toBe(20);
      expect(getRecommendedChunkSize(75 * 1024)).toBe(20);
      expect(getRecommendedChunkSize(99 * 1024)).toBe(20);
    });

    it("should return 5 for large files (100-200KB)", () => {
      expect(getRecommendedChunkSize(150 * 1024)).toBe(5);
      expect(getRecommendedChunkSize(175 * 1024)).toBe(5);
    });

    it("should return 2 for very large files (>200KB)", () => {
      expect(getRecommendedChunkSize(250 * 1024)).toBe(2);
      expect(getRecommendedChunkSize(500 * 1024)).toBe(2);
    });
  });
});
