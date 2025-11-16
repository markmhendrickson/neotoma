import { supabase, type NeotomaRecord } from '../db.js';
import { generateRecordSummary } from './summary.js';

export type MergeStrategy = 'replace' | 'merge';

export interface ExternalRecordInput {
  type: string;
  externalId: string;
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

function ensureExternalId(
  properties: Record<string, unknown>,
  externalId: string
): Record<string, unknown> {
  if (properties.external_id === externalId) {
    return properties;
  }

  return {
    ...properties,
    external_id: externalId,
  };
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
  const { type, externalId, mergeStrategy = 'replace' } = payload;
  const propertiesWithExternal = ensureExternalId(payload.properties, externalId);

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

  const { data: existing, error: fetchError } = await supabase
    .from('records')
    .select('id, properties, file_urls')
    .eq('type', type)
    .eq('properties->>external_id', externalId)
    .maybeSingle();

  if (fetchError && fetchError.code !== 'PGRST116') {
    throw fetchError;
  }

  if (existing) {
    const mergedProperties = ensureExternalId(
      mergeProperties(
        (existing.properties as Record<string, unknown>) ?? null,
        propertiesWithExternal,
        mergeStrategy
      ),
      externalId
    );

    const updatedFileUrls =
      payload.fileUrls !== undefined ? payload.fileUrls : (existing.file_urls as string[]) || [];

    const updateData: Record<string, unknown> = {
      properties: mergedProperties,
      file_urls: updatedFileUrls,
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
  externalId: string,
  removedAt: string = new Date().toISOString()
): Promise<NeotomaRecord | null> {
  const { data: existing, error: fetchError } = await supabase
    .from('records')
    .select('id, properties')
    .eq('type', type)
    .eq('properties->>external_id', externalId)
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

