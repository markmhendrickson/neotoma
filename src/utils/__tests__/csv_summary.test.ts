import { describe, expect, it } from 'vitest';
import { summarizeCsvRowRecord, summarizeDatasetRecord } from '../csv_summary.js';

describe('summarizeCsvRowRecord', () => {
  it('highlights name, date, and numeric fields', () => {
    const summary = summarizeCsvRowRecord({
      rowIndex: 0,
      type: 'exercise',
      properties: {
        Name: 'Tempo Squat',
        Date: '2025-01-02',
        Repetitions: 5,
        Weight: 185,
        Notes: 'Focus on control',
      },
    });

    expect(summary).toContain('Tempo Squat');
    expect(summary).toContain('2025-01-02');
    expect(summary).toContain('Repetitions');
  });

  it('falls back to type label when data is sparse', () => {
    const summary = summarizeCsvRowRecord({
      rowIndex: 3,
      type: 'dataset_row',
      properties: {},
    });

    expect(summary).toContain('Dataset Row');
  });
});

describe('summarizeDatasetRecord', () => {
  it('describes row volume and headers', () => {
    const summary = summarizeDatasetRecord({
      fileName: 'sets-small.csv',
      rowCount: 12,
      truncated: false,
      samples: [
        { type: 'exercise', properties: { Name: 'Squat', Repetitions: 5 } },
        { type: 'exercise', properties: { Name: 'Bench', Repetitions: 8 } },
      ],
    });

    expect(summary).toContain('sets-small.csv');
    expect(summary).toContain('12 rows');
    expect(summary).toContain('fields');
  });
});


