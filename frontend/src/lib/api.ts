import type { NeotomaRecord } from '@/types/record';

export async function fetchRecords(apiBase: string, bearerToken: string): Promise<NeotomaRecord[]> {
  const response = await fetch(`${apiBase}/retrieve_records`, {
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

  return response.json();
}

export async function searchRecords(
  apiBase: string,
  bearerToken: string,
  query: string
): Promise<NeotomaRecord[]> {
  const response = await fetch(`${apiBase}/retrieve_records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      limit: 500,
      search: query.split(/\s+/),
      search_mode: 'both',
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

  return response.json();
}

export async function fetchTypes(apiBase: string, bearerToken: string): Promise<string[]> {
  if (!bearerToken) {
    return [];
  }

  try {
    const response = await fetch(`${apiBase}/types`, {
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

export async function uploadFile(
  apiBase: string,
  bearerToken: string,
  file: File
): Promise<NeotomaRecord> {
  const formData = new FormData();
  formData.append('file', file);

  // Use /api prefix for Vite proxy
  const apiUrl = apiBase.includes('/api') ? `${apiBase}/upload_file` : `${apiBase}/api/upload_file`;
  const response = await fetch(apiUrl, {
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

export async function sendChatMessage(
  apiBase: string,
  bearerToken: string,
  messages: Array<{ role: string; content: string }>
): Promise<{ message: { content: string }; records_queried?: NeotomaRecord[] }> {
  const response = await fetch(`${apiBase}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      messages,
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

export async function getFileUrl(
  apiBase: string,
  bearerToken: string,
  filePath: string
): Promise<string> {
  const response = await fetch(
    `${apiBase}/get_file_url?file_path=${encodeURIComponent(`files/${filePath}`)}`,
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

