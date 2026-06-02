import { buildApiUrl, get, getBlob, getText, post, type FetchOptions } from "../client";
import type { Source, SourceRelationshipsResponse, StoreRequest, StoreResponse } from "@/types/api";

export function listSources(
  params?: { search?: string; mime_type?: string; source_type?: string; limit?: number; offset?: number },
  fetch?: FetchOptions,
) {
  return get<{ sources: Source[]; total?: number; limit?: number; offset?: number }>(
    "/sources",
    params as Record<string, string | number>,
    fetch,
  );
}

export function getSourceById(id: string, fetch?: FetchOptions) {
  return get<Source>(`/sources/${encodeURIComponent(id)}`, undefined, fetch);
}

export type SourceRelationshipsOptions = {
  expand_entities?: boolean;
  signal?: AbortSignal;
};

export function getSourceRelationships(id: string, options?: SourceRelationshipsOptions) {
  const qs = options?.expand_entities ? "?expand_entities=true" : "";
  return get<SourceRelationshipsResponse>(
    `/sources/${encodeURIComponent(id)}/relationships${qs}`,
    undefined,
    { signal: options?.signal },
  );
}

export function getSourceContentText(id: string, fetch?: FetchOptions) {
  return getText(`/sources/${encodeURIComponent(id)}/content`, undefined, fetch);
}

export function getSourceContentBlob(id: string, fetch?: FetchOptions) {
  return getBlob(`/sources/${encodeURIComponent(id)}/content`, undefined, fetch);
}

export function getSourceContentUrl(id: string) {
  return buildApiUrl(`/sources/${encodeURIComponent(id)}/content`);
}

export function getFileUrl(filePath: string, expiresIn?: number, fetch?: FetchOptions) {
  return get<{ url: string }>(
    "/get_file_url",
    { file_path: filePath, ...(expiresIn ? { expires_in: expiresIn } : {}) },
    fetch,
  );
}

export function store(data: StoreRequest, fetch?: FetchOptions) {
  return post<StoreResponse>("/store", data, fetch);
}

export function storeUnstructured(
  data: { file_content: string; mime_type: string; idempotency_key?: string; original_filename?: string },
  fetch?: FetchOptions,
) {
  return post<StoreResponse["unstructured"]>("/store/unstructured", data, fetch);
}
