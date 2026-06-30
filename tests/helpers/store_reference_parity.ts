/**
 * Shared parity-matrix driver for `source_storage:'reference'` store scenarios.
 *
 * Retrospective ent_68a9270e2e656da847c10ced found that the by-reference
 * source-storage feature shipped incomplete because contract parity across
 * Neotoma's surfaces (MCP, HTTP/REST, CLI, SDK) was never tested on the same
 * scenarios. This helper encodes a single scenario matrix and drives it across
 * BOTH the MCP `store` tool dispatch and the REST `POST /store` route, so a
 * regression on either surface (or a divergence between them) fails the same
 * lane — implementing task_policy cross_surface_contract_parity_tested_all_surfaces
 * (ent_2ad0677fe23c0c1878ae43e8).
 *
 * Each scenario asserts the EFFECT (storage_mode='reference' in the sources
 * row), not merely that the input was accepted — per task_policy
 * fixed_means_behavior_verified_not_contract_accepted (ent_db0b7855d47012084477fb00).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";

export type StoreSurface = "mcp" | "rest";

export interface ReferenceParityResult {
  /** source_id of the file (reference) leg, used to inspect the sources row. */
  sourceId: string;
  /** storage_mode the surface reported in its response envelope. */
  reportedStorageMode: unknown;
}

/**
 * Drives the MCP `store` tool through the real CallToolRequestSchema dispatch
 * surface (`executeTool`) — the same code path the `/mcp` JSON-RPC route
 * routes a `tools/call` for `store` into. Returns the file-leg source_id and
 * the storage_mode the MCP envelope reported.
 */
export async function storeReferenceViaMcp(
  server: NeotomaServer,
  args: {
    userId: string;
    filePath: string;
    idempotencyKey: string;
    withEntities: boolean;
  }
): Promise<ReferenceParityResult> {
  const dispatch = server as unknown as {
    executeTool: (
      name: string,
      args: unknown
    ) => Promise<{ content: Array<{ type: string; text: string }> }>;
  };

  const toolArgs: Record<string, unknown> = {
    user_id: args.userId,
    file_path: args.filePath,
    mime_type: "text/plain",
    source_storage: "reference",
    file_idempotency_key: `${args.idempotencyKey}-file`,
  };
  if (args.withEntities) {
    toolArgs.idempotency_key = args.idempotencyKey;
    toolArgs.entities = [{ entity_type: "note", title: "parity-mcp", content: "body" }];
  } else {
    toolArgs.idempotency_key = args.idempotencyKey;
  }

  const result = await dispatch.executeTool("store", toolArgs);
  const payload = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

  if (args.withEntities) {
    const unstructured = payload.unstructured as Record<string, unknown> | undefined;
    return {
      sourceId: unstructured?.source_id as string,
      reportedStorageMode: unstructured?.storage_mode,
    };
  }
  return {
    sourceId: payload.source_id as string,
    reportedStorageMode: payload.storage_mode,
  };
}

/**
 * Drives the REST `POST /store` route over real HTTP. Returns the file-leg
 * source_id and the storage_mode the REST envelope reported.
 */
export async function storeReferenceViaRest(
  apiBase: string,
  args: {
    userId: string;
    filePath: string;
    idempotencyKey: string;
    withEntities: boolean;
  }
): Promise<ReferenceParityResult> {
  const body: Record<string, unknown> = {
    user_id: args.userId,
    file_path: args.filePath,
    mime_type: "text/plain",
    source_storage: "reference",
    file_idempotency_key: `${args.idempotencyKey}-file`,
    idempotency_key: args.idempotencyKey,
  };
  if (args.withEntities) {
    body.entities = [{ entity_type: "note", title: "parity-rest", content: "body" }];
  }

  const resp = await fetch(`${apiBase}/store`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (resp.status !== 200) {
    throw new Error(`REST /store returned ${resp.status}: ${await resp.text()}`);
  }
  const payload = (await resp.json()) as Record<string, unknown>;

  if (args.withEntities) {
    const unstructured = payload.unstructured as Record<string, unknown> | undefined;
    return {
      sourceId: unstructured?.source_id as string,
      reportedStorageMode: unstructured?.storage_mode,
    };
  }
  return {
    sourceId: payload.source_id as string,
    reportedStorageMode: payload.storage_mode,
  };
}

/** Reads back the storage_mode persisted on the sources row (the EFFECT). */
export async function readSourceStorageMode(sourceId: string): Promise<string | undefined> {
  const { data } = await db.from("sources").select("storage_mode").eq("id", sourceId).single();
  return (data as { storage_mode?: string } | null)?.storage_mode;
}

/** Writes a temp file and tracks its directory for cleanup. */
export function makeReferenceTempFile(
  tempDirs: string[],
  content: string,
  filename = "parity-ref.txt"
): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-parity-ref-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

/** The shared scenario matrix: each (surface × shape) cell. */
export interface ParityScenario {
  surface: StoreSurface;
  shape: "file-only" | "file+entities";
  label: string;
}

export const REFERENCE_PARITY_MATRIX: ParityScenario[] = [
  { surface: "mcp", shape: "file-only", label: "MCP store — file-only" },
  { surface: "mcp", shape: "file+entities", label: "MCP store — file+entities" },
  { surface: "rest", shape: "file-only", label: "REST /store — file-only" },
  { surface: "rest", shape: "file+entities", label: "REST /store — file+entities" },
];
