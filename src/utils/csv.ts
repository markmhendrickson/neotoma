import { parse } from "csv-parse/sync";

const DEFAULT_MAX_ROWS = 2000;
const COMMON_DELIMITERS = [",", ";", "\t", "|"];

export interface ParsedCsvRowsResult {
  rows: Record<string, unknown>[];
  truncated: boolean;
}

export function isCsvLike(fileName?: string | null, mimeType?: string | null): boolean {
  const lowerName = (fileName || "").toLowerCase();
  const lowerMime = (mimeType || "").toLowerCase();
  return lowerMime.includes("csv") || lowerName.endsWith(".csv");
}

function detectDelimiter(text: string): string | undefined {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 5);

  let bestDelimiter: string | undefined;
  let bestScore = 0;

  for (const delimiter of COMMON_DELIMITERS) {
    let score = 0;
    for (const line of lines) {
      const occurrences = line.split(delimiter).length - 1;
      if (occurrences > 0) {
        score += occurrences;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  }

  return bestScore > 0 ? bestDelimiter : undefined;
}

export function parseCsvRows(
  buffer: Buffer,
  maxRows: number = DEFAULT_MAX_ROWS
): ParsedCsvRowsResult {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { rows: [], truncated: false };
  }

  const safeMax = Number.isFinite(maxRows) && maxRows > 0 ? Math.floor(maxRows) : DEFAULT_MAX_ROWS;
  const text = buffer.toString("utf8");
  if (!text.trim()) {
    return { rows: [], truncated: false };
  }

  const delimiter = detectDelimiter(text);

  const parsed = parse(text, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter,
  }) as Record<string, unknown>[];

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { rows: [], truncated: false };
  }

  const limited = parsed.slice(0, safeMax);
  return {
    rows: limited,
    truncated: parsed.length > safeMax,
  };
}
