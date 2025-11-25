import { describe, expect, it, beforeEach, vi, type MockInstance } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatPanel } from './ChatPanel';
import type { DatastoreAPI } from '@/hooks/useDatastore';
import type { LocalRecord } from '@/store/types';
import type { NeotomaRecord } from '@/types/record';

const mocks = vi.hoisted(() => ({
  sendChatMessage: vi.fn(),
  uploadFile: vi.fn(),
  processFileLocally: vi.fn(),
  analyzeFile: vi.fn(),
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
  analyzeFile: (...args: unknown[]) => mocks.analyzeFile(...args),
}));

vi.mock('@/utils/file_processing', () => ({
  processFileLocally: (...args: unknown[]) => mocks.processFileLocally(...args),
}));

const toNeotomaRecord = (record: LocalRecord): NeotomaRecord => ({
  id: record.id,
  type: record.type,
  summary: record.summary ?? null,
  properties: record.properties,
  file_urls: record.file_urls ?? [],
  created_at: record.created_at,
  updated_at: record.updated_at,
  _status: 'Ready',
});

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
    (datastoreStub.queryRecords as unknown as MockInstance).mockResolvedValue([]);
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
    // Use a query that won't be intercepted by local count logic
    await user.type(input, 'tell me about the data');

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

  it('confirms csv uploads that only create row records', async () => {
    settingsMock.cloudStorageEnabled = false;
    mocks.processFileLocally.mockResolvedValue({
      primaryRecord: null,
      additionalRecords: [
        {
          id: 'row-1',
          type: 'dataset_row',
          summary: 'Row 1 summary',
          properties: {},
          file_urls: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'row-2',
          type: 'dataset_row',
          summary: 'Row 2 summary',
          properties: {},
          file_urls: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });

    const { container } = render(<ChatPanel datastore={datastoreStub} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['col1,col2\n1,2'], 'data.csv', { type: 'text/csv' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByText(/File "data\.csv" was saved locally: Created 2 row records\./)
      ).toBeInTheDocument();
    });
  });

  it('counts only filtered local records when search query is active', async () => {
    settingsMock.cloudStorageEnabled = false;
    const matchingRecord: LocalRecord = {
      id: 'match-1',
      type: 'exercise',
      summary: 'Shoulder press set',
      properties: { movement: 'shoulder press' },
      file_urls: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const nonMatchingRecord: LocalRecord = {
      id: 'other-1',
      type: 'exercise',
      summary: 'Bench press',
      properties: { movement: 'bench press' },
      file_urls: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    (datastoreStub.queryRecords as unknown as MockInstance).mockResolvedValue([
      matchingRecord,
      { ...matchingRecord, id: 'match-2' },
      nonMatchingRecord,
    ]);

    const user = userEvent.setup();
    render(
      <ChatPanel
        datastore={datastoreStub}
        activeSearchQuery="shoulder press"
        allRecords={[
          toNeotomaRecord(matchingRecord),
          toNeotomaRecord({ ...matchingRecord, id: 'match-2' }),
          toNeotomaRecord(nonMatchingRecord),
        ]}
      />
    );

    const input = screen.getByPlaceholderText('Ask about records...');
    await user.type(input, 'how many records are there?');

    const sendButton = screen.getByRole('button', { name: /send message/i });
    await user.click(sendButton);

    await screen.findByText(/Found 2 records/i);
    expect(datastoreStub.countRecords).not.toHaveBeenCalled();
    expect(datastoreStub.queryRecords).toHaveBeenCalled();
  });

  it('counts only filtered local records when type filter is active', async () => {
    settingsMock.cloudStorageEnabled = false;
    const exerciseRecord: LocalRecord = {
      id: 'ex-1',
      type: 'exercise',
      summary: 'Shoulder press set',
      properties: {},
      file_urls: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const otherRecord: LocalRecord = {
      ...exerciseRecord,
      id: 'note-1',
      type: 'note',
    };

    (datastoreStub.queryRecords as unknown as MockInstance).mockResolvedValue([
      exerciseRecord,
      { ...exerciseRecord, id: 'ex-2' },
      otherRecord,
    ]);

    const user = userEvent.setup();
    render(
      <ChatPanel
        datastore={datastoreStub}
        activeTypeFilter="exercise"
        allRecords={[
          toNeotomaRecord(exerciseRecord),
          toNeotomaRecord({ ...exerciseRecord, id: 'ex-2' }),
          toNeotomaRecord(otherRecord),
        ]}
      />
    );

    const input = screen.getByPlaceholderText('Ask about records...');
    await user.type(input, 'how many records are there?');

    const sendButton = screen.getByRole('button', { name: /send message/i });
    await user.click(sendButton);

    await screen.findByText(/Found 2 records/i);
    expect(datastoreStub.countRecords).not.toHaveBeenCalled();
    expect(datastoreStub.queryRecords).toHaveBeenCalledWith({ type: 'exercise' });
  });

  it('falls back to datastore queries when cached records are unavailable', async () => {
    settingsMock.cloudStorageEnabled = false;
    const matchingRecord: LocalRecord = {
      id: 'match-1',
      type: 'exercise',
      summary: 'Shoulder press set',
      properties: { movement: 'shoulder press' },
      file_urls: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    (datastoreStub.queryRecords as unknown as MockInstance).mockResolvedValue([
      matchingRecord,
      { ...matchingRecord, id: 'match-2' },
    ]);

    const user = userEvent.setup();
    render(
      <ChatPanel
        datastore={datastoreStub}
        activeSearchQuery="shoulder press"
        activeTypeFilter="exercise"
      />
    );

    const input = screen.getByPlaceholderText('Ask about records...');
    await user.type(input, 'how many records are there?');

    const sendButton = screen.getByRole('button', { name: /send message/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(datastoreStub.queryRecords).toHaveBeenCalledWith({ type: 'exercise' });
    });
    await screen.findByText(/Found 2 records/i);
  });

  it('counts queries referencing the search term even if "records" is omitted', async () => {
    settingsMock.cloudStorageEnabled = false;
    const matchingRecord: LocalRecord = {
      id: 'up-1',
      type: 'exercise',
      summary: 'Push-ups supinated',
      properties: { movement: 'Push-ups', notes: 'supinated grip' },
      file_urls: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const user = userEvent.setup();
    render(
      <ChatPanel
        datastore={datastoreStub}
        activeSearchQuery="up"
        allRecords={[
          toNeotomaRecord(matchingRecord),
          toNeotomaRecord({ ...matchingRecord, id: 'up-2' }),
          toNeotomaRecord({ ...matchingRecord, id: 'up-3' }),
        ]}
      />
    );

    const input = screen.getByPlaceholderText('Ask about records...');
    await user.type(input, 'how many with "up" in the exercise value?');

    const sendButton = screen.getByRole('button', { name: /send message/i });
    await user.click(sendButton);

    await screen.findByText(/There are currently/i);
    expect(mocks.sendChatMessage).not.toHaveBeenCalled();
  });

  it('counts keyword queries even when table filters are inactive', async () => {
    settingsMock.cloudStorageEnabled = false;
    const matchingRecord: LocalRecord = {
      id: 'keyword-1',
      type: 'exercise',
      summary: 'Sit-ups to failure',
      properties: { movement: 'Sit-ups' },
      file_urls: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    (datastoreStub.queryRecords as unknown as MockInstance).mockResolvedValue([
      matchingRecord,
      { ...matchingRecord, id: 'keyword-2' },
    ]);

    const user = userEvent.setup();
    render(<ChatPanel datastore={datastoreStub} />);

    const input = screen.getByPlaceholderText('Ask about records...');
    await user.type(input, 'How many records with "sit" anywhere?');

    const sendButton = screen.getByRole('button', { name: /send message/i });
    await user.click(sendButton);

    await screen.findByText(/There are currently/i);
    expect(datastoreStub.queryRecords).toHaveBeenCalled();
    expect(mocks.sendChatMessage).not.toHaveBeenCalled();
  });
});
