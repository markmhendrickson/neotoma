import { config } from '../config.js';
import { generateEmbedding, getRecordText } from '../embeddings.js';
import {
  getConnectorById,
  getConnectorSecrets,
  listConnectors,
  startExternalSyncRun,
  completeExternalSyncRun,
  updateConnector,
  type ExternalConnector,
} from './connectors.js';
import { getProviderClient } from '../integrations/providers/index.js';
import type { ProviderCursor, ProviderRecord } from '../integrations/providers/types.js';
import {
  markExternalRecordRemoved,
  upsertExternalRecords,
  type UpsertResult,
} from './records.js';

export interface ConnectorSyncResult {
  connectorId: string;
  provider: string;
  syncType: 'initial' | 'incremental' | string;
  created: number;
  updated: number;
  removed: number;
  pages: number;
  cursor: ProviderCursor | null;
}

export interface RunConnectorSyncOptions {
  connectorId: string;
  syncType?: 'initial' | 'incremental';
  limit?: number;
  maxPages?: number;
  sinceOverride?: string | null;
  generateEmbeddings?: boolean;
}

export interface RunAllConnectorsOptions {
  provider?: string;
  status?: 'active' | 'paused' | 'error';
  limitPerConnector?: number;
  maxPages?: number;
}

export async function runConnectorSync(options: RunConnectorSyncOptions): Promise<ConnectorSyncResult> {
  const connector = await getConnectorById(options.connectorId);
  if (!connector) {
    throw new Error(`Connector ${options.connectorId} not found`);
  }

  const secrets = await getConnectorSecrets(connector.id);
  const providerClient = getProviderClient(connector.provider);
  const syncType =
    options.syncType ?? (connector.lastSuccessfulSync ? ('incremental' as const) : ('initial' as const));

  const syncRun = await startExternalSyncRun({
    connectorId: connector.id,
    syncType,
  });

  const shouldGenerateEmbeddings =
    options.generateEmbeddings ?? Boolean(config.openaiApiKey && providerClient.capabilities.includes('messages'));

  const embeddingBuilder =
    shouldGenerateEmbeddings && config.openaiApiKey
      ? async ({ type, properties }: { type: string; properties: Record<string, unknown> }) => {
          const embedding = await generateEmbedding(getRecordText(type, properties));
          return embedding && embedding.length > 0 ? embedding : null;
        }
      : undefined;

  let cursor: ProviderCursor | null = connector.syncCursor ?? null;
  let since = options.sinceOverride ?? connector.lastSuccessfulSync ?? null;
  let created = 0;
  let updated = 0;
  let removed = 0;
  let pages = 0;

  try {
    const maxPages = options.maxPages ?? 10;
    const limit = options.limit ?? 100;

    while (pages < maxPages) {
      const page = await providerClient.fetchUpdates({
        connector,
        secrets,
        cursor,
        since,
        limit,
      });

      pages += 1;

      if (page.records.length > 0) {
        const upsertPayloads = page.records.map((record) => toExternalRecordPayload(record, connector));
        const upsertResults: UpsertResult[] = await upsertExternalRecords(upsertPayloads, embeddingBuilder);
        const summary = summarizeUpserts(upsertResults);
        created += summary.created;
        updated += summary.updated;
      }

      if (page.removed && page.removed.length > 0) {
        for (const removedRecord of page.removed) {
          const identifier = removedRecord.externalId
            ? { externalId: removedRecord.externalId }
            : { externalHash: removedRecord.externalHash };
          if (!identifier.externalId && !identifier.externalHash) {
            continue;
          }
          const removalType = removedRecord.type ?? providerClient.defaultRecordType;
          const removalSource = removedRecord.externalSource ?? providerClient.id;
          const updatedRecord = await markExternalRecordRemoved(
            removalType,
            removalSource,
            identifier,
            removedRecord.removedAt
          );
          if (updatedRecord) {
            removed += 1;
          }
        }
      }

      cursor = page.nextCursor ?? null;

      if (!page.hasMore || !cursor) {
        break;
      }
    }

    await updateConnector(connector.id, {
      syncCursor: cursor,
      lastSuccessfulSync: new Date().toISOString(),
      lastError: null,
    });

    await completeExternalSyncRun({
      syncRunId: syncRun.id,
      status: 'success',
      stats: {
        created,
        updated,
        removed,
        pages,
      },
      cursor: cursor ?? null,
    });

    return {
      connectorId: connector.id,
      provider: connector.provider,
      syncType,
      created,
      updated,
      removed,
      pages,
      cursor,
    };
  } catch (error) {
    await updateConnector(connector.id, {
      lastError: {
        message: (error as Error).message,
      },
    });

    await completeExternalSyncRun({
      syncRunId: syncRun.id,
      status: 'failed',
      stats: {
        created,
        updated,
        removed,
        pages,
      },
      cursor: cursor ?? null,
      error: {
        message: (error as Error).message,
      },
    });

    throw error;
  }
}

export async function runAllConnectorSyncs(
  options: RunAllConnectorsOptions = {}
): Promise<ConnectorSyncResult[]> {
  const connectors = await listConnectors({
    provider: options.provider,
    status: options.status,
  });

  const results: ConnectorSyncResult[] = [];
  for (const connector of connectors) {
    if (connector.status !== 'active') {
      continue;
    }
    const result = await runConnectorSync({
      connectorId: connector.id,
      limit: options.limitPerConnector,
      maxPages: options.maxPages,
    });
    results.push(result);
  }

  return results;
}

function summarizeUpserts(results: UpsertResult[]): { created: number; updated: number } {
  return results.reduce(
    (acc, result) => {
      if (result.created) {
        acc.created += 1;
      } else {
        acc.updated += 1;
      }
      return acc;
    },
    { created: 0, updated: 0 }
  );
}

function toExternalRecordPayload(record: ProviderRecord, connector: ExternalConnector) {
  const source = record.externalSource ?? connector.provider;
  return {
    type: record.type,
    externalSource: source,
    externalId: record.externalId,
    externalHash: record.externalHash,
    properties: {
      ...record.properties,
      external_source: source,
      connector_id: connector.id,
    },
    fileUrls: record.fileUrls,
    mergeStrategy: 'merge' as const,
    generateEmbedding: Boolean(record.properties?.text || record.properties?.body || record.properties?.name),
  };
}

