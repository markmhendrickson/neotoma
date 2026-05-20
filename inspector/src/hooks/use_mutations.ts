import { useMutation, useQueryClient } from "@tanstack/react-query";
import { mergeEntities, deleteEntity, restoreEntity } from "@/api/endpoints/entities";
import { createObservation } from "@/api/endpoints/observations";
import { store, storeUnstructured } from "@/api/endpoints/sources";
import { createRelationship, deleteRelationship, restoreRelationship } from "@/api/endpoints/relationships";
import { registerSchema, updateSchemaIncremental } from "@/api/endpoints/schemas";
import { correct } from "@/api/endpoints/corrections";
import type { StoreRequest } from "@/types/api";

export function useMergeEntities() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { from: string; to: string; reason?: string }) => mergeEntities(args.from, args.to, args.reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entities"] });
      qc.invalidateQueries({ queryKey: ["entity"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useDeleteEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; type: string; reason?: string }) => deleteEntity(args.id, args.type, args.reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entities"] });
      qc.invalidateQueries({ queryKey: ["entity"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useRestoreEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; type: string; reason?: string }) => restoreEntity(args.id, args.type, args.reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entities"] });
      qc.invalidateQueries({ queryKey: ["entity"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useCreateObservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createObservation(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["observations"] });
      qc.invalidateQueries({ queryKey: ["entity-observations"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: StoreRequest) => store(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sources"] });
      qc.invalidateQueries({ queryKey: ["entities"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useStoreUnstructured() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { file_content: string; mime_type: string; idempotency_key?: string; original_filename?: string }) =>
      storeUnstructured(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sources"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useCreateRelationship() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createRelationship(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["relationships"] });
      qc.invalidateQueries({ queryKey: ["entity-relationships"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useDeleteRelationship() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { type: string; source: string; target: string; reason?: string }) =>
      deleteRelationship(args.type, args.source, args.target, args.reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["relationships"] });
      qc.invalidateQueries({ queryKey: ["entity-relationships"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useRestoreRelationship() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { type: string; source: string; target: string; reason?: string }) =>
      restoreRelationship(args.type, args.source, args.target, args.reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["relationships"] });
      qc.invalidateQueries({ queryKey: ["entity-relationships"] });
    },
  });
}

export function useRegisterSchema() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { entity_type: string; schema_definition: Record<string, unknown>; reducer_config: Record<string, unknown>; schema_version?: string; activate?: boolean }) =>
      registerSchema(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schemas"] }),
  });
}

export function useUpdateSchema() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { entity_type: string; fields_to_add: Array<{ field_name: string; field_type: string; required?: boolean; reducer_strategy?: string }> }) =>
      updateSchemaIncremental(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schemas"] });
      qc.invalidateQueries({ queryKey: ["schema"] });
    },
  });
}

export function useCorrect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { entity_id: string; entity_type: string; field: string; value: unknown; idempotency_key: string }) => correct(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entity"] });
      qc.invalidateQueries({ queryKey: ["entity-observations"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}
