import type { VisualizationRequest } from '@/types/visualization';
import type { LocalRecord } from '@/store/types';

export interface SanitizedVisualizationDatum {
  id: string;
  dimension: string | number | Date;
  measures: Record<string, number>;
}

export interface VisualizationValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  graphType: VisualizationRequest['graphType'];
  records: SanitizedVisualizationDatum[];
}

const NUMERIC_GRAPH_TYPES = new Set(['line', 'bar', 'stacked_bar', 'scatter'] as const);

const MIN_SAMPLES_FOR_TYPE: Record<VisualizationRequest['graphType'], number> = {
  line: 2,
  scatter: 2,
  bar: 1,
  stacked_bar: 1,
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const resolveDimensionValue = (
  record: LocalRecord,
  request: VisualizationRequest,
  index: number
): { value: string | number | Date; warning?: string } => {
  const fallback = index;
  if (!request.dimensionField) {
    return { value: fallback };
  }

  const raw = record.properties?.[request.dimensionField.key];
  if (raw === undefined || raw === null) {
    return { value: fallback, warning: `Record ${record.id} missing ${request.dimensionField.key}` };
  }

  if (request.dimensionField.kind === 'time') {
    if (raw instanceof Date && !Number.isNaN(raw.valueOf())) {
      return { value: raw };
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return { value: new Date(raw) };
    }
    if (typeof raw === 'string') {
      const parsed = Date.parse(raw);
      if (!Number.isNaN(parsed)) {
        return { value: new Date(parsed) };
      }
    }
    return { value: fallback, warning: `Record ${record.id} has non-date ${request.dimensionField.key}` };
  }

  if (typeof raw === 'string' || typeof raw === 'number') {
    return { value: raw };
  }

  return { value: fallback, warning: `Record ${record.id} has incompatible ${request.dimensionField.key}` };
};

export function validateVisualizationCandidate(params: {
  request: VisualizationRequest;
  records: LocalRecord[];
}): VisualizationValidationResult {
  const { request, records } = params;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!NUMERIC_GRAPH_TYPES.has(request.graphType)) {
    errors.push(`Unsupported graph type: ${request.graphType}`);
  }
  if (!request.measureFields || request.measureFields.length === 0) {
    errors.push('Visualization is missing numeric measure fields.');
  }

  const sanitized: SanitizedVisualizationDatum[] = [];

  records.forEach((record, index) => {
    if (!record || !record.properties) {
      warnings.push(`Record ${record?.id ?? '(unknown)'} is missing properties.`);
      return;
    }

    const measures: Record<string, number> = {};
    let validMeasureCount = 0;

    request.measureFields?.forEach((field) => {
      const numeric = toNumber(record.properties[field.key]);
      if (numeric === null) {
        warnings.push(`Record ${record.id} missing numeric value for ${field.key}.`);
        return;
      }
      measures[field.key] = numeric;
      validMeasureCount += 1;
    });

    if (validMeasureCount === 0) {
      return;
    }

    const dimensionResult = resolveDimensionValue(record, request, index);
    if (dimensionResult.warning) {
      warnings.push(dimensionResult.warning);
    }

    sanitized.push({
      id: record.id,
      dimension: dimensionResult.value,
      measures,
    });
  });

  const requiredSamples = MIN_SAMPLES_FOR_TYPE[request.graphType] ?? 1;
  if (sanitized.length < requiredSamples) {
    errors.push(`Need at least ${requiredSamples} records with numeric data to render a ${request.graphType} chart.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    graphType: request.graphType,
    records: sanitized,
  };
}

