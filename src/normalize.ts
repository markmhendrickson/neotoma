import { normalizeRecordType } from './config/record_types.js';

export function levenshtein(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  const m = s.length;
  const n = t.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return d[m][n];
}

export function detectDateFields(row: Record<string, unknown>): string[] {
  const fields: string[] = [];
  const keyRegex = /(date|time|created|updated|timestamp)/i;
  for (const [k, v] of Object.entries(row)) {
    if (!keyRegex.test(k)) continue;
    if (typeof v === 'string' || typeof v === 'number') {
      const d = new Date(v as any);
      if (!isNaN(d.getTime())) fields.push(k);
    }
  }
  return fields;
}

export function normalizeRow(
  raw: Record<string, unknown>,
  existingTypes: string[],
  explicitType?: string
): { type: string; properties: Record<string, unknown>; file_urls: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const props: Record<string, unknown> = { ...raw };

  // Extract type from explicit or common columns
  let type = (explicitType || (props.type as string) || (props.category as string) || '').toString().trim();
  delete props.type;
  delete props.category;

  if (!type) type = inferTypeFromHeaders(raw) || 'unknown';
  type = standardizeType(type, existingTypes);

  // Normalize datetime-like fields
  const dateFields = detectDateFields(raw);
  for (const key of dateFields) {
    const v = raw[key];
    if (v !== undefined && v !== null && (typeof v === 'string' || typeof v === 'number')) {
      const d = new Date(v as any);
      if (!isNaN(d.getTime())) {
        props[key] = d.toISOString();
      } else {
        warnings.push(`Unparseable date for ${key}`);
      }
    }
  }

  return { type, properties: props, file_urls: Array.isArray(raw.file_urls) ? (raw.file_urls as string[]) : [], warnings };
}

export function inferTypeFromHeaders(row: Record<string, unknown>): string | undefined {
  const keys = Object.keys(row).map(k => k.toLowerCase());
  if (keys.some(k => k.includes('exercise'))) return 'exercise';
  if (keys.some(k => k.includes('note'))) return 'note';
  if (keys.some(k => k.includes('transaction'))) return 'transaction';
  return undefined;
}

export function standardizeType(input: string, existingTypes: string[]): string {
  const resolution = normalizeRecordType(input);
  if (resolution.match === 'canonical' || resolution.match === 'alias') {
    return resolution.type;
  }

  const candidate = resolution.type || 'unknown';

  const exact = existingTypes.find(t => t.toLowerCase() === candidate.toLowerCase());
  if (exact) return exact;

  let best = candidate;
  let bestDist = Infinity;
  for (const t of existingTypes) {
    const d = levenshtein(candidate, t.toLowerCase());
    if (d < bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return bestDist <= 2 ? best : candidate;
}

