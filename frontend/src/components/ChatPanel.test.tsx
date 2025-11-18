import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatPanel } from './ChatPanel';
import type { DatastoreAPI } from '@/hooks/useDatastore';
import type { LocalRecord } from '@/store/types';

const mockSendChatMessage = vi.fn();

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    settings: {
      apiBase: 'http://localhost:8080',
      bearerToken: 'settings-token',
    },
  }),
}));

vi.mock('@/hooks/useKeys', () => ({
  useKeys: () => ({
    bearerToken: '',
  }),
}));

vi.mock('@/lib/api', () => ({
  uploadFile: vi.fn(),
  sendChatMessage: (...args: any[]) => mockSendChatMessage(...args),
  analyzeFile: vi.fn(),
}));

vi.mock('@/utils/file_processing', () => ({
  processFileLocally: vi.fn(),
}));

const datastoreStub: DatastoreAPI = {
  initialized: true,
  error: null,
  getRecord: vi.fn(),
  putRecord: vi.fn(),
  queryRecords: vi.fn(),
  deleteRecord: vi.fn(),
  searchVectors: vi.fn(),
};

describe('ChatPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockSendChatMessage.mockReset();
  (datastoreStub.getRecord as unknown as vi.Mock).mockReset();
  (datastoreStub.putRecord as unknown as vi.Mock).mockReset();
  (datastoreStub.queryRecords as unknown as vi.Mock).mockReset();
  (datastoreStub.deleteRecord as unknown as vi.Mock).mockReset();
  (datastoreStub.searchVectors as unknown as vi.Mock).mockReset();
  // jsdom doesn't implement scrollIntoView; stub it for the test environment
  Element.prototype.scrollIntoView = vi.fn();
  });

  it('sends the latest user message to the backend', async () => {
    mockSendChatMessage.mockResolvedValue({
      message: { content: 'Ack' },
    });

    const user = userEvent.setup();
    render(<ChatPanel datastore={datastoreStub} />);

    const input = screen.getByPlaceholderText('Create, update or analyze records...');
    await user.type(input, 'show me its properties');

    const sendButton = screen.getByRole('button', { name: /send message/i });
    await user.click(sendButton);

    expect(mockSendChatMessage).toHaveBeenCalledTimes(1);
    expect(mockSendChatMessage).toHaveBeenCalledWith('http://localhost:8080', 'settings-token', {
      messages: [{ role: 'user', content: 'show me its properties' }],
      recentRecords: [],
    });
  });

it('includes inline recent record payload when user references a UUID', async () => {
  mockSendChatMessage.mockResolvedValue({
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

  (datastoreStub.getRecord as unknown as vi.Mock).mockResolvedValue(record);

  const user = userEvent.setup();
  render(<ChatPanel datastore={datastoreStub} />);

  const input = screen.getByPlaceholderText('Create, update or analyze records...');
  await user.type(input, `show record ${record.id}`);

  const sendButton = screen.getByRole('button', { name: /send message/i });
  await user.click(sendButton);

  expect(datastoreStub.getRecord).toHaveBeenCalledWith(record.id);

  const payload = mockSendChatMessage.mock.calls[0][2];
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
});


