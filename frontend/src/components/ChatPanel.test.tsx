import { describe, expect, it, beforeEach, vi, type MockInstance } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatPanel } from './ChatPanel';
import type { DatastoreAPI } from '@/hooks/useDatastore';
import type { LocalRecord } from '@/store/types';

const mocks = vi.hoisted(() => ({
  sendChatMessage: vi.fn(),
  uploadFile: vi.fn(),
  processFileLocally: vi.fn(),
}));

const settingsMock = {
  apiBase: 'http://localhost:8080',
  bearerToken: 'settings-token',
  cloudStorageEnabled: true,
  csvRowRecordsEnabled: true,
};

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    settings: settingsMock,
    saveSettings: vi.fn(),
    updateBearerToken: vi.fn(),
  }),
}));

vi.mock('@/hooks/useKeys', () => ({
  useKeys: () => ({
    bearerToken: '',
  }),
}));

vi.mock('@/lib/api', () => ({
  uploadFile: (...args: unknown[]) => mocks.uploadFile(...args),
  sendChatMessage: (...args: unknown[]) => mocks.sendChatMessage(...args),
}));

vi.mock('@/utils/file_processing', () => ({
  processFileLocally: (...args: unknown[]) => mocks.processFileLocally(...args),
}));

const datastoreStub: DatastoreAPI = {
  initialized: true,
  error: null,
  getRecord: vi.fn(),
  putRecord: vi.fn(),
  queryRecords: vi.fn(),
  countRecords: vi.fn(),
  deleteRecord: vi.fn(),
  searchVectors: vi.fn(),
};

describe('ChatPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    settingsMock.cloudStorageEnabled = true;
    settingsMock.bearerToken = 'settings-token';
    mocks.sendChatMessage.mockReset();
    mocks.uploadFile.mockReset();
    mocks.processFileLocally.mockReset();
    (datastoreStub.getRecord as unknown as MockInstance).mockReset();
    (datastoreStub.putRecord as unknown as MockInstance).mockReset();
    (datastoreStub.queryRecords as unknown as MockInstance).mockReset();
    (datastoreStub.countRecords as unknown as MockInstance).mockReset();
    (datastoreStub.deleteRecord as unknown as MockInstance).mockReset();
    (datastoreStub.searchVectors as unknown as MockInstance).mockReset();
    (datastoreStub.putRecord as unknown as MockInstance).mockResolvedValue(undefined);
    (datastoreStub.countRecords as unknown as MockInstance).mockResolvedValue(0);
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('sends the latest user message to the backend when API sync is enabled', async () => {
    mocks.sendChatMessage.mockResolvedValue({
      message: { content: 'Ack' },
    });

    const user = userEvent.setup();
    render(<ChatPanel datastore={datastoreStub} />);

    const input = screen.getByPlaceholderText('Ask about records...');
    await user.type(input, 'show me its properties');

    const sendButton = screen.getByRole('button', { name: /send message/i });
    await user.click(sendButton);

    expect(mocks.sendChatMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendChatMessage).toHaveBeenCalledWith('http://localhost:8080', 'settings-token', {
      messages: [{ role: 'user', content: 'show me its properties' }],
      recentRecords: [],
    });
  });

  it('includes inline recent record payload when user references a UUID', async () => {
    mocks.sendChatMessage.mockResolvedValue({
      message: { content: 'Ack' },
    });

    const record: LocalRecord = {
      id: 'b93ab9ef-7929-4101-a681-90c4a608feb6',
      type: 'ticket',
      summary: 'Electronic ticket',
      properties: { filename: 'ticket.pdf' },
      file_urls: ['local://ticket.pdf'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    (datastoreStub.getRecord as unknown as MockInstance).mockResolvedValue(record);

    const user = userEvent.setup();
    render(<ChatPanel datastore={datastoreStub} />);

    const input = screen.getByPlaceholderText('Ask about records...');
    await user.type(input, `show record ${record.id}`);

    const sendButton = screen.getByRole('button', { name: /send message/i });
    await user.click(sendButton);

    expect(datastoreStub.getRecord).toHaveBeenCalledWith(record.id);

    const payload = mocks.sendChatMessage.mock.calls[0][2];
    expect(payload.recentRecords).toEqual([
      expect.objectContaining({
        id: record.id,
        persisted: false,
        payload: expect.objectContaining({
          id: record.id,
          type: record.type,
          properties: record.properties,
        }),
      }),
    ]);
  });

  it('still sends chat requests when cloud storage is disabled', async () => {
    settingsMock.cloudStorageEnabled = false;
    const user = userEvent.setup();
    render(<ChatPanel datastore={datastoreStub} />);

    const input = screen.getByPlaceholderText('Ask about records...');
    await user.type(input, 'can you summarize my uploads?');

    const sendButton = screen.getByRole('button', { name: /send message/i });
    await user.click(sendButton);

    expect(mocks.sendChatMessage).toHaveBeenCalled();
  });

  it('processes file uploads locally without hitting the API when cloud storage is disabled', async () => {
    settingsMock.cloudStorageEnabled = false;
    mocks.processFileLocally.mockResolvedValue({
      primaryRecord: {
        id: 'local-1',
        type: 'note',
        summary: null,
        properties: {},
        file_urls: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      additionalRecords: [],
    });

    const { container } = render(<ChatPanel datastore={datastoreStub} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello world'], 'notes.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mocks.processFileLocally).toHaveBeenCalled();
    });
    expect(mocks.uploadFile).not.toHaveBeenCalled();
  });

  it('includes the generated summary in the assistant upload confirmation', async () => {
    settingsMock.cloudStorageEnabled = false;
    const summaryText = 'Logo variants from kickoff call';
    mocks.processFileLocally.mockResolvedValue({
      primaryRecord: {
        id: 'local-2',
        type: 'asset',
        summary: summaryText,
        properties: { filename: 'logo.jpeg' },
        file_urls: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      additionalRecords: [],
    });

    const { container } = render(<ChatPanel datastore={datastoreStub} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['binary'], 'logo.jpeg', { type: 'image/jpeg' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByText(
          /File "logo\.jpeg" was saved locally: Logo variants from kickoff call/
        )
      ).toBeInTheDocument();
    });
  });
});
