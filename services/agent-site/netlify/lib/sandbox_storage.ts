/**
 * Blobs-backed storage for sandbox_abuse_report records. Parallel to
 * storage.ts (feedback) but scoped to a separate `sandbox_reports` store
 * so abuse-report records and product-feedback records don't collide
 * in the same namespace.
 *
 * Key shapes:
 *   report:{id}                    -> StoredSandboxReport JSON
 *   token:{sha256(access_token)}   -> report_id redirect
 *   index:pending                  -> string[] of report_ids in status=received|reviewing
 */

import { getStore } from "@netlify/blobs";

const STORE_NAME = "sandbox_reports";

export interface StoredSandboxReport {
  id: string;
  submitter_ip_hash: string;
  reason: string;
  description: string;
  entity_id: string | null;
  url: string | null;
  reporter_contact: string | null;
  metadata: Record<string, unknown>;
  submitted_at: string;
  status: "received" | "reviewing" | "resolved" | "rejected";
  status_updated_at: string;
  resolution_notes: string | null;
  access_token_hash: string;
  redaction_applied: boolean;
  redaction_backstop_hits: string[];
}

function store() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

export async function readReport(id: string): Promise<StoredSandboxReport | null> {
  const s = store();
  const raw = await s.get(`report:${id}`, { type: "json" });
  return (raw as StoredSandboxReport | null) ?? null;
}

export async function writeReport(record: StoredSandboxReport): Promise<void> {
  const s = store();
  await s.setJSON(`report:${record.id}`, record);
}

export async function writeTokenIndex(tokenHash: string, reportId: string): Promise<void> {
  const s = store();
  await s.set(`token:${tokenHash}`, reportId);
}

export async function lookupReportIdByTokenHash(
  tokenHash: string,
): Promise<string | null> {
  const s = store();
  const raw = await s.get(`token:${tokenHash}`);
  return typeof raw === "string" ? raw : null;
}

async function readStringList(key: string): Promise<string[]> {
  const s = store();
  const raw = await s.get(key, { type: "json" });
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

async function writeStringList(key: string, list: string[]): Promise<void> {
  const s = store();
  await s.setJSON(key, Array.from(new Set(list)));
}

export async function addToPending(reportId: string): Promise<void> {
  const list = await readStringList("index:pending");
  list.push(reportId);
  await writeStringList("index:pending", list);
}

export async function listPending(): Promise<string[]> {
  return readStringList("index:pending");
}
