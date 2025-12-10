import type { ConnectorSecrets, ExternalConnector } from '../../services/connectors.js';

export type ProviderCapability =
  | 'messages'
  | 'tasks'
  | 'calendar'
  | 'media'
  | 'email'
  | 'files'
  | 'notes'
  | 'records'
  | 'tickets';

export interface ProviderRecord {
  type: string;
  externalSource: string;
  externalId?: string;
  externalHash?: string;
  properties: Record<string, unknown>;
  fileUrls?: string[];
}

export interface RemovedProviderRecord {
  type: string;
  externalId?: string;
  externalHash?: string;
  removedAt?: string;
  externalSource?: string;
}

export type ProviderCursor = Record<string, unknown> | string | null;

export interface FetchUpdatesInput {
  connector: ExternalConnector;
  secrets: ConnectorSecrets | null;
  since?: string | null;
  cursor?: ProviderCursor;
  limit?: number;
}

export interface FetchUpdatesResult {
  records: ProviderRecord[];
  removed?: RemovedProviderRecord[];
  nextCursor?: ProviderCursor | null;
  hasMore?: boolean;
  raw?: unknown;
}

export interface ProviderClient {
  readonly id: string;
  readonly capabilities: readonly ProviderCapability[];
  readonly defaultRecordType: string;
  fetchUpdates(input: FetchUpdatesInput): Promise<FetchUpdatesResult>;
}

