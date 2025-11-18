import { supabase, type NeotomaRecord } from '../db.js';
import { generateRecordSummary } from './summary.js';

export type MergeStrategy = 'replace' | 'merge';

export interface ExternalRecordInput {
  type: string;
  externalSource: string;
  externalId?: string;
  externalHash?: string;
  properties: Record<string, unknown>;
  fileUrls?: string[];
  mergeStrategy?: MergeStrategy;
  generateEmbedding?: boolean;
}

export interface UpsertResult {
  id: string;
  type: string;
  created: boolean;
  record: NeotomaRecord;
}

function ensureExternalIdentifiers(
  properties: Record<string, unknown>,
  externalSource: string,
  externalId?: string,
  externalHash?: string
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...properties,
    external_source: externalSource,
  };
  if (externalId) {
    next.external_id = externalId;
  }
  if (externalHash) {
    next.external_hash = externalHash;
  }
  return next;
}

function mergeProperties(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown>,
  strategy: MergeStrategy
): Record<string, unknown> {
  if (strategy === 'merge' && existing) {
    return {
      ...existing,
      ...incoming,
    };
  }
  return incoming;
}

export async function upsertExternalRecord(
  payload: ExternalRecordInput,
  embeddingBuilder?: (record: { type: string; properties: Record<string, unknown> }) => Promise<number[] | null>
): Promise<UpsertResult> {
  const { type, externalSource, externalId, externalHash, mergeStrategy = 'replace' } = payload;

  if (!externalSource) {
    throw new Error('externalSource is required for external record upserts');
  }
  if (!externalId && !externalHash) {
    throw new Error('externalId or externalHash is required for external record upserts');
  }

  const propertiesWithExternal = ensureExternalIdentifiers(
    payload.properties,
    externalSource,
    externalId,
    externalHash
  );

  const maybeBuildEmbedding = async (recordType: string, recordProps: Record<string, unknown>) => {
    if (!payload.generateEmbedding || !embeddingBuilder) return null;
    try {
      const built = await embeddingBuilder({ type: recordType, properties: recordProps });
      return built && built.length > 0 ? built : null;
    } catch (error) {
      console.warn('Failed to build embedding for external record', { type: recordType, externalId, error });
      return null;
    }
  };

  let recordQuery = supabase
    .from('records')
    .select('id, properties, file_urls')
    .eq('external_source', externalSource);

  if (externalId) {
    recordQuery = recordQuery.eq('external_id', externalId);
  } else {
    recordQuery = recordQuery.eq('external_hash', externalHash);
  }

  const { data: existing, error: fetchError } = await recordQuery.maybeSingle();

  if (fetchError && fetchError.code !== 'PGRST116') {
    throw fetchError;
  }

  if (existing) {
    const mergedProperties = ensureExternalIdentifiers(
      mergeProperties(
        (existing.properties as Record<string, unknown>) ?? null,
        propertiesWithExternal,
        mergeStrategy
      ),
      externalSource,
      externalId,
      externalHash
    );

    const updatedFileUrls =
      payload.fileUrls !== undefined ? payload.fileUrls : (existing.file_urls as string[]) || [];

    const updateData: Record<string, unknown> = {
      properties: mergedProperties,
      file_urls: updatedFileUrls,
      external_source: externalSource,
      external_id: externalId ?? null,
      external_hash: externalHash ?? null,
      updated_at: new Date().toISOString(),
    };

    const embedding = await maybeBuildEmbedding(type, mergedProperties);
    if (embedding) {
      updateData.embedding = embedding;
    }

    // Generate summary
    const summary = await generateRecordSummary(type, mergedProperties, updatedFileUrls);
    if (summary) {
      updateData.summary = summary;
    }

    const { data, error } = await supabase
      .from('records')
      .update(updateData)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      id: data.id,
      type: data.type,
      created: false,
      record: data as NeotomaRecord,
    };
  }

  const insertPayload: Record<string, unknown> = {
    type,
    properties: propertiesWithExternal,
    file_urls: payload.fileUrls ?? [],
    external_source: externalSource,
    external_id: externalId ?? null,
    external_hash: externalHash ?? null,
  };

  const insertEmbedding = await maybeBuildEmbedding(type, propertiesWithExternal);
  if (insertEmbedding) {
    insertPayload.embedding = insertEmbedding;
  }

  // Generate summary
  const summary = await generateRecordSummary(type, propertiesWithExternal, payload.fileUrls ?? []);
  if (summary) {
    insertPayload.summary = summary;
  }

  const { data, error } = await supabase
    .from('records')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    type: data.type,
    created: true,
    record: data as NeotomaRecord,
  };
}

export async function upsertExternalRecords(
  records: ExternalRecordInput[],
  embeddingBuilder?: (record: { type: string; properties: Record<string, unknown> }) => Promise<number[] | null>
): Promise<UpsertResult[]> {
  const results: UpsertResult[] = [];
  for (const record of records) {
    const upserted = await upsertExternalRecord(record, embeddingBuilder);
    results.push(upserted);
  }
  return results;
}

export async function markExternalRecordRemoved(
  type: string,
  externalSource: string,
  identifiers: { externalId?: string; externalHash?: string },
  removedAt: string = new Date().toISOString()
): Promise<NeotomaRecord | null> {
  if (!identifiers.externalId && !identifiers.externalHash) {
    throw new Error('externalId or externalHash is required to mark a record removed');
  }

  const { data: existing, error: fetchError } = await supabase
    .from('records')
    .select('id, properties')
    .eq('type', type)
    .eq('external_source', externalSource)
    .match(
      identifiers.externalId
        ? { external_id: identifiers.externalId }
        : { external_hash: identifiers.externalHash }
    )
    .maybeSingle();

  if (fetchError && fetchError.code !== 'PGRST116') {
    throw fetchError;
  }

  if (!existing) {
    return null;
  }

  const currentProps = (existing.properties as Record<string, unknown>) || {};
  const updatedProps = {
    ...currentProps,
    status: 'removed',
    removed_at: removedAt,
  };

  const { data, error } = await supabase
    .from('records')
    .update({
      properties: updatedProps,
      updated_at: removedAt,
    })
    .eq('id', existing.id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as NeotomaRecord;
}

