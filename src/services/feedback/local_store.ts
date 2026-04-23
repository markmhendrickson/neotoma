/**
 * File-backed feedback store used by the local transport and by
 * `neotoma triage` when run against local storage.
 *
 * Rationale: the plan calls for `submit_feedback` in local mode to write a
 * `product_feedback` entity through `store_structured`. For MVP we write to
 * a simple JSON file under the Neotoma data dir, which is always-accessible
 * to `neotoma triage` running on the same machine without forcing the whole
 * entity-store pipeline (schemas, observations, snapshotting) through the
 * feedback path. Upgrade path: swap this for `storeStructuredForApi` once
 * the `product_feedback` schema is seeded.
 */

import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  FeedbackStatus,
  ResolutionConfidence,
  ResolutionLinks,
  SubmitFeedbackArgs,
  UpgradeGuidance,
  VerificationCountsByOutcome,
} from "./types.js";

export interface LocalFeedbackRecord {
  id: string;
  submitter_id: string;
  kind: SubmitFeedbackArgs["kind"];
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  submitted_at: string;
  status: FeedbackStatus;
  status_updated_at: string;
  classification: string | null;
  resolution_links: ResolutionLinks;
  upgrade_guidance: UpgradeGuidance | null;
  triage_notes: string | null;
  last_activity_at: string | null;
  next_check_suggested_at: string | null;
  access_token_hash: string;
  /**
   * Auto-classification produced by the ingest cron (before operator review).
   * Used by `neotoma triage --health` to compute classifier/operator agreement
   * for the accuracy-floor monitor. `classification` above holds the final
   * (operator-confirmed) value.
   */
  classifier_classification?: string;
  prefer_human_draft?: boolean;
  redaction_applied: boolean;
  redaction_backstop_hits: string[];
  consecutive_same_status_polls: number;
  status_push?: { webhook_url: string; webhook_secret?: string };
  parent_feedback_id?: string;
  verification_outcome?: SubmitFeedbackArgs["verification_outcome"];
  verified_at_version?: string;
  verification_count_by_outcome?: VerificationCountsByOutcome;
  resolution_confidence?: ResolutionConfidence;
  first_verification_at?: string | null;
  last_verification_at?: string | null;
  regression_candidate?: boolean;
  regression_detected_at?: string | null;
  regression_detected_by_feedback_id?: string | null;
  regression_count?: number;
  superseded_by_version?: string | null;
}

interface StoreShape {
  records: Record<string, LocalFeedbackRecord>;
  token_index: Record<string, string>;
}

export function resolveFeedbackStorePath(dataDir?: string): string {
  const base =
    dataDir ??
    process.env.NEOTOMA_FEEDBACK_STORE_PATH ??
    process.env.NEOTOMA_DATA_DIR ??
    "./data";
  return path.join(base, "feedback", "records.json");
}

export function generateFeedbackId(): string {
  const t = Date.now().toString(36);
  const r = randomBytes(6).toString("hex");
  return `fbk_${t}_${r}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
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

export class LocalFeedbackStore {
  constructor(private readonly storePath: string = resolveFeedbackStorePath()) {}

  async getById(id: string): Promise<LocalFeedbackRecord | null> {
    const store = await readStore(this.storePath);
    return store.records[id] ?? null;
  }

  async getByTokenHash(tokenHash: string): Promise<LocalFeedbackRecord | null> {
    const store = await readStore(this.storePath);
    const id = store.token_index[tokenHash];
    if (!id) return null;
    return store.records[id] ?? null;
  }

  async upsert(record: LocalFeedbackRecord, tokenHashForIndex?: string): Promise<void> {
    const store = await readStore(this.storePath);
    store.records[record.id] = record;
    if (tokenHashForIndex) {
      store.token_index[tokenHashForIndex] = record.id;
    }
    await writeStore(this.storePath, store);
  }

  async listPending(limit = 100): Promise<LocalFeedbackRecord[]> {
    const store = await readStore(this.storePath);
    return Object.values(store.records)
      .filter((r) => r.status === "submitted" || r.status === "triaged")
      .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
      .slice(0, limit);
  }

  async listAll(): Promise<LocalFeedbackRecord[]> {
    const store = await readStore(this.storePath);
    return Object.values(store.records);
  }

  async findByCommitSha(sha: string): Promise<string[]> {
    const store = await readStore(this.storePath);
    return Object.values(store.records)
      .filter((r) => (r.resolution_links.commit_shas ?? []).includes(sha))
      .map((r) => r.id);
  }
}
