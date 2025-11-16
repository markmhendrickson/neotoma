/**
 * Local file processing utilities
 * Creates records from files locally without requiring API
 */

import type { LocalRecord } from '../store/types';

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
}

/**
 * Process a file and create a local record
 * This is a simplified version that works entirely locally
 */
export async function processFileLocally(options: ProcessFileOptions): Promise<LocalRecord> {
  const { file, recordId } = options;
  
  // Read file as buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);
  
  // Extract basic metadata
  const fileName = file.name;
  const mimeType = file.type || 'application/octet-stream';
  const fileSize = file.size;
  
  // Determine type from filename/mime type
  const type = inferTypeFromFile(fileName, mimeType);
  
  // Extract text preview if possible
  let textPreview = '';
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    try {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      textPreview = decoder.decode(buffer.slice(0, 8000));
    } catch (e) {
      // Ignore decode errors
    }
  }
  
  // Create properties with metadata
  const properties: Record<string, unknown> = {
    filename: fileName,
    file_size: fileSize,
    mime_type: mimeType,
    summary: textPreview 
      ? `File: ${fileName} (${formatFileSize(fileSize)})`
      : `File: ${fileName} (${formatFileSize(fileSize)}, ${mimeType})`,
  };
  
  // Add text preview if available
  if (textPreview) {
    properties.text_preview = textPreview.slice(0, 2000); // Limit preview size
  }
  
  // Create file URL (local reference - in a real implementation, this might be a blob URL)
  const fileUrl = `local://${recordId || randomUUID()}/${fileName}`;
  
  const now = new Date().toISOString();
  const id = recordId || randomUUID();
  
  return {
    id,
    type,
    properties,
    file_urls: [fileUrl],
    embedding: null, // Embeddings can be generated later if needed
    created_at: now,
    updated_at: now,
  };
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

