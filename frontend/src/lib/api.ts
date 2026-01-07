import type { NeotomaRecord } from '@/types/record';

/**
 * Normalize API base URL to use Vite proxy in development
 * If apiBase is the current origin (dev mode), use /api prefix for proxy
 * Otherwise, use the provided apiBase as-is
 */
export function normalizeApiUrl(apiBase: string, endpoint: string): string {
  // If apiBase is the current origin (development), use /api proxy
  if (apiBase === window.location.origin || apiBase === '') {
    return `/api${endpoint}`;
  }
  // If apiBase already includes /api, don't duplicate it
  if (apiBase.includes('/api')) {
    return `${apiBase}${endpoint}`;
  }
  // For custom API bases, use as-is
  return `${apiBase}${endpoint}`;
}

export async function fetchRecords(apiBase: string, bearerToken: string): Promise<NeotomaRecord[]> {
  const response = await fetch(normalizeApiUrl(apiBase, '/entities/query'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      limit: 500,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized - check your Bearer Token');
    } else if (response.status === 403) {
      throw new Error('Forbidden - invalid Bearer Token');
    } else {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }
  }

  const data = await response.json();
  return data.entities || [];
}

export async function searchRecords(
  apiBase: string,
  bearerToken: string,
  query: string
): Promise<NeotomaRecord[]> {
  const response = await fetch(normalizeApiUrl(apiBase, '/entities/query'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      limit: 500,
      search: query,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized - check your Bearer Token');
    } else if (response.status === 403) {
      throw new Error('Forbidden - invalid Bearer Token');
    } else {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }
  }

  const data = await response.json();
  return data.entities || [];
}

export async function fetchTypes(apiBase: string, bearerToken: string): Promise<string[]> {
  if (!bearerToken) {
    return [];
  }

  try {
    const response = await fetch(normalizeApiUrl(apiBase, '/types'), {
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
      },
    });

    if (!response.ok) {
      // If not OK, try to parse error or return empty
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json().catch(() => ({}));
        console.warn('Error fetching types:', errorData);
      }
      return [];
    }

    const data = await response.json();
    return data.types || [];
  } catch (error) {
    console.error('Error fetching types:', error);
    return [];
  }
}

export interface UploadFileResponse extends NeotomaRecord {
  row_records?: Array<{
    id: string;
    row_index: number;
    summary: string;
    type: string;
  }>;
}

export async function uploadFile(
  apiBase: string,
  bearerToken: string,
  file: File,
  options?: { csvRowRecords?: boolean }
): Promise<UploadFileResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (typeof options?.csvRowRecords === 'boolean') {
    formData.append('csv_row_records', String(options.csvRowRecords));
  }

  const response = await fetch(normalizeApiUrl(apiBase, '/upload_file'), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${bearerToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    let errorMessage = 'Upload failed';
    if (response.status === 401 || response.status === 403) {
      errorMessage = 'Unauthorized - check your Bearer Token';
    } else {
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

export type RecentRecordReference = {
  id: string;
  persisted?: boolean;
  payload?: Record<string, unknown>;
};

export async function sendChatMessage(
  apiBase: string,
  bearerToken: string,
  payload: {
    messages: Array<{ role: string; content: string }>;
    recentRecords?: RecentRecordReference[];
    localRecords?: NeotomaRecord[];
  }
): Promise<{
  message: { content: string };
  records_queried?: NeotomaRecord[];
  records_total_count?: number;
}> {
  const response = await fetch(normalizeApiUrl(apiBase, '/chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      messages: payload.messages,
      recent_records: payload.recentRecords?.length ? payload.recentRecords : undefined,
      local_records: payload.localRecords?.length ? payload.localRecords : undefined,
    }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Unauthorized - check your Bearer Token');
    } else {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }
  }

  return response.json();
}

export async function analyzeFile(
  apiBase: string,
  bearerToken: string,
  file: File
): Promise<{ type: string; properties: Record<string, unknown>; summary?: string }> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(normalizeApiUrl(apiBase, '/analyze_file'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = 'Analysis failed';
      if (response.status === 401 || response.status === 403) {
        errorMessage = 'Unauthorized - check your Bearer Token';
      } else {
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    // Handle network errors (connection refused, etc.)
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      throw new Error('Backend server is not available. Please ensure the backend is running.');
    }
    throw error;
  }
}

export async function generateEmbedding(
  apiBase: string,
  bearerToken: string,
  type: string,
  properties: Record<string, unknown>
): Promise<number[] | null> {
  try {
    const response = await fetch(normalizeApiUrl(apiBase, '/generate_embedding'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({ type, properties }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Unauthorized - check your Bearer Token');
      }
      if (response.status === 503) {
        // OpenAI not configured - not an error, just return null
        return null;
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding || null;
  } catch (error) {
    // Handle network errors gracefully
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      console.warn('[GenerateEmbedding] Backend server is not available');
      return null;
    }
    // For other errors, log and return null (non-blocking)
    console.warn('[GenerateEmbedding] Failed to generate embedding:', error instanceof Error ? error.message : error);
    return null;
  }
}

const ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

function buildStoragePath(filePath: string): string {
  const trimmed = filePath.trim().replace(/^\/+/, '');
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('files/')) {
    return trimmed;
  }
  return `files/${trimmed}`;
}

export async function getFileUrl(apiBase: string, bearerToken: string, filePath: string): Promise<string> {
  if (ABSOLUTE_URL_PATTERN.test(filePath)) {
    return filePath;
  }

  const storagePath = buildStoragePath(filePath);
  if (!storagePath) {
    return '';
  }

  const response = await fetch(
    `${normalizeApiUrl(apiBase, '/get_file_url')}?file_path=${encodeURIComponent(storagePath)}`,
    {
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
      },
    }
  );

  if (response.ok) {
    const data = await response.json();
    return data.url;
  }
  return '';
}

export interface RecordComparisonMetricsPayload {
  amount?: number;
  currency?: string;
  repetitions?: number;
  load?: number;
  duration_minutes?: number;
  date?: string;
  recipient?: string;
  merchant?: string;
  category?: string;
  location?: string;
  label?: string;
}

export interface RecordComparisonRecordPayload {
  id: string;
  type: string;
  summary?: string | null;
  properties?: Record<string, unknown>;
  metrics?: RecordComparisonMetricsPayload;
}

export interface RecordComparisonRequestPayload {
  new_record: RecordComparisonRecordPayload;
  similar_records: RecordComparisonRecordPayload[];
}

export interface RecordComparisonResponsePayload {
  analysis: string | null;
}

export async function generateRecordComparison(
  apiBase: string,
  bearerToken: string,
  payload: RecordComparisonRequestPayload
): Promise<RecordComparisonResponsePayload> {
  const response = await fetch(normalizeApiUrl(apiBase, '/record_comparison'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bearerToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Unauthorized - check your Bearer Token');
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

