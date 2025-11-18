import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { describe, it, beforeEach, expect, vi } from 'vitest';
import type { NeotomaRecord } from '@/types/record';
import { RecordDetailsPanel } from './RecordDetailsPanel';

const mocks = vi.hoisted(() => ({
  mockGetFileUrl: vi.fn(),
  mockToast: vi.fn(),
  mockCreateLocalFileObjectUrl: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  getFileUrl: mocks.mockGetFileUrl,
}));

const settingsMock = {
  apiBase: 'http://localhost:8080',
  bearerToken: 'test-token',
  apiSyncEnabled: true,
  csvRowRecordsEnabled: true,
};

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    settings: settingsMock,
    saveSettings: vi.fn(),
    updateBearerToken: vi.fn(),
  }),
}));

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: mocks.mockToast,
  }),
}));

vi.mock('@/utils/local_files', () => ({
  createLocalFileObjectUrl: mocks.mockCreateLocalFileObjectUrl,
  isLocalFilePath: (value: string) => value.startsWith('local://'),
}));

const baseRecord: NeotomaRecord = {
  id: 'rec_1',
  type: 'note',
  summary: 'Example record',
  properties: { title: 'Example' },
  file_urls: [],
  created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  updated_at: new Date('2024-01-02T00:00:00Z').toISOString(),
  embedding: null,
  _status: 'Ready',
};

let windowOpenSpy: ReturnType<typeof vi.spyOn>;

describe('RecordDetailsPanel file handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    settingsMock.apiBase = 'http://localhost:8080';
    settingsMock.bearerToken = 'test-token';
    windowOpenSpy = vi.spyOn(window, 'open').mockReturnValue(null);
  });

  it('opens signed Supabase file URLs when clicking the Open button', async () => {
    mocks.mockGetFileUrl.mockResolvedValueOnce('https://signed.example.com/file.pdf');

    render(<RecordDetailsPanel record={{ ...baseRecord, file_urls: ['abc/file.pdf'] }} onClose={() => {}} />);

    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'Open file abc/file.pdf' });
    await user.click(button);

    expect(mocks.mockGetFileUrl).toHaveBeenCalledWith('http://localhost:8080', 'test-token', 'abc/file.pdf');
    await waitFor(() =>
      expect(windowOpenSpy).toHaveBeenCalledWith('https://signed.example.com/file.pdf', '_blank', 'noopener,noreferrer')
    );
  });

  it('opens absolute URLs without requesting a signed URL', async () => {
    render(
      <RecordDetailsPanel
        record={{ ...baseRecord, file_urls: ['https://cdn.example.com/public/roadmap.png'] }}
        onClose={() => {}}
      />
    );

    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'Open file https://cdn.example.com/public/roadmap.png' });
    await user.click(button);

    expect(mocks.mockGetFileUrl).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://cdn.example.com/public/roadmap.png',
        '_blank',
        'noopener,noreferrer'
      )
    );
  });

  it('shows a toast if API credentials are missing for stored files', async () => {
    settingsMock.apiBase = '';
    settingsMock.bearerToken = '';

    render(<RecordDetailsPanel record={{ ...baseRecord, file_urls: ['abc/file.pdf'] }} onClose={() => {}} />);

    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'Open file abc/file.pdf' });
    await user.click(button);

    expect(windowOpenSpy).not.toHaveBeenCalled();
    expect(mocks.mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Unable to open file',
        description: 'Set API base URL and Bearer Token to open stored files.',
      })
    );
  });

  it('opens local OPFS files via helper and respects mime metadata', async () => {
    const revoke = vi.fn();
    mocks.mockCreateLocalFileObjectUrl.mockResolvedValueOnce({
      url: 'blob:local',
      revoke,
    });

    render(
      <RecordDetailsPanel
        record={{
          ...baseRecord,
          properties: { ...baseRecord.properties, mime_type: 'application/pdf' },
          file_urls: ['local://rec_1/1099.pdf'],
        }}
        onClose={() => {}}
      />
    );

    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'Open file local://rec_1/1099.pdf' });
    await user.click(button);

    expect(mocks.mockCreateLocalFileObjectUrl).toHaveBeenCalledWith('local://rec_1/1099.pdf', {
      mimeType: 'application/pdf',
    });
    await waitFor(() =>
      expect(windowOpenSpy).toHaveBeenCalledWith('blob:local', '_blank', 'noopener,noreferrer')
    );
  });

  it('renders iframe preview when clicking Preview on a local file', async () => {
    mocks.mockCreateLocalFileObjectUrl.mockResolvedValueOnce({
      url: 'blob:preview',
      revoke: vi.fn(),
    });

    render(
      <RecordDetailsPanel
        record={{
          ...baseRecord,
          file_urls: ['local://rec_1/preview.pdf'],
        }}
        onClose={() => {}}
      />
    );

    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'Preview file local://rec_1/preview.pdf' });
    await user.click(button);

    const previewElement = await screen.findByTitle('File preview for local://rec_1/preview.pdf');
    expect(previewElement).toHaveAttribute('data', 'blob:preview');
    expect(previewElement.tagName).toBe('OBJECT');
  });

  it('allows toggling nested properties in the JSON viewer', async () => {
    render(
      <RecordDetailsPanel
        record={{
          ...baseRecord,
          properties: {
            level1: {
              level2: 'deep-value',
            },
          },
        }}
        onClose={() => {}}
      />
    );

    const user = userEvent.setup();
    expect(screen.getByText(/deep-value/)).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Toggle level1' });
    await user.click(toggle);
    expect(screen.queryByText(/deep-value/)).not.toBeInTheDocument();
  });
});


