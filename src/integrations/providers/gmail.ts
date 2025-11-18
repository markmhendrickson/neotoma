import { RestProviderClient } from './base.js';
import type { FetchUpdatesInput, FetchUpdatesResult, ProviderRecord } from './types.js';

interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate?: string;
  snippet?: string;
  payload?: {
    headers?: { name: string; value: string }[];
    parts?: Array<{ filename?: string; mimeType?: string }>;
  };
}

export class GmailProviderClient extends RestProviderClient {
  readonly id = 'gmail';
  readonly capabilities = ['email'] as const;
  readonly defaultRecordType = 'message';

  async fetchUpdates(input: FetchUpdatesInput): Promise<FetchUpdatesResult> {
    const token = this.requireAccessToken(input.secrets);
    const limit = Math.min(input.limit ?? 50, 100);

    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    url.searchParams.set('maxResults', `${limit}`);
    url.searchParams.set('format', 'metadata');
    if (input.since) {
      const seconds = Math.floor(new Date(input.since).getTime() / 1000);
      url.searchParams.set('q', `after:${seconds}`);
    }
    if (typeof input.cursor === 'string') {
      url.searchParams.set('pageToken', input.cursor);
    }

    const headers = {
      Authorization: `Bearer ${token}`,
    };

    const listResponse = await this.fetchJson<GmailListResponse>(url.toString(), { headers });

    const records: ProviderRecord[] = [];
    for (const entry of listResponse.messages ?? []) {
      const message = await this.fetchJson<GmailMessage>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${entry.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Bcc`,
        { headers }
      );
      const props = this.normalizeMessage(message);
      records.push(props);
    }

    return {
      records: this.mapRecordsWithSource(records),
      nextCursor: listResponse.nextPageToken ?? null,
      hasMore: Boolean(listResponse.nextPageToken),
      raw: listResponse,
    };
  }

  private normalizeMessage(message: GmailMessage): ProviderRecord {
    const headers = Object.fromEntries(
      (message.payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value])
    );
    return {
      type: 'message',
      externalSource: 'gmail',
      externalId: message.id,
      properties: {
        provider: 'gmail',
        message_id: message.id,
        thread_id: message.threadId,
        subject: headers.subject ?? '',
        from: headers.from ?? '',
        to: headers.to ?? '',
        cc: headers.cc ?? '',
        bcc: headers.bcc ?? '',
        snippet: message.snippet ?? '',
        label_ids: message.labelIds ?? [],
        internal_date: message.internalDate ?? null,
        attachments: (message.payload?.parts ?? [])
          .filter((part) => part.filename)
          .map((part) => ({
            filename: part.filename,
            mime_type: part.mimeType,
          })),
      },
    };
  }
}

