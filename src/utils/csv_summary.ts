import { normalizeRecordType } from "../config/record_types.js";

type Primitive = string | number | boolean | null | undefined;

interface DatasetSummarySample {
  type?: string;
  properties: Record<string, unknown>;
}

interface DatasetSummaryParams {
  fileName?: string;
  rowCount: number;
  truncated?: boolean;
  samples: DatasetSummarySample[];
}

interface RowSummaryParams {
  rowIndex: number;
  type: string;
  properties: Record<string, unknown>;
}

const LABEL_FIELDS = [
  "name",
  "title",
  "exercise",
  "summary",
  "note",
  "description",
  "item",
];
const DATE_FIELDS = [
  "date",
  "day",
  "created",
  "created_at",
  "timestamp",
  "time",
];
const QUANTITY_FIELDS = [
  "amount",
  "total",
  "value",
  "balance",
  "repetitions",
  "reps",
  "sets",
  "weight",
  "duration",
  "distance",
  "count",
  "quantity",
];

const MAX_SUMMARY_LENGTH = 220;

function cleanValue(value: Primitive): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number")
    return Number.isFinite(value) ? value.toString() : undefined;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : undefined;
}

function findFieldValue(
  props: Record<string, unknown>,
  candidates: string[],
): { key: string; value: string } | null {
  for (const candidate of candidates) {
    const key = Object.keys(props).find(
      (k) => k.toLowerCase() === candidate.toLowerCase(),
    );
    if (!key) continue;
    const value = cleanValue(props[key] as Primitive);
    if (value) {
      return { key, value };
    }
  }
  return null;
}

function humanizeType(type: string): string {
  const normalized = normalizeRecordType(type).type || type;
  return normalized
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(value: string): string | null {
  const asDate = new Date(value);
  if (!isNaN(asDate.getTime())) {
    return asDate.toISOString().split("T")[0];
  }
  return value.length <= 30 ? value : `${value.slice(0, 27)}...`;
}

export function summarizeDatasetRecord(params: DatasetSummaryParams): string {
  const { fileName = "dataset", rowCount, truncated = false, samples } = params;
  const sampleProps = samples.flatMap((sample) =>
    Object.keys(sample.properties || {}),
  );
  const headers = Array.from(
    new Set(
      sampleProps
        .filter((key) => key !== "csv_origin")
        .filter((key) => typeof key === "string" && key.trim().length > 0),
    ),
  );

  const typeCounts = new Map<string, number>();
  samples.forEach((sample) => {
    if (sample.type) {
      const label = humanizeType(sample.type);
      typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1);
    }
  });

  const headerSnippet = headers.length
    ? headers.slice(0, 4).join(", ")
    : "columns detected";
  const typeSnippet = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([label, count]) => `${label} (${count})`)
    .join(", ");

  const rowDescriptor = truncated ? `${rowCount}+ rows` : `${rowCount} rows`;
  const clauses = [`${rowDescriptor}`];
  if (headers.length) {
    clauses.push(`fields ${headerSnippet}${headers.length > 4 ? "…" : ""}`);
  }
  if (typeSnippet) {
    clauses.push(`types ${typeSnippet}`);
  }

  const summary = `${fileName} dataset with ${clauses.join("; ")}`;
  return summary.length > MAX_SUMMARY_LENGTH
    ? `${summary.slice(0, MAX_SUMMARY_LENGTH - 1)}…`
    : summary;
}

export function summarizeCsvRowRecord(params: RowSummaryParams): string {
  const { rowIndex, type, properties } = params;
  const props: Record<string, Primitive> = { ...properties } as Record<
    string,
    Primitive
  >;
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

  const rowLabel =
    type
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  const prefix = label ? "" : `${rowLabel} row ${rowIndex + 1}`;
  const assembled = prefix ? [prefix, ...parts] : parts;
  const summary = assembled.join(parts.length ? " — " : "");
  if (summary.trim().length === 0) {
    return `${rowLabel} row ${rowIndex + 1}`;
  }
  return summary.length > MAX_SUMMARY_LENGTH
    ? `${summary.slice(0, MAX_SUMMARY_LENGTH - 1)}…`
    : summary;
}
