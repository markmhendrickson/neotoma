type Primitive = string | number | boolean | null | undefined;

interface DatasetSummaryParams {
  fileName?: string;
  rowCount: number;
  truncated?: boolean;
  headers?: string[];
  sampleRows?: Record<string, string>[];
}

interface RowSummaryParams {
  rowIndex: number;
  type?: string;
  properties: Record<string, unknown>;
}

const LABEL_FIELDS = ['name', 'title', 'exercise', 'summary', 'note', 'description', 'item'];
const DATE_FIELDS = ['date', 'day', 'created', 'created_at', 'timestamp', 'time'];
const QUANTITY_FIELDS = [
  'amount',
  'total',
  'value',
  'balance',
  'repetitions',
  'reps',
  'sets',
  'weight',
  'duration',
  'distance',
  'count',
  'quantity',
];

const MAX_SUMMARY_LENGTH = 220;

function cleanValue(value: Primitive): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toString() : undefined;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : undefined;
}

function findFieldValue(props: Record<string, unknown>, candidates: string[]): { key: string; value: string } | null {
  for (const candidate of candidates) {
    const key = Object.keys(props).find((k) => k.toLowerCase() === candidate.toLowerCase());
    if (!key) continue;
    const value = cleanValue(props[key] as Primitive);
    if (value) {
      return { key, value };
    }
  }
  return null;
}

function humanizeType(type?: string): string {
  if (!type) return 'Row';
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDate(value: string): string | null {
  const asDate = new Date(value);
  if (!isNaN(asDate.getTime())) {
    return asDate.toISOString().split('T')[0];
  }
  return value.length <= 30 ? value : `${value.slice(0, 27)}...`;
}

export function summarizeDatasetRecord(params: DatasetSummaryParams): string {
  const { fileName = 'dataset', rowCount, truncated = false, headers = [], sampleRows = [] } = params;
  const headerSnippet = headers.length ? headers.slice(0, 4).join(', ') : 'columns detected';

  const sampleFields = new Set<string>();
  sampleRows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (key) sampleFields.add(key);
    });
  });

  const rowDescriptor = truncated ? `${rowCount}+ rows` : `${rowCount} rows`;
  const clauses = [`${rowDescriptor}`];
  if (headers.length) {
    clauses.push(`fields ${headerSnippet}${headers.length > 4 ? '…' : ''}`);
  } else if (sampleFields.size) {
    const fieldSnippet = Array.from(sampleFields).slice(0, 4).join(', ');
    clauses.push(`fields ${fieldSnippet}${sampleFields.size > 4 ? '…' : ''}`);
  }

  const summary = `${fileName} dataset with ${clauses.join('; ')}`;
  return summary.length > MAX_SUMMARY_LENGTH ? `${summary.slice(0, MAX_SUMMARY_LENGTH - 1)}…` : summary;
}

export function summarizeCsvRowRecord(params: RowSummaryParams): string {
  const { rowIndex, type, properties } = params;
  const props: Record<string, Primitive> = { ...properties } as Record<string, Primitive>;
  delete props.csv_origin;

  const label = findFieldValue(props, LABEL_FIELDS);
  const when = findFieldValue(props, DATE_FIELDS);
  const measurement = findFieldValue(props, QUANTITY_FIELDS);
  const secondary = Object.entries(props)
    .filter(([key]) => ![label?.key, when?.key, measurement?.key].includes(key))
    .slice(0, 2)
    .map(([key, value]) => {
      const formatted = cleanValue(value);
      return formatted ? `${key}: ${formatted}` : null;
    })
    .filter((entry): entry is string => Boolean(entry));

  const parts: string[] = [];
  if (label) {
    parts.push(label.value);
  }
  if (when) {
    const formattedDate = formatDate(when.value);
    if (formattedDate) {
      parts.push(`on ${formattedDate}`);
    }
  }
  if (measurement) {
    parts.push(`${measurement.key}: ${measurement.value}`);
  }
  if (secondary.length) {
    parts.push(...secondary);
  }

  const prefix = label ? '' : `${humanizeType(type)} ${rowIndex + 1}`;
  const assembled = prefix ? [prefix, ...parts] : parts;
  const summary = assembled.join(parts.length ? ' — ' : '');
  if (summary.trim().length === 0) {
    return `${humanizeType(type)} ${rowIndex + 1}`;
  }
  return summary.length > MAX_SUMMARY_LENGTH ? `${summary.slice(0, MAX_SUMMARY_LENGTH - 1)}…` : summary;
}


