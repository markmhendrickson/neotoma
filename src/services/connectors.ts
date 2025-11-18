import crypto from 'node:crypto';
import { supabase } from '../db.js';
import { config } from '../config.js';

export type ConnectorStatus = 'active' | 'paused' | 'error';

export interface ConnectorSecrets {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  [key: string]: unknown;
}

export interface ExternalConnector {
  id: string;
  provider: string;
  providerType: string;
  accountIdentifier: string | null;
  accountLabel: string | null;
  status: ConnectorStatus;
  capabilities: string[];
  oauthScopes: string[];
  secretsEnvelope: string | null;
  metadata: Record<string, unknown>;
  syncCursor: Record<string, unknown> | null;
  lastSuccessfulSync: string | null;
  lastError: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConnectorInput {
  provider: string;
  providerType: string;
  capabilities?: string[];
  oauthScopes?: string[];
  accountIdentifier?: string | null;
  accountLabel?: string | null;
  status?: ConnectorStatus;
  metadata?: Record<string, unknown>;
  secrets?: ConnectorSecrets | null;
  syncCursor?: Record<string, unknown> | null;
}

export interface UpdateConnectorInput {
  accountIdentifier?: string | null;
  accountLabel?: string | null;
  status?: ConnectorStatus;
  capabilities?: string[];
  oauthScopes?: string[];
  metadata?: Record<string, unknown>;
  syncCursor?: Record<string, unknown> | null;
  lastSuccessfulSync?: string | null;
  lastError?: Record<string, unknown> | null;
  secrets?: ConnectorSecrets | null;
}

export interface ExternalSyncRun {
  id: string;
  connectorId: string;
  syncType: 'initial' | 'incremental' | string;
  status: 'pending' | 'running' | 'success' | 'failed';
  startedAt: string;
  completedAt: string | null;
  stats: Record<string, unknown>;
  cursor: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  traceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StartSyncRunInput {
  connectorId: string;
  syncType?: 'initial' | 'incremental' | string;
  traceId?: string;
}

export interface CompleteSyncRunInput {
  syncRunId: string;
  status: 'success' | 'failed';
  stats?: Record<string, unknown>;
  cursor?: Record<string, unknown> | string | null;
  error?: Record<string, unknown> | null;
}

interface SecretsEnvelope {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

function mapConnector(row: any): ExternalConnector {
  return {
    id: row.id,
    provider: row.provider,
    providerType: row.provider_type,
    accountIdentifier: row.account_identifier ?? null,
    accountLabel: row.account_label ?? null,
    status: row.status ?? 'active',
    capabilities: row.capabilities ?? [],
    oauthScopes: row.oauth_scopes ?? [],
    secretsEnvelope: row.secrets_envelope ?? null,
    metadata: row.metadata ?? {},
    syncCursor: row.sync_cursor ?? null,
    lastSuccessfulSync: row.last_successful_sync ?? null,
    lastError: row.last_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSyncRun(row: any): ExternalSyncRun {
  return {
    id: row.id,
    connectorId: row.connector_id,
    syncType: row.sync_type ?? 'incremental',
    status: row.status ?? 'pending',
    startedAt: row.started_at,
    completedAt: row.completed_at ?? null,
    stats: row.stats ?? {},
    cursor: row.cursor ?? null,
    error: row.error ?? null,
    traceId: row.trace_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

let cachedSecretKey: Buffer | null = null;

function getConnectorSecretKey(): Buffer {
  if (cachedSecretKey) {
    return cachedSecretKey;
  }

  const secret = config.connectorSecretKey;
  if (!secret || secret.length < 16) {
    throw new Error('CONNECTOR_SECRET_KEY must be defined and at least 16 characters long');
  }

  cachedSecretKey = crypto.createHash('sha256').update(secret).digest();
  return cachedSecretKey;
}

export function encryptConnectorSecrets(payload: ConnectorSecrets | null | undefined): string | null {
  if (!payload) {
    return null;
  }
  const key = getConnectorSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const envelope: SecretsEnvelope = {
    v: 1,
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
    data: ciphertext.toString('base64'),
  };

  return JSON.stringify(envelope);
}

export function decryptConnectorSecrets(envelope: string | null | undefined): ConnectorSecrets | null {
  if (!envelope) {
    return null;
  }
  const key = getConnectorSecretKey();
  let parsed: SecretsEnvelope;
  try {
    parsed = JSON.parse(envelope);
  } catch (error) {
    throw new Error('Failed to parse connector secrets envelope');
  }

  if (parsed.v !== 1) {
    throw new Error(`Unsupported connector secrets envelope version: ${parsed.v}`);
  }

  const iv = Buffer.from(parsed.iv, 'base64');
  const authTag = Buffer.from(parsed.tag, 'base64');
  const ciphertext = Buffer.from(parsed.data, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return JSON.parse(plaintext.toString('utf8'));
}

export async function createConnector(input: CreateConnectorInput): Promise<ExternalConnector> {
  const secretsEnvelope = encryptConnectorSecrets(input.secrets);

  const { data, error } = await supabase
    .from('external_connectors')
    .insert({
      provider: input.provider,
      provider_type: input.providerType,
      account_identifier: input.accountIdentifier ?? null,
      account_label: input.accountLabel ?? null,
      status: input.status ?? 'active',
      capabilities: input.capabilities ?? [],
      oauth_scopes: input.oauthScopes ?? [],
      secrets_envelope: secretsEnvelope,
      metadata: input.metadata ?? {},
      sync_cursor: input.syncCursor ?? null,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return mapConnector(data);
}

export async function updateConnector(
  connectorId: string,
  updates: UpdateConnectorInput
): Promise<ExternalConnector> {
  const payload: Record<string, unknown> = {};

  if ('accountIdentifier' in updates) payload.account_identifier = updates.accountIdentifier ?? null;
  if ('accountLabel' in updates) payload.account_label = updates.accountLabel ?? null;
  if ('status' in updates) payload.status = updates.status;
  if ('capabilities' in updates) payload.capabilities = updates.capabilities ?? [];
  if ('oauthScopes' in updates) payload.oauth_scopes = updates.oauthScopes ?? [];
  if ('metadata' in updates) payload.metadata = updates.metadata ?? {};
  if ('syncCursor' in updates) payload.sync_cursor = updates.syncCursor ?? null;
  if ('lastSuccessfulSync' in updates) payload.last_successful_sync = updates.lastSuccessfulSync ?? null;
  if ('lastError' in updates) payload.last_error = updates.lastError ?? null;
  if ('secrets' in updates) payload.secrets_envelope = encryptConnectorSecrets(updates.secrets);

  if (Object.keys(payload).length === 0) {
    const connector = await getConnectorById(connectorId);
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }
    return connector;
  }

  const { data, error } = await supabase
    .from('external_connectors')
    .update(payload)
    .eq('id', connectorId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return mapConnector(data);
}

export async function getConnectorById(connectorId: string): Promise<ExternalConnector | null> {
  const { data, error } = await supabase
    .from('external_connectors')
    .select('*')
    .eq('id', connectorId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data ? mapConnector(data) : null;
}

export async function listConnectors(filter?: {
  provider?: string;
  status?: ConnectorStatus;
}): Promise<ExternalConnector[]> {
  let query = supabase.from('external_connectors').select('*').order('created_at', { ascending: false });

  if (filter?.provider) {
    query = query.eq('provider', filter.provider);
  }
  if (filter?.status) {
    query = query.eq('status', filter.status);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapConnector);
}

export async function getConnectorSecrets(connectorId: string): Promise<ConnectorSecrets | null> {
  const connector = await getConnectorById(connectorId);
  if (!connector) {
    return null;
  }
  return decryptConnectorSecrets(connector.secretsEnvelope);
}

export async function saveConnectorSecrets(
  connectorId: string,
  secrets: ConnectorSecrets | null
): Promise<ExternalConnector> {
  return updateConnector(connectorId, { secrets });
}

export async function startExternalSyncRun(
  input: StartSyncRunInput
): Promise<ExternalSyncRun> {
  const { data, error } = await supabase
    .from('external_sync_runs')
    .insert({
      connector_id: input.connectorId,
      sync_type: input.syncType ?? 'incremental',
      status: 'running',
      trace_id: input.traceId ?? null,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return mapSyncRun(data);
}

export async function completeExternalSyncRun(
  input: CompleteSyncRunInput
): Promise<void> {
  const { error } = await supabase
    .from('external_sync_runs')
    .update({
      status: input.status,
      completed_at: new Date().toISOString(),
      stats: input.stats ?? {},
      cursor: input.cursor ?? null,
      error: input.error ?? null,
    })
    .eq('id', input.syncRunId);

  if (error) {
    throw error;
  }
}

