import { supabase } from '../db.js';
import { buildPlaidItemContext, normalizePlaidError, syncTransactions } from '../integrations/plaid/client.js';
import {
  normalizeAccount,
  normalizeTransaction,
  type NormalizedPlaidRecord,
} from '../integrations/plaid/normalizers.js';
import {
  markExternalRecordRemoved,
  upsertExternalRecords,
  type UpsertResult,
} from './records.js';
import { config } from '../config.js';
import { generateEmbedding, getRecordText } from '../embeddings.js';

export interface PlaidItemRow {
  id: string;
  item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  access_token: string;
  environment: string;
  products: string[];
  country_codes: string[];
  cursor: string | null;
  webhook_status: string | null;
  last_successful_sync: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlaidSyncRunRow {
  id: string;
  plaid_item_id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  added_transactions: number;
  modified_transactions: number;
  removed_transactions: number;
  error: Record<string, unknown> | null;
  next_cursor: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertPlaidItemInput {
  itemId: string;
  accessToken: string;
  environment: string;
  products: string[];
  countryCodes: string[];
  institutionId?: string | null;
  institutionName?: string | null;
  webhookStatus?: string | null;
}

export interface PlaidSyncOptions {
  plaidItemId: string;
  forceFullSync?: boolean;
  generateEmbeddings?: boolean;
}

export interface PlaidSyncSummary {
  plaidItemId: string;
  addedTransactions: number;
  modifiedTransactions: number;
  removedTransactions: number;
  createdRecords: number;
  updatedRecords: number;
  removedRecordUpdates: number;
  nextCursor: string;
  lastSuccessfulSync: string;
}

export type SanitizedPlaidItem = Omit<PlaidItemRow, 'access_token'>;

function mapPlaidItem(row: any): PlaidItemRow {
  return {
    id: row.id,
    item_id: row.item_id,
    institution_id: row.institution_id,
    institution_name: row.institution_name,
    access_token: row.access_token,
    environment: row.environment,
    products: row.products ?? [],
    country_codes: row.country_codes ?? [],
    cursor: row.cursor ?? null,
    webhook_status: row.webhook_status ?? null,
    last_successful_sync: row.last_successful_sync ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapSyncRun(row: any): PlaidSyncRunRow {
  return {
    id: row.id,
    plaid_item_id: row.plaid_item_id,
    started_at: row.started_at,
    completed_at: row.completed_at,
    status: row.status,
    added_transactions: row.added_transactions ?? 0,
    modified_transactions: row.modified_transactions ?? 0,
    removed_transactions: row.removed_transactions ?? 0,
    error: row.error ?? null,
    next_cursor: row.next_cursor ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function redactPlaidItem(item: PlaidItemRow): SanitizedPlaidItem {
  const { access_token, ...rest } = item;
  void access_token;
  return rest;
}

export async function upsertPlaidItem(input: UpsertPlaidItemInput): Promise<PlaidItemRow> {
  const payload = {
    item_id: input.itemId,
    access_token: input.accessToken,
    environment: input.environment,
    products: input.products,
    country_codes: input.countryCodes,
    institution_id: input.institutionId ?? null,
    institution_name: input.institutionName ?? null,
    webhook_status: input.webhookStatus ?? null,
  };

  const { data, error } = await supabase
    .from('plaid_items')
    .upsert(payload, { onConflict: 'item_id' })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return mapPlaidItem(data);
}

export async function updatePlaidItemCursor(
  plaidItemId: string,
  cursor: string,
  lastSuccessfulSync: string,
  institutionId?: string | null,
  institutionName?: string | null
): Promise<void> {
  const { error } = await supabase
    .from('plaid_items')
    .update({
      cursor,
      last_successful_sync: lastSuccessfulSync,
      institution_id: institutionId ?? null,
      institution_name: institutionName ?? null,
    })
    .eq('id', plaidItemId);

  if (error) {
    throw error;
  }
}

export async function getPlaidItemById(plaidItemId: string): Promise<PlaidItemRow | null> {
  const { data, error } = await supabase
    .from('plaid_items')
    .select('*')
    .eq('id', plaidItemId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data ? mapPlaidItem(data) : null;
}

export async function getPlaidItemByItemId(itemId: string): Promise<PlaidItemRow | null> {
  const { data, error } = await supabase
    .from('plaid_items')
    .select('*')
    .eq('item_id', itemId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data ? mapPlaidItem(data) : null;
}

export async function listPlaidItems(): Promise<PlaidItemRow[]> {
  const { data, error } = await supabase
    .from('plaid_items')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map(mapPlaidItem);
}

export interface PlaidPreviewSummary {
  plaidItemId: string;
  itemId: string;
  institutionId: string | null;
  institutionName: string | null;
  lastSuccessfulSync: string | null;
  cursor: string | null;
  added: number;
  modified: number;
  removed: number;
  nextCursor: string;
}

// Preview counts of changes without mutating database state
export async function previewPlaidItemSync(plaidItemId: string): Promise<PlaidPreviewSummary> {
  const item = await getPlaidItemById(plaidItemId);
  if (!item) {
    throw new Error(`Plaid item ${plaidItemId} not found`);
  }
  const { added, modified, removed, nextCursor } = await syncTransactions({
    accessToken: item.access_token,
    cursor: item.cursor,
  });
  return {
    plaidItemId: item.id,
    itemId: item.item_id,
    institutionId: item.institution_id,
    institutionName: item.institution_name,
    lastSuccessfulSync: item.last_successful_sync,
    cursor: item.cursor,
    added: added.length,
    modified: modified.length,
    removed: removed.length,
    nextCursor,
  };
}

async function startSyncRun(plaidItemId: string): Promise<PlaidSyncRunRow> {
  const { data, error } = await supabase
    .from('plaid_sync_runs')
    .insert({
      plaid_item_id: plaidItemId,
      status: 'running',
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return mapSyncRun(data);
}

async function completeSyncRun(
  syncRunId: string,
  data: {
    addedTransactions: number;
    modifiedTransactions: number;
    removedTransactions: number;
    nextCursor: string;
    error?: unknown;
  }
): Promise<void> {
  const { error } = await supabase
    .from('plaid_sync_runs')
    .update({
      status: data.error ? 'failed' : 'success',
      completed_at: new Date().toISOString(),
      added_transactions: data.addedTransactions,
      modified_transactions: data.modifiedTransactions,
      removed_transactions: data.removedTransactions,
      next_cursor: data.nextCursor,
      error: data.error ?? null,
    })
    .eq('id', syncRunId);

  if (error) {
    throw error;
  }
}

function toExternalRecords(
  records: NormalizedPlaidRecord[],
  generateEmbedding: boolean
): { type: string; externalId: string; properties: Record<string, unknown>; generateEmbedding: boolean }[] {
  return records.map((record) => ({
    type: record.type,
    externalId: record.externalId,
    properties: record.properties,
    generateEmbedding,
  }));
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

export async function syncPlaidItem(options: PlaidSyncOptions): Promise<PlaidSyncSummary> {
  const plaidItem = await getPlaidItemById(options.plaidItemId);
  if (!plaidItem) {
    throw new Error(`Plaid item ${options.plaidItemId} not found`);
  }

  const syncRun = await startSyncRun(plaidItem.id);

  try {
    const { accounts, added, modified, removed, nextCursor } = await syncTransactions({
      accessToken: plaidItem.access_token,
      cursor: options.forceFullSync ? null : plaidItem.cursor,
    });

    const shouldGenerateEmbeddings = options.generateEmbeddings ?? Boolean(config.openaiApiKey);
    const embeddingBuilder = shouldGenerateEmbeddings && config.openaiApiKey
      ? async ({ type, properties }: { type: string; properties: Record<string, unknown> }) => {
          const embedding = await generateEmbedding(getRecordText(type, properties));
          return embedding && embedding.length > 0 ? embedding : null;
        }
      : undefined;

    const context = await buildPlaidItemContext(plaidItem.access_token, accounts);

    const accountLookup = new Map(context.accounts.map((account) => [account.account_id, account]));

    const accountRecords = context.accounts.map((account) =>
      normalizeAccount({
        plaidItemId: plaidItem.item_id,
        environment: plaidItem.environment,
        item: context.item,
        institution: context.institution,
        account,
      })
    );

    const transactionRecords = [...added, ...modified].map((transaction) =>
      normalizeTransaction({
        plaidItemId: plaidItem.item_id,
        environment: plaidItem.environment,
        item: context.item,
        institution: context.institution,
        accountLookup,
        transaction,
      })
    );

    const accountUpserts = await upsertExternalRecords(
      toExternalRecords(accountRecords, shouldGenerateEmbeddings),
      embeddingBuilder
    );
    const transactionUpserts = await upsertExternalRecords(
      toExternalRecords(transactionRecords, shouldGenerateEmbeddings),
      embeddingBuilder
    );

    let removedCount = 0;
    for (const removedTx of removed) {
      const externalId = `plaid:transaction:${removedTx.transaction_id}`;
      const updated = await markExternalRecordRemoved('transaction', externalId);
      if (updated) {
        removedCount += 1;
      }
    }

    const accountSummary = summarizeUpserts(accountUpserts);
    const transactionSummary = summarizeUpserts(transactionUpserts);
    const lastSuccessfulSync = new Date().toISOString();

    await updatePlaidItemCursor(
      plaidItem.id,
      nextCursor,
      lastSuccessfulSync,
      context.item.institution_id ?? null,
      context.institution?.name ?? plaidItem.institution_name ?? null
    );

    await completeSyncRun(syncRun.id, {
      addedTransactions: added.length,
      modifiedTransactions: modified.length,
      removedTransactions: removed.length,
      nextCursor,
      error: null,
    });

    return {
      plaidItemId: plaidItem.id,
      addedTransactions: added.length,
      modifiedTransactions: modified.length,
      removedTransactions: removed.length,
      createdRecords: accountSummary.created + transactionSummary.created,
      updatedRecords: accountSummary.updated + transactionSummary.updated,
      removedRecordUpdates: removedCount,
      nextCursor,
      lastSuccessfulSync,
    };
  } catch (error) {
    const normalizedError = normalizePlaidError(error) || {
      type: 'unknown_error',
      code: 'unknown',
      message: error instanceof Error ? error.message : 'Unknown Plaid sync error',
    };

    await completeSyncRun(syncRun.id, {
      addedTransactions: 0,
      modifiedTransactions: 0,
      removedTransactions: 0,
      nextCursor: plaidItem.cursor ?? '',
      error: normalizedError,
    });

    throw error;
  }
}

