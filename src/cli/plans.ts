/**
 * CLI implementation for `neotoma plans` commands.
 *
 * Subcommands:
 *   capture <file>  -- Persist a harness `.plan.md` file (raw markdown source +
 *                      structured plan row + EMBEDS) into Neotoma via POST /store.
 *   capture --all   -- Walk known harness plan directories and capture each file.
 *   list            -- Thin wrapper over POST /entities/list with entity_type=plan.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

import type { NeotomaApiClient } from "../shared/api_client.js";

export interface PlansCaptureOpts {
  /** Path to a single `.plan.md` file. Mutually exclusive with --all. */
  file?: string;
  /** When true, walk known harness plan dirs instead of capturing one file. */
  all?: boolean;
  /** Optional prompting message_entity_id to attach as REFERS_TO source. */
  source_message_entity_id?: string;
  /** Optional source-entity link (e.g. an `issue` entity_id this plan resolves). */
  source_entity_id?: string;
  source_entity_type?: string;
  /** Optional repository context. */
  repository_root?: string;
  json?: boolean;
}

export interface PlansListOpts {
  source_entity_id?: string;
  status?: string;
  harness?: string;
  limit?: number;
  json?: boolean;
}

const HARNESS_DIR_CANDIDATES = [
  ".cursor/plans",
  ".claude/plans",
  ".codex/plans",
  ".openclaw/plans",
];

function output(data: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  } else if (typeof data === "string") {
    process.stdout.write(data + "\n");
  } else {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  }
}

async function discoverHarnessPlanFiles(rootCandidates: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const root of rootCandidates) {
    try {
      const entries = await fs.readdir(root);
      for (const entry of entries) {
        if (entry.endsWith(".plan.md")) {
          out.push(path.join(root, entry));
        }
      }
    } catch {
      /* directory missing — skip */
    }
  }
  return out;
}

interface CaptureSingleResult {
  file: string;
  entity_id: string | null;
  asset_entity_id: string | null;
  embeds_relationship_created: boolean;
  error?: string;
}

