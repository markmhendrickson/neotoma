import type { LocalRecord } from '@/store/types';

const SAMPLE_SEED_TAG = 'sample_seed';

interface SampleRecordTemplate {
  type: string;
  summary?: string;
  properties: Record<string, unknown>;
  file_urls?: string[];
}

const SAMPLE_RECORD_TEMPLATES: SampleRecordTemplate[] = [
  {
    type: 'note',
    summary: 'Northwind retro highlights and follow-ups',
    properties: {
      title: 'Northwind Q2 Retro',
      content: [
        'What went well: shipping MCP integration',
        'What needs work: flaky ingestion pipeline',
        'Action items: restructure background jobs',
      ].join('\n'),
      tags: ['retro', 'engineering'],
      owner: 'Hannah',
    },
  },
  {
    type: 'dataset',
    summary: 'Workout CSV parsed from Sets tracker',
    properties: {
      source_file: 'sets-small.csv',
      row_count: 42,
      imported_at: '2024-10-12T15:00:00Z',
      columns: ['date', 'movement', 'weight', 'reps', 'notes'],
      csv_rows: {
        totalRows: 42,
        truncated: false,
      },
    },
  },
  {
    type: 'dataset_row',
    summary: 'Front squat triple at RPE 8',
    properties: {
      csv_origin: 'sets-small.csv',
      row_index: 7,
      movement: 'Front Squat',
      weight: 215,
      reps: 3,
      rpe: 8,
      session_date: '2024-10-11',
    },
  },
  {
    type: 'exercise',
    summary: 'Long run with steady splits',
    properties: {
      name: 'Long run',
      distance_miles: 9.3,
      duration_minutes: 78,
      avg_pace: '8:24',
      route: 'Lake loop',
    },
  },
  {
    type: 'invoice',
    summary: 'Design retainer invoice for Basecamp',
    properties: {
      invoice_number: 'INV-2045',
      vendor: 'Basecamp Studio',
      amount_due: 4250,
      currency: 'USD',
      due_date: '2024-10-30',
      status: 'pending',
    },
  },
  {
    type: 'task',
    summary: 'Refactor ingestion workers to fix queue starvation',
    properties: {
      title: 'Refactor ingestion workers',
      status: 'in_progress',
      priority: 'high',
      assignee: 'Ravi',
      due_date: '2024-11-01',
    },
  },
  {
    type: 'message',
    summary: 'Chat transcript with Plaid support',
    properties: {
      channel: 'email',
      sender: 'support@plaid.com',
      recipient: 'dev@neotoma.io',
      subject: 'Re: Plaid item throttling',
      body_preview: 'Hello team — we bumped your rate limit...',
    },
  },
  {
    type: 'file_asset',
    summary: 'Product roadmap whiteboard snapshot',
    properties: {
      file_name: 'roadmap-draft.png',
      mime_type: 'image/png',
      size: 582031,
      source: 'whiteboard capture',
    },
    file_urls: ['files/roadmap-draft.png'],
  },
];

function createRecordId(index: number): string {
  const globalCrypto = typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }
  return `sample-record-${index}-${Date.now()}`;
}

export function buildSampleRecords(): LocalRecord[] {
  const now = Date.now();
  return SAMPLE_RECORD_TEMPLATES.map((template, index) => {
    const timestamp = new Date(now - index * 60 * 60 * 1000).toISOString();
    return {
      id: createRecordId(index),
      type: template.type,
      summary: template.summary ?? null,
      properties: {
        ...template.properties,
        seed_tag: SAMPLE_SEED_TAG,
        seed_index: index + 1,
      },
      file_urls: template.file_urls ?? [],
      embedding: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
  });
}

export const SAMPLE_RECORD_STORAGE_KEY = 'neotoma.sampleSeeded';


