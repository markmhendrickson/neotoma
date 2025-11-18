import { describe, expect, it, beforeEach, afterAll, vi } from 'vitest';
import { XProviderClient } from '../../providers/x.js';
import { InstagramProviderClient } from '../../providers/instagram.js';
import { FacebookProviderClient } from '../../providers/facebook.js';
import { GmailProviderClient } from '../../providers/gmail.js';
import { AsanaProviderClient } from '../../providers/asana.js';
import type { ExternalConnector } from '../../../services/connectors.js';

type FetchResponseShape = {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
};

const fetchMock = vi.fn<[], Promise<FetchResponseShape>>();

function mockResponse(data: unknown, ok = true): FetchResponseShape {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'ERROR',
    json: async () => data,
  };
}

function connector(overrides: Partial<ExternalConnector> = {}): ExternalConnector {
  return {
    id: 'connector-1',
    provider: overrides.provider ?? 'x',
    providerType: overrides.providerType ?? 'social',
    accountIdentifier: overrides.accountIdentifier ?? null,
    accountLabel: overrides.accountLabel ?? null,
    status: overrides.status ?? 'active',
    capabilities: overrides.capabilities ?? ['messages'],
    oauthScopes: overrides.oauthScopes ?? [],
    secretsEnvelope: null,
    metadata: overrides.metadata ?? {},
    syncCursor: overrides.syncCursor ?? null,
    lastSuccessfulSync: overrides.lastSuccessfulSync ?? null,
    lastError: overrides.lastError ?? null,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('Provider clients', () => {
  it('normalizes tweets from X', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        data: [
          {
            id: '1',
            text: 'hello world',
            created_at: '2024-01-01T00:00:00Z',
            public_metrics: { like_count: 1 },
            attachments: { media_keys: ['media-1'] },
          },
        ],
        includes: { media: [{ media_key: 'media-1', type: 'photo', url: 'https://example.com/img.jpg' }] },
        meta: { next_token: 'cursor-1' },
      })
    );

    const client = new XProviderClient();
    const result = await client.fetchUpdates({
      connector: connector({ metadata: { userId: 'user-1' } }),
      secrets: { accessToken: 'token' },
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0].externalSource).toBe('x');
    expect(result.records[0].fileUrls).toEqual(['https://example.com/img.jpg']);
    expect(result.nextCursor).toEqual({ pagination_token: 'cursor-1' });
  });

  it('normalizes Instagram media', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        data: [
          {
            id: 'media-1',
            media_type: 'IMAGE',
            media_url: 'https://cdn.example.com/photo.jpg',
            caption: 'Caption here',
            timestamp: '2024-01-02T00:00:00Z',
          },
        ],
        paging: { cursors: { after: 'next' } },
      })
    );

    const client = new InstagramProviderClient();
    const result = await client.fetchUpdates({
      connector: connector({ provider: 'instagram', metadata: { userId: 'me' } }),
      secrets: { accessToken: 'token' },
    });

    expect(result.records[0].properties).toMatchObject({
      caption: 'Caption here',
      media_type: 'IMAGE',
    });
    expect(result.nextCursor).toEqual({ after: 'next' });
  });

  it('normalizes Facebook posts', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        data: [
          {
            id: 'post-1',
            message: 'Post content',
            attachments: { data: [{ media: { image: { src: 'https://example.com/pic.png' } } }] },
          },
        ],
      })
    );

    const client = new FacebookProviderClient();
    const result = await client.fetchUpdates({
      connector: connector({ provider: 'facebook', metadata: { pageId: 'me' } }),
      secrets: { accessToken: 'token' },
    });

    expect(result.records[0].fileUrls).toEqual(['https://example.com/pic.png']);
  });

  it('normalizes Gmail messages', async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockResponse({
          messages: [
            { id: 'msg-1', threadId: 't-1' },
            { id: 'msg-2', threadId: 't-2' },
          ],
          nextPageToken: 'token-2',
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          id: 'msg-1',
          threadId: 't-1',
          payload: { headers: [{ name: 'Subject', value: 'Subject A' }, { name: 'From', value: 'a@example.com' }] },
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          id: 'msg-2',
          threadId: 't-2',
          payload: { headers: [{ name: 'Subject', value: 'Subject B' }, { name: 'From', value: 'b@example.com' }] },
        })
      );

    const client = new GmailProviderClient();
    const result = await client.fetchUpdates({
      connector: connector({ provider: 'gmail' }),
      secrets: { accessToken: 'token' },
    });

    expect(result.records.map((record) => record.properties.subject)).toEqual(['Subject A', 'Subject B']);
    expect(result.nextCursor).toBe('token-2');
  });

  it('normalizes Asana tasks', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        data: [
          {
            gid: 'task-1',
            name: 'Do work',
            completed: false,
            projects: [{ gid: 'proj-1', name: 'Project' }],
          },
        ],
        next_page: { offset: 'offset-token' },
      })
    );

    const client = new AsanaProviderClient();
    const result = await client.fetchUpdates({
      connector: connector({ provider: 'asana', metadata: { workspaceGid: 'workspace-1' } }),
      secrets: { accessToken: 'token' },
    });

    expect(result.records[0].properties).toMatchObject({
      name: 'Do work',
      completed: false,
    });
    expect(result.nextCursor).toBe('offset-token');
  });
});

