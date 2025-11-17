import { describe, expect, it } from 'vitest';
import { normalizeRecordType } from './config/record_types.js';
import { standardizeType } from './normalize.js';

describe('normalizeRecordType', () => {
  it('maps aliases to canonical ids', () => {
    const result = normalizeRecordType('Transactions');
    expect(result.type).toBe('transaction');
    expect(result.match).toBe('alias');
  });

  it('resolves csv alias to dataset', () => {
    const result = normalizeRecordType('CSV');
    expect(result.type).toBe('dataset');
  });

  it('sanitizes unknown types into snake_case', () => {
    const result = normalizeRecordType('My Custom Type!');
    expect(result.type).toBe('my_custom_type');
    expect(result.match).toBe('custom');
  });
});

describe('standardizeType', () => {
  it('prefers canonical types even when existing types contain variants', () => {
    const value = standardizeType('Workout', ['exercise', 'note']);
    expect(value).toBe('exercise');
  });

  it('falls back to closest historical custom type when not canonical', () => {
    const value = standardizeType('customtype', ['custom_type']);
    expect(value).toBe('custom_type');
  });
});

