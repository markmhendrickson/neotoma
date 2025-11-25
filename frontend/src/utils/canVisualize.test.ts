import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import type { VisualizationRequest } from '@/types/visualization';
import type { LocalRecord } from '@/store/types';
import { validateVisualizationCandidate } from './canVisualize';

const baseRequest: VisualizationRequest = {
  graphType: 'bar',
  justification: 'Compare mock values',
  measureFields: [{ key: 'amount', label: 'Amount' }],
  dimensionField: { key: 'vendor', label: 'Vendor', kind: 'category' },
};

const buildRecord = (overrides: Partial<LocalRecord> = {}): LocalRecord => ({
  id: overrides.id ?? randomUUID(),
  type: overrides.type ?? 'invoice',
  summary: overrides.summary ?? null,
  properties: overrides.properties ?? { vendor: 'Acme', amount: 42 },
  file_urls: overrides.file_urls ?? [],
  embedding: null,
  created_at: overrides.created_at ?? new Date().toISOString(),
  updated_at: overrides.updated_at ?? new Date().toISOString(),
});

describe('validateVisualizationCandidate', () => {
  it('accepts numeric measures and returns sanitized rows', () => {
    const records = [
      buildRecord({ properties: { vendor: 'Acme', amount: 100 } }),
      buildRecord({ properties: { vendor: 'Globex', amount: 200 } }),
    ];
    const result = validateVisualizationCandidate({ request: baseRequest, records });
    expect(result.ok).toBe(true);
    expect(result.records).toHaveLength(2);
    expect(result.records[0].measures.amount).toBe(100);
  });

  it('rejects datasets without numeric values', () => {
    const records = [
      buildRecord({ properties: { vendor: 'Invalid', amount: 'n/a' } }),
    ];
    const result = validateVisualizationCandidate({ request: baseRequest, records });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/Need at least/);
  });
});

