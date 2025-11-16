export interface NeotomaRecord {
  id: string;
  type: string;
  created_at: string;
  updated_at: string;
  file_urls: string[];
  properties: Record<string, unknown>;
  summary?: string | null;
  embedding?: number[] | null;
  _status?: 'Uploading' | 'Failed' | 'Ready';
  _tempId?: string;
  _fileName?: string;
  _error?: string;
}

export const STATUS_ORDER = {
  Uploading: 0,
  Failed: 1,
  Ready: 2,
} as const;

export function normalizeRecord(record: NeotomaRecord): NeotomaRecord {
  if (!record) return record;
  return {
    ...record,
    id: record.id,
    type: record.type || '',
    created_at: record.created_at || new Date().toISOString(),
    updated_at: record.updated_at || record.created_at || new Date().toISOString(),
    file_urls: Array.isArray(record.file_urls) ? record.file_urls : [],
    properties: record.properties || {},
    _status: record._status || 'Ready',
  };
}

