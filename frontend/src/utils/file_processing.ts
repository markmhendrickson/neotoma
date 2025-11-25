/**
 * Local file processing utilities
 * Creates records from files locally without requiring API
 */

import type { LocalRecord } from '../store/types';
import { isCsvLike, parseCsvRows } from './csv.js';
import { normalizeRecordType } from '../../../src/config/record_types.ts';
import { persistLocalRecordFile } from './local_files';
import { summarizeDatasetRecord, summarizeCsvRowRecord } from './csv_summary';

function randomUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for browsers without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface ProcessFileOptions {
  file: File;
  recordId?: string;
  csvRowRecordsEnabled?: boolean;
}

export interface ProcessFileResult {
  primaryRecord: LocalRecord | null;
  additionalRecords: LocalRecord[];
}

async function readFileArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    try {
      return await file.arrayBuffer();
    } catch {
      // Fall through to other strategies
    }
  }
  if (typeof file.text === 'function') {
    const text = await file.text();
    return new TextEncoder().encode(text).buffer;
  }
  if (typeof Blob !== 'undefined') {
    const blob = new Blob([file]);
    if (typeof blob.arrayBuffer === 'function') {
      return blob.arrayBuffer();
    }
  }
  if (typeof Response !== 'undefined') {
    const response = new Response(file as unknown as BodyInit);
    return response.arrayBuffer();
  }
  throw new Error('File APIs are not available in this environment');
}

/**
 * Process a file and create a local record
 * This is a simplified version that works entirely locally
 */
export async function processFileLocally(options: ProcessFileOptions): Promise<ProcessFileResult> {
  const { file, recordId, csvRowRecordsEnabled } = options;
  
  // Read file as buffer
  const arrayBuffer = await readFileArrayBuffer(file);
  const buffer = new Uint8Array(arrayBuffer);
  
  // Extract basic metadata
  const fileName = file.name;
  const mimeType = file.type || 'application/octet-stream';
  const fileSize = file.size;
  
  // Determine type from filename/mime type
  const type = normalizeRecordType(inferTypeFromFile(fileName, mimeType)).type;
  
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let fullText = '';
  try {
    fullText = decoder.decode(buffer);
  } catch {
    fullText = '';
  }

  const textPreview = fullText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)
    .join('\n');
  
  const previewLine = textPreview
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  const summary = previewLine
    ? previewLine.slice(0, 200)
    : `File "${fileName}" (${formatFileSize(fileSize)}, ${mimeType || 'unknown type'})`;

  // Create properties with metadata
  const properties: Record<string, unknown> = {
    filename: fileName,
    file_size: fileSize,
    mime_type: mimeType,
  };
  
  const now = new Date().toISOString();
  const id = recordId || randomUUID();

  const persistedPath = await persistLocalRecordFile({
    recordId: id,
    fileName,
    data: buffer,
  }).catch((error) => {
    console.warn('[processFileLocally] Failed to persist file locally', error);
    return null;
  });
  const fileUrl = persistedPath ?? `local://${id}/${fileName}`;
  
  let baseRecord: LocalRecord = {
    id,
    type,
    summary,
    properties,
    file_urls: [fileUrl],
    embedding: null, // Embeddings can be generated later if needed
    created_at: now,
    updated_at: now,
  };

  let primaryRecord: LocalRecord | null = baseRecord;
  const additionalRecords: LocalRecord[] = [];

  const csvProcessingEnabled = Boolean(csvRowRecordsEnabled && isCsvLike(fileName, mimeType));
  if (csvProcessingEnabled) {
    const { rows, truncated, headers } = parseCsvRows(fullText);
    const parentType = 'dataset';
    const parentSummary = summarizeDatasetRecord({
      fileName,
      rowCount: rows.length,
      truncated,
      headers,
      sampleRows: rows.slice(0, 5),
    });
    baseRecord = {
      ...baseRecord,
      type: parentType,
      summary: parentSummary,
    };

    if (rows.length > 0) {
      primaryRecord = null;

      const baseCsvOrigin: Record<string, unknown> = {
        file_url: fileUrl,
        file_name: fileName,
        file_size: fileSize,
        mime_type: mimeType,
      };
      if (primaryRecord) {
        baseCsvOrigin.parent_record_id = primaryRecord.id;
      }

      rows.forEach((row, index) => {
        const rowId = randomUUID();
        const inferredType = inferTypeFromRowData(row) || 'dataset_row';
        const normalizedType = normalizeRecordType(inferredType).type;
        const rowSummary = summarizeCsvRowRecord({
          rowIndex: index,
          type: normalizedType,
          properties: row,
        });
        additionalRecords.push({
          id: rowId,
          type: normalizedType,
          summary: rowSummary,
          properties: {
            ...row,
            csv_origin: {
              ...baseCsvOrigin,
              row_index: index,
            },
          },
          file_urls: [fileUrl],
          embedding: null,
          created_at: now,
          updated_at: now,
        });
      });
    }
  }

  return { primaryRecord, additionalRecords };
}

/**
 * Infer record type from row data (headers and values)
 */
