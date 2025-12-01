import type { LocalRecord } from '@/store/types';
import {
  generateRecordComparison,
  type RecordComparisonRecordPayload,
} from '@/lib/api';

const AMOUNT_KEYS = [
  'amount',
  'amount_total',
  'amount_due',
  'balance',
  'total',
  'value',
  'price',
  'credit',
  'debit',
];

const CURRENCY_KEYS = ['currency', 'iso_currency_code', 'currency_code'];
const REP_KEYS = ['reps', 'repetitions', 'count'];
const LOAD_KEYS = ['load', 'weight', 'mass'];
const DURATION_KEYS = ['duration', 'duration_minutes', 'time_minutes', 'time'];
const RECIPIENT_KEYS = ['recipient', 'merchant_name', 'payee', 'counterparty', 'vendor'];
const CATEGORY_KEYS = ['category', 'categories', 'label', 'movement', 'exercise'];
const LOCATION_KEYS = ['location', 'city', 'venue', 'gym'];
const LABEL_KEYS = ['name', 'title', 'description', 'note', 'memo'];

const PROPERTY_PRIORITY = [
  ...AMOUNT_KEYS,
  ...CURRENCY_KEYS,
  'date',
  ...RECIPIENT_KEYS,
  'account_id',
  'account',
  ...CATEGORY_KEYS,
  ...LOCATION_KEYS,
  'sets',
  ...REP_KEYS,
  ...LOAD_KEYS,
];

const MAX_PROPERTY_HIGHLIGHTS = 8;

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/[^-0-9.]/g, '');
    if (!normalized) {
      return undefined;
    }
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function coerceString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return undefined;
}

function pickFirstNumber(keys: string[], source: Record<string, unknown>): number | undefined {
  for (const key of keys) {
    const candidate = coerceNumber(source[key]);
    if (typeof candidate === 'number') {
      return candidate;
    }
  }
  return undefined;
}

function pickFirstString(keys: string[], source: Record<string, unknown>): string | undefined {
  for (const key of keys) {
    const candidate = coerceString(source[key]);
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

function buildPropertyHighlights(properties: Record<string, unknown> | undefined) {
  if (!properties) {
    return undefined;
  }

  const highlights: Record<string, unknown> = {};
  const addValue = (key: string) => {
    if (Object.keys(highlights).length >= MAX_PROPERTY_HIGHLIGHTS) {
      return;
    }
    if (!(key in properties)) {
      return;
    }
    const value = properties[key];
    if (
      value === null ||
      value === undefined ||
      typeof value === 'object' ||
      typeof value === 'function'
    ) {
      return;
    }
    highlights[key] = value;
  };

  PROPERTY_PRIORITY.forEach(addValue);

  if (Object.keys(highlights).length < MAX_PROPERTY_HIGHLIGHTS) {
    for (const [key, value] of Object.entries(properties)) {
      if (Object.keys(highlights).length >= MAX_PROPERTY_HIGHLIGHTS) {
        break;
      }
      if (key in highlights) {
        continue;
      }
      if (
        value === null ||
        value === undefined ||
        typeof value === 'object' ||
        typeof value === 'function'
      ) {
        continue;
      }
      highlights[key] = value;
    }
  }

  return Object.keys(highlights).length > 0 ? highlights : undefined;
}

export function buildMetrics(record: LocalRecord) {
  const properties = record.properties || {};
  const metrics: Record<string, unknown> = {};

  const amount = pickFirstNumber(AMOUNT_KEYS, properties);
  if (typeof amount === 'number') {
    metrics.amount = Number(amount.toFixed(2));
  }

  const currency = pickFirstString(CURRENCY_KEYS, properties);
  if (currency) {
    metrics.currency = currency;
  }

  const reps = pickFirstNumber(REP_KEYS, properties);
  if (typeof reps === 'number') {
    metrics.repetitions = Math.round(reps);
  }

  const load = pickFirstNumber(LOAD_KEYS, properties);
  if (typeof load === 'number') {
    metrics.load = Number(load.toFixed(2));
  }

  const duration = pickFirstNumber(DURATION_KEYS, properties);
  if (typeof duration === 'number') {
    metrics.duration_minutes = Number(duration.toFixed(2));
  }

  const dateString = coerceString(properties.date);
  if (dateString) {
    metrics.date = dateString;
  }

  const recipient = pickFirstString(RECIPIENT_KEYS, properties);
  if (recipient) {
    metrics.recipient = recipient;
  }

  const merchant = coerceString(properties.merchant_name);
  if (merchant) {
    metrics.merchant = merchant;
  }

  const category =
    pickFirstString(CATEGORY_KEYS, properties) ||
    (Array.isArray(properties.categories) && properties.categories[0]);
  if (category) {
    metrics.category = category;
  }

  const location =
    pickFirstString(LOCATION_KEYS, properties) ||
    (typeof properties.location === 'object' && properties.location !== null
      ? coerceString((properties.location as Record<string, unknown>).name)
      : undefined);
  if (location) {
    metrics.location = location;
  }

  const label = pickFirstString(LABEL_KEYS, properties);
  if (label) {
    metrics.label = label;
  }

  return Object.keys(metrics).length > 0 ? metrics : undefined;
}

export function buildComparisonPayload(record: LocalRecord): RecordComparisonRecordPayload {
  return {
    id: record.id,
    type: record.type,
    summary: record.summary ?? null,
    properties: buildPropertyHighlights(record.properties),
    metrics: buildMetrics(record),
  };
}

export async function requestQualitativeComparison(options: {
  apiBase: string;
  bearerToken: string;
  newRecord: LocalRecord;
  similarRecords: LocalRecord[];
  limit?: number;
}): Promise<string | null> {
  const { apiBase, bearerToken, newRecord, similarRecords, limit = 5 } = options;
  if (!bearerToken || similarRecords.length === 0) {
    return null;
  }

  const payload = {
    new_record: buildComparisonPayload(newRecord),
    similar_records: similarRecords.slice(0, limit).map(buildComparisonPayload),
  };

  if (payload.similar_records.length === 0) {
    return null;
  }

  try {
    const response = await generateRecordComparison(apiBase, bearerToken, payload);
    return response.analysis;
  } catch (error) {
    console.warn(
      '[RecordComparison] Failed to fetch qualitative comparison',
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
