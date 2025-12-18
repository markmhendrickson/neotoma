import type { LocalRecord } from '@/store/types';
import { parseCsvRows } from '@/utils/csv';
import { setsMediumCsv } from './sets-medium';

const SAMPLE_SEED_TAG = 'sample_seed';
const WORKOUT_SAMPLE_FILE = 'sets-medium.csv';

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
  const templateRecords = SAMPLE_RECORD_TEMPLATES.map((template, index) => {
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

  const workoutRecords = buildWorkoutSampleRecords(templateRecords.length);

  return [...templateRecords, ...workoutRecords];
}

function buildWorkoutSampleRecords(indexOffset: number): LocalRecord[] {
  if (!setsMediumCsv || !setsMediumCsv.trim()) {
    return [];
  }

  const { rows, headers, truncated } = parseCsvRows(setsMediumCsv, 5000);
  if (rows.length === 0) {
    return [];
  }

  const firstTimestamp = sanitizeDate(rows[0]?.['Date'] || rows[0]?.['Created at']);
  const lastTimestamp = sanitizeDate(rows[rows.length - 1]?.['Date'] || rows[rows.length - 1]?.['Created at']);
  const datasetTimestamp = firstTimestamp ?? new Date().toISOString();
  const datasetId = createRecordId(indexOffset + 1);

  const datasetSummaryParts = [
    `Workout log (${rows.length} sets)`,
    firstTimestamp && lastTimestamp
      ? `${formatIsoDate(firstTimestamp)} → ${formatIsoDate(lastTimestamp)}`
      : null,
  ].filter(Boolean);

  const datasetRecord: LocalRecord = {
    id: datasetId,
    type: 'dataset',
    summary: datasetSummaryParts.join(' — '),
    properties: {
      source_file: WORKOUT_SAMPLE_FILE,
      row_count: rows.length,
      headers,
      truncated,
      seed_tag: SAMPLE_SEED_TAG,
      seed_index: indexOffset + 1,
    },
    file_urls: [],
    embedding: null,
    created_at: datasetTimestamp,
    updated_at: datasetTimestamp,
  };

  const rowRecords = rows.map((row, rowIndex) => {
    const recordTimestamp =
      sanitizeDate(row['Created at'] || row['Date']) ||
      new Date(datasetTimestamp ? new Date(datasetTimestamp).getTime() + rowIndex * 1000 : Date.now()).toISOString();
    return {
      id: createRecordId(indexOffset + rowIndex + 2),
      type: 'exercise',
      summary: buildWorkoutRowSummary(row, rowIndex),
      properties: {
        ...row,
        csv_origin: {
          file_name: WORKOUT_SAMPLE_FILE,
          row_index: rowIndex,
          parent_record_id: datasetId,
        },
        seed_tag: SAMPLE_SEED_TAG,
        seed_index: indexOffset + rowIndex + 2,
      },
      file_urls: [],
      embedding: null,
      created_at: recordTimestamp,
      updated_at: recordTimestamp,
    };
  });

  return [datasetRecord, ...rowRecords];
}

function buildWorkoutRowSummary(row: Record<string, string>, index: number): string {
  const exercise = sanitizeCell(row['Exercise']) || sanitizeCell(row['Name']) || 'Workout set';
  const dateLabel = sanitizeCell(row['Date']) || sanitizeCell(row['Created at']);
  const reps = sanitizeCell(row['Repetitions']) || sanitizeCell(row['Range']);
  const weight = sanitizeCell(row['Weight']);
  const difficulty = sanitizeCell(row['Difficulty']);
  const rpe = sanitizeCell(row['RPE']);
  const notes = sanitizeCell(row['Notes']);
  const type = sanitizeCell(row['Type']);

  const parts = [
    dateLabel,
    exercise,
    reps ? `${reps} reps` : null,
    weight,
    type && !weight ? type : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const extra = [difficulty, rpe ? `RPE ${rpe}` : null].filter(Boolean).join(', ');
  const summarySegments = [parts, extra, notes].filter(Boolean);

  return summarySegments.join(' — ') || `Workout set #${index + 1}`;
}

function sanitizeCell(value?: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.toString().trim();
  if (!trimmed || trimmed === '""') {
    return null;
  }
  return trimmed.replace(/^"|"$/g, '');
}

function sanitizeDate(value?: string): string | null {
  const cell = sanitizeCell(value);
  if (!cell) {
    return null;
  }
  const stripped = cell
    .replace(/^@+/, '')
    .replace(/\s*\(https?:\/\/[^\)]+\)/g, '')
    .trim();
  if (!stripped) {
    return null;
  }
  const parsed = new Date(stripped);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function formatIsoDate(iso: string): string {
  return iso.split('T')[0];
}

export const SAMPLE_RECORD_STORAGE_KEY = 'neotoma.sampleSeeded';
