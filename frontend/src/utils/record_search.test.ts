import { describe, expect, it } from 'vitest';
import { recordMatchesQuery } from './record_search.js';
import type { NeotomaRecord } from '@/types/record';

const baseRecord: NeotomaRecord = {
  id: 'rec-1',
  type: 'exercise',
  summary: 'Shoulder press workout',
  properties: {
    movement: 'shoulder press',
    assistance: 'leg push',
    tags: ['strength', 'upper body'],
    nested: {
      notes: 'Progressive overload',
    },
  },
  file_urls: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('recordMatchesQuery', () => {
  it('matches basic tokens across summary and properties', () => {
    expect(recordMatchesQuery(baseRecord, 'shoulder')).toBe(true);
    expect(recordMatchesQuery(baseRecord, 'leg push')).toBe(true);
    expect(recordMatchesQuery(baseRecord, 'progressive')).toBe(true);
    expect(recordMatchesQuery(baseRecord, 'missing term')).toBe(false);
  });

  it('requires all tokens to be present', () => {
    expect(recordMatchesQuery(baseRecord, 'shoulder press')).toBe(true);
    expect(recordMatchesQuery(baseRecord, 'shoulder bench')).toBe(false);
  });

  it('handles empty or whitespace queries', () => {
    expect(recordMatchesQuery(baseRecord, '')).toBe(true);
    expect(recordMatchesQuery(baseRecord, '   ')).toBe(true);
  });

  describe('fuzzy matching', () => {
    it('matches variations with hyphens (pushups vs push-ups)', () => {
      const record: NeotomaRecord = {
        ...baseRecord,
        summary: 'Push-ups workout',
        properties: {
          exercise: 'push-ups',
        },
      };
      
      expect(recordMatchesQuery(record, 'pushups')).toBe(true);
      expect(recordMatchesQuery(record, 'pushps')).toBe(true);
      expect(recordMatchesQuery(record, 'push-ups')).toBe(true);
      expect(recordMatchesQuery(record, 'push ups')).toBe(true);
    });

    it('matches typos and character variations', () => {
      const record: NeotomaRecord = {
        ...baseRecord,
        summary: 'Shoulder press',
        properties: {
          exercise: 'shoulder press',
        },
      };
      
      expect(recordMatchesQuery(record, 'sholder')).toBe(true); // missing 'u'
      expect(recordMatchesQuery(record, 'shulder')).toBe(true); // typo
      expect(recordMatchesQuery(record, 'press')).toBe(true);
      expect(recordMatchesQuery(record, 'pres')).toBe(true); // missing 's'
    });

    it('matches sit-ups variations', () => {
      const record: NeotomaRecord = {
        ...baseRecord,
        summary: 'Sit-ups exercise',
        properties: {
          exercise: 'sit-ups',
        },
      };
      
      expect(recordMatchesQuery(record, 'situps')).toBe(true);
      expect(recordMatchesQuery(record, 'sit ups')).toBe(true);
      expect(recordMatchesQuery(record, 'sitps')).toBe(true); // typo
    });

    it('handles compound words with spaces and hyphens', () => {
      const record: NeotomaRecord = {
        ...baseRecord,
        summary: 'Pull-up exercise',
        properties: {
          exercise: 'pull-up',
        },
      };
      
      expect(recordMatchesQuery(record, 'pullup')).toBe(true);
      expect(recordMatchesQuery(record, 'pull up')).toBe(true);
      expect(recordMatchesQuery(record, 'pullup')).toBe(true);
    });

    it('does not match completely different words', () => {
      const record: NeotomaRecord = {
        ...baseRecord,
        summary: 'Push-ups workout',
        properties: {
          exercise: 'push-ups',
        },
      };
      
      expect(recordMatchesQuery(record, 'squats')).toBe(false);
      expect(recordMatchesQuery(record, 'deadlift')).toBe(false);
      expect(recordMatchesQuery(record, 'bench')).toBe(false);
    });

    it('requires all tokens to fuzzy match', () => {
      const record: NeotomaRecord = {
        ...baseRecord,
        summary: 'Shoulder press workout',
        properties: {
          exercise: 'shoulder press',
        },
      };
      
      expect(recordMatchesQuery(record, 'sholder pres')).toBe(true); // both fuzzy match
      expect(recordMatchesQuery(record, 'sholder bench')).toBe(false); // second doesn't match
    });
  });
});


