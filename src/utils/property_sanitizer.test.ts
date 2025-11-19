import { describe, expect, it } from 'vitest';
import { sanitizePropertyValue, sanitizeRecordProperties } from './property_sanitizer.js';

describe('sanitizePropertyValue', () => {
  it('removes trailing Notion URLs in parentheses', () => {
    const input = 'Abdominal roller (https://www.notion.so/Abdominal-roller-23d6ea88f52880c1b574ed1bbbf022c4?pvs=21)';
    expect(sanitizePropertyValue(input)).toBe('Abdominal roller');
  });

  it('removes markdown-style Notion links', () => {
    const input = '[Exercise name](https://notion.so/Some-Page-abc123)';
    expect(sanitizePropertyValue(input)).toBe('Exercise name');
  });

  it('preserves non-string primitives', () => {
    expect(sanitizePropertyValue(42)).toBe(42);
    expect(sanitizePropertyValue(true)).toBe(true);
    expect(sanitizePropertyValue(false)).toBe(false);
    expect(sanitizePropertyValue(null)).toBe(null);
  });

  it('normalizes whitespace and removes quotes', () => {
    expect(sanitizePropertyValue('  multiple   spaces  ')).toBe('multiple spaces');
    expect(sanitizePropertyValue('"quoted"')).toBe('quoted');
  });

  it('returns undefined for empty strings after cleaning', () => {
    expect(sanitizePropertyValue('')).toBeUndefined();
    expect(sanitizePropertyValue('(https://notion.so/page)')).toBeUndefined();
  });

  it('leaves non-Notion URLs untouched', () => {
    const input = 'Link (https://example.com/page)';
    expect(sanitizePropertyValue(input)).toBe('Link (https://example.com/page)');
  });
});

describe('sanitizeRecordProperties', () => {
  it('sanitizes primitives and stores removed urls', () => {
    const input = {
      exercise: 'Abdominal roller (https://notion.so/page-123)',
      date: '2025-07-26',
    };
    expect(sanitizeRecordProperties(input)).toEqual({
      exercise: 'Abdominal roller',
      exercise_url: 'https://notion.so/page-123',
      date: '2025-07-26',
    });
  });

  it('handles markdown links with url fields', () =>
    expect(
      sanitizeRecordProperties({
        summary: '[Notebook entry](https://notion.so/entry-1)',
      })
    ).toEqual({
      summary: 'Notebook entry',
      summary_url: 'https://notion.so/entry-1',
    }));

  it('handles nested objects', () => {
    const result = sanitizeRecordProperties({
      metadata: {
        source: 'Notion (https://notion.so/source)',
      },
    });
    expect(result).toEqual({
      metadata: {
        source: 'Notion',
        source_url: 'https://notion.so/source',
      },
    });
  });

  it('handles arrays and aggregates urls', () => {
    const result = sanitizeRecordProperties({
      tags: [
        'tag1 (https://notion.so/tag1)',
        'tag2',
        'tag3 (https://notion.so/tag3)',
      ],
    });
    expect(result).toEqual({
      tags: ['tag1', 'tag2', 'tag3'],
      tags_urls: ['https://notion.so/tag1', 'https://notion.so/tag3'],
    });
  });

  it('drops empty strings but keeps url references', () => {
    const result = sanitizeRecordProperties({
      notionUrl: '(https://notion.so/only-url)',
    });
    expect(result).toEqual({
      notionUrl_url: 'https://notion.so/only-url',
    });
  });

  it('preserves Date objects', () => {
    const date = new Date('2025-07-26');
    const result = sanitizeRecordProperties({
      created: date,
      name: 'Record (https://notion.so/record)',
    });
    expect(result.created).toBe(date);
    expect(result.name).toBe('Record');
    expect(result.name_url).toBe('https://notion.so/record');
  });
});

