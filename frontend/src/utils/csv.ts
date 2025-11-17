import Papa from 'papaparse';

const DEFAULT_MAX_ROWS = 2000;

export interface ParsedCsvRowsResult {
  rows: Record<string, string>[];
  truncated: boolean;
  headers: string[];
}

export function isCsvLike(fileName?: string, mimeType?: string | null): boolean {
  const lowerName = (fileName || '').toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();
  return lowerMime.includes('csv') || lowerName.endsWith('.csv');
}

export function parseCsvRows(text: string, maxRows: number = DEFAULT_MAX_ROWS): ParsedCsvRowsResult {
  if (!text || !text.trim()) {
    return { rows: [], truncated: false, headers: [] };
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
    delimiter: '', // auto-detect
    transformHeader(header) {
      return (header ?? '').toString().trim();
    },
  });

  const cleanedRows = (parsed.data || []).filter((row) => {
    return Object.values(row || {}).some((value) => value !== undefined && value !== null && String(value).trim() !== '');
  });

  const limitedRows = cleanedRows.slice(0, maxRows);

  return {
    rows: limitedRows,
    truncated: cleanedRows.length > maxRows,
    headers: parsed.meta?.fields?.map((field) => (field ?? '').toString()) ?? [],
  };
}


