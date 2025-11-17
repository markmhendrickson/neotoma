import { describe, expect, it } from 'vitest';
import { isCsvLike, parseCsvRows } from './csv.js';

describe('isCsvLike', () => {
  it('detects csv extension', () => {
    expect(isCsvLike('data.CSV', 'application/octet-stream')).toBe(true);
  });

  it('detects csv mime type', () => {
    expect(isCsvLike('notes.txt', 'text/csv')).toBe(true);
  });

  it('returns false when not csv-like', () => {
    expect(isCsvLike('image.png', 'image/png')).toBe(false);
  });
});

describe('parseCsvRows', () => {
  it('parses comma separated rows', () => {
    const csv = 'name,amount\nAlice,10\nBob,20\n';
    const result = parseCsvRows(csv);
    expect(result.truncated).toBe(false);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ name: 'Alice', amount: '10' });
  });

  it('parses semicolon separated rows', () => {
    const csv = 'name;value\nFoo;1\nBar;2\n';
    const result = parseCsvRows(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]).toEqual({ name: 'Bar', value: '2' });
  });

  it('flags truncation when over limit', () => {
    const csv = 'name\nA\nB\nC\n';
    const result = parseCsvRows(csv, 2);
    expect(result.rows).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });
});