async function captureSingleFile(
  filePath: string,
  opts: PlansCaptureOpts,
  api: NeotomaApiClient
): Promise<CaptureSingleResult> {
  const { captureHarnessPlan } = await import("../services/plans/capture_harness_plan.js");

  let payload;
  try {
    payload = await captureHarnessPlan({
      file_path: filePath,
      ...(opts.source_message_entity_id
        ? { source_message_entity_id: opts.source_message_entity_id }
        : {}),
      ...(opts.source_entity_id ? { source_entity_id: opts.source_entity_id } : {}),
      ...(opts.source_entity_type ? { source_entity_type: opts.source_entity_type } : {}),
      ...(opts.repository_root ? { repository_root: opts.repository_root } : {}),
    });
  } catch (err) {
    return {
      file: filePath,
      entity_id: null,
      asset_entity_id: null,
      embeds_relationship_created: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Read file content client-side so the request works against a remote API too
  // (the server can read `file_path` only when it shares the local filesystem).
  const fileContent = await fs.readFile(filePath, "utf8");

  const requestBody: Record<string, unknown> = {
    entities: payload.storePayload.entities,
    ...(payload.storePayload.relationships
      ? { relationships: payload.storePayload.relationships }
      : {}),
    file_content: fileContent,
    mime_type: "text/markdown",
    original_filename: path.basename(filePath),
    file_idempotency_key: payload.storePayload.file_idempotency_key,
    idempotency_key: payload.storePayload.idempotency_key,
  };

  type StoreOk = {
    entities?: Array<{ entity_id?: string }>;
    asset_entity_id?: string;
    structured?: { entities?: Array<{ entity_id?: string }> };
    unstructured?: { asset_entity_id?: string };
  };
  // Use POST /store directly; the canonical store endpoint accepts combined
  // entities + file payloads.
  const { data, error } = await (
    api as unknown as {
      POST: (
        path: "/store",
        args: { body: Record<string, unknown> }
      ) => Promise<{ data?: StoreOk; error?: unknown }>;
    }
  ).POST("/store", { body: requestBody });

  if (error) {
    return {
      file: filePath,
      entity_id: null,
      asset_entity_id: null,
      embeds_relationship_created: false,
      error: typeof error === "string" ? error : JSON.stringify(error),
    };
  }

  const ok = (data ?? {}) as StoreOk;
  const planEntityId =
    ok.structured?.entities?.[0]?.entity_id ?? ok.entities?.[0]?.entity_id ?? null;
  const assetEntityId = ok.unstructured?.asset_entity_id ?? ok.asset_entity_id ?? null;

  let embedsCreated = false;
  if (planEntityId && assetEntityId) {
    type RelOk = { relationship?: unknown };
    const { error: relErr } = await (
      api as unknown as {
        POST: (
          path: "/create_relationship",
          args: { body: Record<string, unknown> }
        ) => Promise<{ data?: RelOk; error?: unknown }>;
      }
    ).POST("/create_relationship", {
      body: {
        relationship_type: "EMBEDS",
        source_entity_id: planEntityId,
        target_entity_id: assetEntityId,
      },
    });
    embedsCreated = !relErr;
  }

  return {
    file: filePath,
    entity_id: planEntityId,
    asset_entity_id: assetEntityId,
    embeds_relationship_created: embedsCreated,
  };
}

export async function plansCapture(opts: PlansCaptureOpts, api: NeotomaApiClient): Promise<void> {
  if (opts.file && opts.all) {
    process.stderr.write("Error: pass either a file path or --all, not both\n");
    process.exitCode = 1;
    return;
  }
  if (!opts.file && !opts.all) {
    process.stderr.write("Error: pass a file path or --all\n");
    process.exitCode = 1;
    return;
  }

  let files: string[];
  if (opts.all) {
    const root = opts.repository_root ?? process.cwd();
    files = await discoverHarnessPlanFiles(HARNESS_DIR_CANDIDATES.map((d) => path.join(root, d)));
    if (files.length === 0) {
      if (opts.json) output({ captured: [], skipped: [], reason: "no plan files found" }, true);
      else process.stdout.write("No harness plan files found.\n");
      return;
    }
  } else {
    files = [opts.file as string];
  }

  const results: CaptureSingleResult[] = [];
  for (const f of files) {
    results.push(await captureSingleFile(f, opts, api));
  }

  if (opts.json) {
    output(
      {
        captured: results.filter((r) => r.entity_id),
        failed: results.filter((r) => !r.entity_id),
      },
      true
    );
    return;
  }

  for (const r of results) {
    if (r.entity_id) {
      const embedsNote = r.embeds_relationship_created
        ? "EMBEDS linked"
        : r.asset_entity_id
          ? "EMBEDS link failed"
          : "no asset entity returned";
      process.stdout.write(`${r.file}: stored as ${r.entity_id} (${embedsNote})\n`);
    } else {
      process.stdout.write(`${r.file}: failed${r.error ? ` — ${r.error}` : ""}\n`);
    }
  }
  if (results.every((r) => !r.entity_id)) {
    process.exitCode = 1;
  }
}

export async function plansList(opts: PlansListOpts, api: NeotomaApiClient): Promise<void> {
  type EntitiesResp = { entities?: Array<Record<string, unknown>>; total?: number };
  const { data, error } = await (
    api as unknown as {
      POST: (
        path: "/retrieve_entities",
        args: { body: Record<string, unknown> }
      ) => Promise<{ data?: EntitiesResp; error?: unknown }>;
    }
  ).POST("/retrieve_entities", {
    body: {
      entity_type: "plan",
      limit: opts.limit ?? 50,
      include_snapshots: true,
    },
  });

  if (error) {
    process.stderr.write(`plans list failed: ${JSON.stringify(error)}\n`);
    process.exitCode = 1;
    return;
  }

  const allEntities = data?.entities ?? [];
  const filtered = allEntities.filter((entity) => {
    const snapshotCarrier = entity as {
      snapshot?: { snapshot?: Record<string, unknown> } | Record<string, unknown>;
    };
    const snapshot =
      (snapshotCarrier.snapshot as { snapshot?: Record<string, unknown> } | undefined)?.snapshot ??
      (entity as { snapshot?: Record<string, unknown> }).snapshot ??
      {};
    if (
      opts.source_entity_id &&
      (snapshot as Record<string, unknown>).source_entity_id !== opts.source_entity_id
    )
      return false;
    if (opts.status && (snapshot as Record<string, unknown>).status !== opts.status) return false;
    if (opts.harness && (snapshot as Record<string, unknown>).harness !== opts.harness)
      return false;
    return true;
  });

  if (opts.json) {
    output({ entities: filtered, total: filtered.length }, true);
    return;
  }
  if (filtered.length === 0) {
    process.stdout.write("No plans found.\n");
    return;
  }
  for (const entity of filtered) {
    const snapshotCarrier = entity as {
      snapshot?: { snapshot?: Record<string, unknown> } | Record<string, unknown>;
    };
    const snapshot = ((
      snapshotCarrier.snapshot as { snapshot?: Record<string, unknown> } | undefined
    )?.snapshot ??
      (entity as { snapshot?: Record<string, unknown> }).snapshot ??
      {}) as Record<string, unknown>;
    const id =
      (entity as { entity_id?: string; id?: string }).entity_id ??
      (entity as { id?: string }).id ??
      "";
    const title = String(snapshot.title ?? "");
    const status = String(snapshot.status ?? "");
    const harness = String(snapshot.harness ?? "");
    process.stdout.write(`${id}\t${status}\t${harness}\t${title}\n`);
  }
}
