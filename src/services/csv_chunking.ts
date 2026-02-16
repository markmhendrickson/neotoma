/**
 * CSV Chunking Service
 *
 * Handles chunking of large CSV files to avoid token limits during LLM extraction.
 * Chunks are processed in parallel and observations are merged into the same entity.
 */

export interface CSVChunkMetadata {
  chunkIndex: number;
  totalChunks: number;
  rowsInChunk: number;
  startRow: number;
  endRow: number;
}

export interface CSVChunk {
  content: string;
  metadata: CSVChunkMetadata;
}

/**
 * Estimate token count for text (rough approximation: 4 chars = 1 token)
 */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check if CSV file is too large and needs chunking
 * @param csvContent Full CSV content
 * @param maxTokens Maximum tokens per chunk (default: 20000 = ~80KB)
 * @returns true if chunking is needed
 */
export function needsChunking(
  csvContent: string,
  maxTokens: number = 20000
): boolean {
  const estimatedTokens = estimateTokenCount(csvContent);
  return estimatedTokens > maxTokens;
}

/**
 * Chunk large CSV into smaller pieces with header duplication
 *
 * @param csvContent Full CSV content
 * @param rowsPerChunk Number of rows per chunk (default: 100 rows = ~2000 tokens)
 * @returns Array of CSV chunks with metadata
 */
export function chunkCSV(
  csvContent: string,
  rowsPerChunk: number = 100
): CSVChunk[] {
  const lines = csvContent.split("\n").filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    throw new Error("CSV content is empty");
  }

  const header = lines[0];
  const dataRows = lines.slice(1);

  if (dataRows.length === 0) {
    // Only header, return single chunk
    return [
      {
        content: csvContent,
        metadata: {
          chunkIndex: 0,
          totalChunks: 1,
          rowsInChunk: 0,
          startRow: 0,
          endRow: 0,
        },
      },
    ];
  }

  const chunks: CSVChunk[] = [];
  const totalChunks = Math.ceil(dataRows.length / rowsPerChunk);

  for (let i = 0; i < dataRows.length; i += rowsPerChunk) {
    const chunkRows = dataRows.slice(i, Math.min(i + rowsPerChunk, dataRows.length));
    const chunkContent = [header, ...chunkRows].join("\n");

    chunks.push({
      content: chunkContent,
      metadata: {
        chunkIndex: Math.floor(i / rowsPerChunk),
        totalChunks,
        rowsInChunk: chunkRows.length,
        startRow: i + 1, // +1 because header is row 0
        endRow: i + chunkRows.length,
      },
    });
  }

  return chunks;
}

/**
 * Get recommended chunk size based on file size
 * @param fileSize File size in bytes
 * @returns Recommended rows per chunk
 */
export function getRecommendedChunkSize(fileSize: number): number {
  // CRITICAL: Chunk size must account for BOTH input AND output token limits
  // - Input limit: 20K tokens (~80KB of text)
  // - Output limit: 8192 tokens (~32KB of JSON)
  // For large CSVs, LLM extracts verbose JSON (multiple fields per row)
  // which can exceed output limit even with small input chunks

  // For very large files (>200KB), use minimal chunks (2 rows)
  // Even 5 rows can exceed OUTPUT token limit if rows have many columns or long values
  // 2 rows = ~8KB CSV → ~16KB JSON extraction (well under 32KB limit)
  if (fileSize > 200 * 1024) {
    return 2;
  }
  // For large files (100-200KB), use tiny chunks (5 rows)
  if (fileSize > 100 * 1024) {
    return 5;
  }
  // For moderate files (50-100KB), use small chunks (20 rows)
  if (fileSize > 50 * 1024) {
    return 20;
  }
  // For smaller files, use standard chunks
  return 50;
}