function inferTypeFromRowData(row: Record<string, string>): string | undefined {
  const keys = Object.keys(row).map(k => k.toLowerCase());
  const values = Object.values(row).map(v => String(v).toLowerCase());
  
  // Finance types
  if (keys.some(k => k.includes('transaction') || k.includes('merchant') || (k.includes('amount') && keys.some(k2 => k2.includes('date'))))) {
    return 'transaction';
  }
  if (keys.some(k => k.includes('invoice') || k.includes('bill') || (k.includes('amount') && k.includes('due')))) {
    return 'invoice';
  }
  if (keys.some(k => k.includes('receipt') || (k.includes('merchant') && keys.some(k2 => k2.includes('total'))))) {
    return 'receipt';
  }
  if (keys.some(k => k.includes('statement') || (k.includes('balance') && keys.some(k2 => k2.includes('period'))))) {
    return 'statement';
  }
  if (keys.some(k => k.includes('account') && (k.includes('balance') || k.includes('institution')))) {
    return 'account';
  }
  if (keys.some(k => k.includes('subscription') || k.includes('recurring') || (k.includes('renewal') && k.includes('date')))) {
    return 'subscription';
  }
  if (keys.some(k => k.includes('budget') || (k.includes('spending') && k.includes('plan')))) {
    return 'budget';
  }
  
  // Health types
  if (keys.some(k => k.includes('exercise') || k.includes('workout') || k.includes('repetitions') || k.includes('reps') || k.includes('sets') || k.includes('rpe'))) {
    return 'exercise';
  }
  if (keys.some(k => k.includes('meal') || k.includes('food') || k.includes('calories') || k.includes('nutrition'))) {
    return 'meal';
  }
  if (keys.some(k => k.includes('sleep') || (k.includes('bedtime') && k.includes('wake')))) {
    return 'sleep_session';
  }
  if (keys.some(k => k.includes('measurement') || k.includes('biometric') || (k.includes('weight') && k.includes('height')))) {
    return 'measurement';
  }
  
  // Productivity types
  if (keys.some(k => k.includes('task') || k.includes('todo') || (k.includes('status') && keys.some(k2 => k2.includes('due'))))) {
    return 'task';
  }
  if (keys.some(k => k.includes('project') || k.includes('initiative') || (k.includes('owner') && keys.some(k2 => k2.includes('start'))))) {
    return 'project';
  }
  if (keys.some(k => k.includes('goal') || k.includes('objective') || k.includes('okr'))) {
    return 'goal';
  }
  if (keys.some(k => k.includes('event') || k.includes('meeting') || k.includes('appointment') || (k.includes('start') && k.includes('time') && keys.some(k2 => k2.includes('location'))))) {
    return 'event';
  }
  if (keys.some(k => k.includes('note') || k.includes('memo') || k.includes('journal') || (k.includes('content') && keys.some(k2 => k2.includes('title'))))) {
    return 'note';
  }
  
  // Knowledge types
  if (keys.some(k => k.includes('contact') || k.includes('person') || (k.includes('email') && keys.some(k2 => k2.includes('phone'))))) {
    return 'contact';
  }
  if (keys.some(k => k.includes('message') || k.includes('email') || k.includes('dm') || (k.includes('sender') && keys.some(k2 => k2.includes('recipient'))))) {
    return 'message';
  }
  if (keys.some(k => k.includes('document') || k.includes('pdf') || (k.includes('title') && keys.some(k2 => k2.includes('link'))))) {
    return 'document';
  }
  
  // Fallback: check for common patterns in values
  if (values.some(v => v.includes('exercise') || v.includes('workout'))) return 'exercise';
  if (values.some(v => v.includes('transaction') || v.includes('purchase'))) return 'transaction';
  if (values.some(v => v.includes('task') || v.includes('todo'))) return 'task';
  if (values.some(v => v.includes('note') || v.includes('memo'))) return 'note';
  
  return undefined;
}

/**
 * Infer record type from filename and MIME type
 */
function inferTypeFromFile(fileName: string, mimeType: string): string {
  const lowerName = fileName.toLowerCase();
  const ext = lowerName.split('.').pop() || '';
  
  // Type inference based on extension and MIME type
  if (lowerName.includes('invoice') || lowerName.includes('bill')) return 'invoice';
  if (lowerName.includes('receipt')) return 'receipt';
  if (lowerName.includes('statement')) return 'statement';
  if (lowerName.includes('contract') || lowerName.includes('agreement')) return 'contract';
  if (lowerName.includes('resume') || lowerName.includes('cv')) return 'resume';
  if (lowerName.includes('report')) return 'report';
  if (lowerName.includes('note') || lowerName.includes('memo')) return 'note';
  if (lowerName.includes('email') || mimeType.includes('mail')) return 'email';
  if (lowerName.includes('image') || mimeType.startsWith('image/')) return 'image';
  if (lowerName.includes('video') || mimeType.startsWith('video/')) return 'video';
  if (lowerName.includes('audio') || mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf')) return 'document';
  if (mimeType.includes('spreadsheet') || ext === 'xlsx' || ext === 'xls' || ext === 'csv') return 'spreadsheet';
  if (mimeType.includes('word') || ext === 'doc' || ext === 'docx') return 'document';
  if (mimeType.startsWith('text/') || ext === 'txt' || ext === 'md') return 'text';
  if (ext === 'json') return 'data';
  if (ext === 'zip' || ext === 'tar' || ext === 'gz') return 'archive';
  
  return 'file'; // Default fallback
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

