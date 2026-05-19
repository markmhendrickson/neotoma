import { buildApiUrl, get, getBlob, getText, post } from "../client";
import type { Source, SourceRelationshipsResponse, StoreRequest, StoreResponse } from "@/types/api";

export function listSources(params?: { search?: string; mime_type?: string; source_type?: string; limit?: number; offset?: number }) {
  return get<{ sources: Source[]; total?: number; limit?: number; offset?: number }>(
    "/sources",
    params as Record<string, string | number>,
  );
}

export function getSourceById(id: string) {
  return get<Source>(`/sources/${encodeURIComponent(id)}`);
}

export function getSourceRelationships(id: string, options?: { expand_entities?: boolean }) {
  const qs = options?.expand_entities ? "?expand_entities=true" : "";
  return get<SourceRelationshipsResponse>(`/sources/${encodeURIComponent(id)}/relationships${qs}`);
}

export function getSourceContentText(id: string) {
  return getText(`/sources/${encodeURIComponent(id)}/content`);
}

export function getSourceContentBlob(id: string) {
  return getBlob(`/sources/${encodeURIComponent(id)}/content`);
}

export function getSourceContentUrl(id: string) {
  return buildApiUrl(`/sources/${encodeURIComponent(id)}/content`);
}

export function getFileUrl(filePath: string, expiresIn?: number) {
  return get<{ url: string }>("/get_file_url", { file_path: filePath, ...(expiresIn ? { expires_in: expiresIn } : {}) });
}

export function store(data: StoreRequest) {
  return post<StoreResponse>("/store", data);
}

export function storeUnstructured(data: { file_content: string; mime_type: string; idempotency_key?: string; original_filename?: string }) {
  return post<StoreResponse["unstructured"]>("/store/unstructured", data);
}
