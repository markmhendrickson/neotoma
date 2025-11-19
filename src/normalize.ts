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
  const values = Object.values(row).map(v => String(v).toLowerCase());
  
  // Finance types
  if (keys.some(k => k.includes('transaction') || k.includes('merchant') || (k.includes('amount') && keys.some(k2 => k2.includes('date'))))) {
    return 'transaction';
  }
  if (keys.some(k => k.includes('invoice') || k.includes('bill') || (k.includes('amount') && k.includes('due')))) {
    return 'invoice';
  }
  if (keys.some(k => k.includes('receipt') || (k.includes('merchant') && keys.some(k2 => k2.includes('total'))))) {
    return 'receipt';
  }
  if (keys.some(k => k.includes('statement') || (k.includes('balance') && keys.some(k2 => k2.includes('period'))))) {
    return 'statement';
  }
  if (keys.some(k => k.includes('account') && (k.includes('balance') || k.includes('institution')))) {
    return 'account';
  }
  if (keys.some(k => k.includes('subscription') || k.includes('recurring') || (k.includes('renewal') && k.includes('date')))) {
    return 'subscription';
  }
  if (keys.some(k => k.includes('budget') || (k.includes('spending') && k.includes('plan')))) {
    return 'budget';
  }
  
  // Health types
  if (keys.some(k => k.includes('exercise') || k.includes('workout') || k.includes('repetitions') || k.includes('reps') || k.includes('sets') || k.includes('rpe'))) {
    return 'exercise';
  }
  if (keys.some(k => k.includes('meal') || k.includes('food') || k.includes('calories') || k.includes('nutrition'))) {
    return 'meal';
  }
  if (keys.some(k => k.includes('sleep') || (k.includes('bedtime') && k.includes('wake')))) {
    return 'sleep_session';
  }
  if (keys.some(k => k.includes('measurement') || k.includes('biometric') || (k.includes('weight') && k.includes('height')))) {
    return 'measurement';
  }
  
  // Productivity types
  if (keys.some(k => k.includes('task') || k.includes('todo') || (k.includes('status') && keys.some(k2 => k2.includes('due'))))) {
    return 'task';
  }
  if (keys.some(k => k.includes('project') || k.includes('initiative') || (k.includes('owner') && keys.some(k2 => k2.includes('start'))))) {
    return 'project';
  }
  if (keys.some(k => k.includes('goal') || k.includes('objective') || k.includes('okr'))) {
    return 'goal';
  }
  if (keys.some(k => k.includes('event') || k.includes('meeting') || k.includes('appointment') || (k.includes('start') && k.includes('time') && keys.some(k2 => k2.includes('location'))))) {
    return 'event';
  }
  if (keys.some(k => k.includes('note') || k.includes('memo') || k.includes('journal') || (k.includes('content') && keys.some(k2 => k2.includes('title'))))) {
    return 'note';
  }
  
  // Knowledge types
  if (keys.some(k => k.includes('contact') || k.includes('person') || (k.includes('email') && keys.some(k2 => k2.includes('phone'))))) {
    return 'contact';
  }
  if (keys.some(k => k.includes('message') || k.includes('email') || k.includes('dm') || (k.includes('sender') && keys.some(k2 => k2.includes('recipient'))))) {
    return 'message';
  }
  if (keys.some(k => k.includes('document') || k.includes('pdf') || (k.includes('title') && keys.some(k2 => k2.includes('link'))))) {
    return 'document';
  }
  
  // Fallback: check for common patterns in values
  if (values.some(v => v.includes('exercise') || v.includes('workout'))) return 'exercise';
  if (values.some(v => v.includes('transaction') || v.includes('purchase'))) return 'transaction';
  if (values.some(v => v.includes('task') || v.includes('todo'))) return 'task';
  if (values.some(v => v.includes('note') || v.includes('memo'))) return 'note';
  
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

