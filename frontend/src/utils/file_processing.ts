/**
 * Local file processing utilities
 * Creates records from files locally without requiring API
 */

import type { LocalRecord } from '../store/types';
import { isCsvLike, parseCsvRows } from './csv.js';

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
  primaryRecord: LocalRecord;
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
  const type = inferTypeFromFile(fileName, mimeType);
  
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
  
  // Add text preview if available
  if (textPreview) {
    properties.text_preview = textPreview.slice(0, 2000); // Limit preview size
  }
  
  // Create file URL (local reference - in a real implementation, this might be a blob URL)
  const fileUrl = `local://${recordId || randomUUID()}/${fileName}`;
  
  const now = new Date().toISOString();
  const id = recordId || randomUUID();
  
  const baseRecord: LocalRecord = {
    id,
    type,
    summary,
    properties,
    file_urls: [fileUrl],
    embedding: null, // Embeddings can be generated later if needed
    created_at: now,
    updated_at: now,
  };

  const additionalRecords: LocalRecord[] = [];

  if (csvRowRecordsEnabled && isCsvLike(fileName, mimeType)) {
    const { rows, truncated, headers } = parseCsvRows(fullText);
    const parentType = 'dataset';
    const parentSummary = `Dataset from ${fileName}`;
    const sourceMetadata = {
      name: fileName,
      size: fileSize,
      mime_type: mimeType,
      file_url: fileUrl,
    };

    baseRecord.type = parentType;
    baseRecord.summary = parentSummary;

    if (rows.length > 0) {
      baseRecord.properties = {
        ...baseRecord.properties,
        source_file: sourceMetadata,
        csv_headers: headers,
        csv_rows: {
          linked_records: rows.length,
          truncated,
          relationship: 'contains_row',
        },
      };

      rows.forEach((row, index) => {
        const rowId = randomUUID();
        additionalRecords.push({
          id: rowId,
          type: 'dataset_row',
          summary: `Row ${index + 1} from ${fileName}`,
          properties: {
            ...row,
            csv_origin: {
              parent_record_id: baseRecord.id,
              row_index: index,
              file_url: fileUrl,
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

  return { primaryRecord: baseRecord, additionalRecords };
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

