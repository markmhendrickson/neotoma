/**
 * File-backed sandbox-abuse-report store. Mirrors
 * `src/services/feedback/local_store.ts` so the sandbox reporting pipeline
 * behaves identically to product feedback on the local transport.
 *
 * The public sandbox (sandbox.neotoma.io) is wiped weekly, so in production
 * the HTTP transport forwards reports to the agent-site Netlify pipeline for
 * durability. The local store is still used:
 *   - as a hot buffer before the forwarder runs
 *   - for integration tests
 *   - for self-hosted Neotoma installations that want a local fallback
 */

import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SandboxReportReason, SandboxReportStatus } from "./types.js";

export interface LocalSandboxReportRecord {
  id: string;
  submitter_ip_hash: string;
  reason: SandboxReportReason;
  description: string;
  entity_id: string | null;
  url: string | null;
  reporter_contact: string | null;
  metadata: Record<string, unknown>;
  submitted_at: string;
  status: SandboxReportStatus;
  status_updated_at: string;
  resolution_notes: string | null;
  access_token_hash: string;
  redaction_applied: boolean;
  redaction_backstop_hits: string[];
  forwarded_at: string | null;
  forwarded_report_id: string | null;
  consecutive_same_status_polls: number;
}

interface StoreShape {
  records: Record<string, LocalSandboxReportRecord>;
  token_index: Record<string, string>;
}

export function resolveSandboxReportStorePath(dataDir?: string): string {
  const base =
    dataDir ??
    process.env.NEOTOMA_SANDBOX_REPORT_STORE_PATH ??
    process.env.NEOTOMA_DATA_DIR ??
    "./data";
  return path.join(base, "sandbox_reports", "records.json");
}

export function generateSandboxReportId(): string {
  const t = Date.now().toString(36);
  const r = randomBytes(6).toString("hex");
  return `sbx_${t}_${r}`;
}

export function hashSandboxToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashSubmitterIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

async function readStore(storePath: string): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    return {
      records: parsed.records ?? {},
      token_index: parsed.token_index ?? {},
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { records: {}, token_index: {} };
    }
    throw err;
  }
}

async function writeStore(storePath: string, store: StoreShape): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  const tmp = storePath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tmp, storePath);
}

export class LocalSandboxReportStore {
  constructor(private readonly storePath: string = resolveSandboxReportStorePath()) {}

  async getById(id: string): Promise<LocalSandboxReportRecord | null> {
    const store = await readStore(this.storePath);
    return store.records[id] ?? null;
  }

  async getByTokenHash(tokenHash: string): Promise<LocalSandboxReportRecord | null> {
    const store = await readStore(this.storePath);
    const id = store.token_index[tokenHash];
    if (!id) return null;
    return store.records[id] ?? null;
  }

  async upsert(record: LocalSandboxReportRecord, tokenHashForIndex?: string): Promise<void> {
    const store = await readStore(this.storePath);
    store.records[record.id] = record;
    if (tokenHashForIndex) {
      store.token_index[tokenHashForIndex] = record.id;
    }
    await writeStore(this.storePath, store);
  }

  async listUnforwarded(limit = 100): Promise<LocalSandboxReportRecord[]> {
    const store = await readStore(this.storePath);
    return Object.values(store.records)
      .filter((r) => !r.forwarded_at)
      .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
      .slice(0, limit);
  }

  async listAll(): Promise<LocalSandboxReportRecord[]> {
    const store = await readStore(this.storePath);
    return Object.values(store.records);
  }
}
