import { describe, expect, it } from 'vitest';
import { processFileLocally } from './file_processing.js';

function createMockFile(content: string, name: string, type: string): File {
  const buffer = new TextEncoder().encode(content).buffer;
  return {
    name,
    type,
    size: buffer.byteLength,
    arrayBuffer: async () => buffer,
  } as File;
}

describe('processFileLocally', () => {
  it('creates per-row records for csv when enabled', async () => {
    const csv = [
      'Name;Value',
      'Alpha;1',
      'Beta;2',
    ].join('\n');
    const file = createMockFile(csv, 'sets-small.csv', 'text/csv');

    const result = await processFileLocally({
      file,
      csvRowRecordsEnabled: true,
    });

    expect(result.primaryRecord).toBeNull();
    expect(result.additionalRecords).toHaveLength(2);
    expect(result.additionalRecords[0].properties).toHaveProperty('csv_origin.file_name', 'sets-small.csv');
  });

  it('skips row creation when disabled', async () => {
    const csv = 'Name;Value\nAlpha;1\n';
    const file = createMockFile(csv, 'sets-small.csv', 'text/csv');

    const result = await processFileLocally({
      file,
      csvRowRecordsEnabled: false,
    });

    expect(result.primaryRecord?.type).not.toBe('dataset_row');
    expect(result.additionalRecords).toHaveLength(0);
  });
});


