#!/usr/bin/env tsx
/**
 * Purge a specific entity out of the public sandbox between weekly resets.
 *
 * Used by the trust-and-safety team (or the on-call engineer) in response to
 * a sandbox_abuse_report. Calls the authenticated local API as an admin with
 * a bearer token — NOT via the anonymous sandbox path — so the deletion
 * happens under a real user_id and is audited normally.
 *
 * Usage:
 *   NEOTOMA_SANDBOX_ADMIN_BEARER=<token> tsx scripts/sandbox_purge_entity.ts \
 *     --base-url https://sandbox.neotoma.io \
 *     --entity-id ent_...                    \
 *     --report-id sbx_...                    \
 *     [--dry-run]                             \
 *     [--reason "PII leak reported in sbx_..."]
 */

import path from "node:path";

interface PurgeOptions {
  baseUrl: string;
  bearer: string;
  entityId: string;
  reportId?: string;
  reason?: string;
  dryRun?: boolean;
  fetchImpl?: typeof fetch;
}

export async function purgeSandboxEntity(options: PurgeOptions): Promise<{
  entity_id: string;
  deleted: boolean;
  dry_run: boolean;
  response_status: number;
}> {
  const fetchFn = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  if (options.dryRun) {
    return {
      entity_id: options.entityId,
      deleted: false,
      dry_run: true,
      response_status: 0,
    };
  }

  const res = await fetchFn(`${baseUrl}/delete_entity`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.bearer}`,
      "x-sandbox-purge-reason": options.reason || "trust_safety_manual",
      "x-sandbox-linked-report-id": options.reportId || "",
    },
    body: JSON.stringify({
      entity_id: options.entityId,
      hard_delete: true,
      reason: options.reason,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `purge failed: ${res.status} ${text.slice(0, 200)}`,
    );
  }

  return {
    entity_id: options.entityId,
    deleted: true,
    dry_run: false,
    response_status: res.status,
  };
}

function parseArgs(argv: string[]): {
  baseUrl: string;
  entityId: string;
  reportId?: string;
  reason?: string;
  dryRun: boolean;
} {
  let baseUrl = process.env.NEOTOMA_SANDBOX_BASE_URL?.trim() || "https://sandbox.neotoma.io";
  let entityId = "";
  let reportId: string | undefined;
  let reason: string | undefined;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base-url" && argv[i + 1]) {
      baseUrl = argv[i + 1];
      i++;
    } else if (arg === "--entity-id" && argv[i + 1]) {
      entityId = argv[i + 1];
      i++;
    } else if (arg === "--report-id" && argv[i + 1]) {
      reportId = argv[i + 1];
      i++;
    } else if (arg === "--reason" && argv[i + 1]) {
      reason = argv[i + 1];
      i++;
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }
  if (!entityId) {
    throw new Error("--entity-id is required");
  }
  return { baseUrl, entityId, reportId, reason, dryRun };
}

async function main(): Promise<void> {
  const bearer = process.env.NEOTOMA_SANDBOX_ADMIN_BEARER?.trim();
  if (!bearer) {
    throw new Error(
      "NEOTOMA_SANDBOX_ADMIN_BEARER must be set to a user bearer token with delete access",
    );
  }
  const { baseUrl, entityId, reportId, reason, dryRun } = parseArgs(process.argv.slice(2));
  const result = await purgeSandboxEntity({
    baseUrl,
    bearer,
    entityId,
    reportId,
    reason,
    dryRun,
  });
  process.stdout.write(JSON.stringify({ ok: true, ...result }, null, 2) + "\n");
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMain) {
  main().catch((err) => {
    process.stderr.write(`[sandbox_purge_entity] ${(err as Error).message}\n`);
    process.exit(1);
  });
}
