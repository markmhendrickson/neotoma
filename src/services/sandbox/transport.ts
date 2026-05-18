/**
 * Sandbox-report transport layer. Mirrors
 * `src/services/feedback_transport_{local,http}.ts`.
 *
 * Submission flow:
 *   1. `sanitizeInput` normalises + truncates description to guard against
 *      outsize payloads.
 *   2. `scanAndRedact` strips emails/phones/tokens/UUIDs from the description
 *      before any durable write.
 *   3. The local transport writes a `LocalSandboxReportRecord`; the HTTP
 *      transport POSTs to `NEOTOMA_SANDBOX_REPORT_FORWARD_URL` (typically the
 *      agent-site Netlify function), authenticated with a shared bearer.
 *   4. Both transports return a `SandboxReportSubmitResponse` with an
 *      access_token for status lookups.
 */

import { randomBytes } from "node:crypto";
import {
  LocalSandboxReportStore,
  generateSandboxReportId,
  hashSandboxToken,
  hashSubmitterIp,
  type LocalSandboxReportRecord,
} from "./local_store.js";
import { generateRedactionSalt, scanAndRedact } from "../feedback/redaction.js";
import type {
  SandboxReportStatusResponse,
  SandboxReportSubmitResponse,
  SandboxReportTransport,
  SubmitSandboxReportArgs,
} from "./types.js";

const MAX_DESCRIPTION_CHARS = 8_000;

function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

function sanitizeInput(args: SubmitSandboxReportArgs): SubmitSandboxReportArgs {
  const description = (args.description ?? "").toString().slice(0, MAX_DESCRIPTION_CHARS);
  return {
    ...args,
    description,
    entity_id: args.entity_id?.toString().slice(0, 128),
    url: args.url?.toString().slice(0, 2048),
    reporter_contact: args.reporter_contact?.toString().slice(0, 256),
  };
}

function projectStatus(record: LocalSandboxReportRecord): SandboxReportStatusResponse {
  return {
    report_id: record.id,
    status: record.status,
    submitted_at: record.submitted_at,
    status_updated_at: record.status_updated_at,
    resolution_notes: record.resolution_notes,
    next_check_suggested_at: deriveNextCheck(record),
  };
}

function deriveNextCheck(record: LocalSandboxReportRecord): string | null {
  // Simple schedule: next check in 24h for received/reviewing, null once
  // resolved/rejected. Mirrors the spirit of deriveNextCheckAt for feedback
  // without the same polling-fatigue complexity — sandbox reports are rare.
  if (record.status === "resolved" || record.status === "rejected") return null;
  const base = new Date(record.status_updated_at).getTime();
  return new Date(base + 24 * 3600 * 1000).toISOString();
}

export class LocalSandboxReportTransport implements SandboxReportTransport {
  constructor(private readonly storePath?: string) {}

  private store(): LocalSandboxReportStore {
    return new LocalSandboxReportStore(this.storePath);
  }

  async submit(
    rawArgs: SubmitSandboxReportArgs,
    submitterIp: string
  ): Promise<SandboxReportSubmitResponse> {
    const args = sanitizeInput(rawArgs);
    if (!args.description.trim()) {
      throw new Error("description is required");
    }

    const salt = generateRedactionSalt();
    const redaction = scanAndRedact({
      title: args.reason,
      body: args.description,
      salt,
    });

    const now = new Date();
    const id = generateSandboxReportId();
    const accessToken = generateAccessToken();
    const tokenHash = hashSandboxToken(accessToken);

    // Redact any contact information from the reporter_contact field — we
    // hash it in place so future abuse analysis can still dedup reporters
    // without storing raw identifiers.
    const reporterContactRedacted = args.reporter_contact
      ? scanAndRedact({ title: "", body: args.reporter_contact, salt }).body
      : null;

    const record: LocalSandboxReportRecord = {
      id,
      submitter_ip_hash: hashSubmitterIp(submitterIp || "unknown"),
      reason: args.reason,
      description: redaction.body,
      entity_id: args.entity_id ?? null,
      url: args.url ?? null,
      reporter_contact: reporterContactRedacted,
      metadata: args.metadata ?? {},
      submitted_at: now.toISOString(),
      status: "received",
      status_updated_at: now.toISOString(),
      resolution_notes: null,
      access_token_hash: tokenHash,
      redaction_applied: redaction.applied,
      redaction_backstop_hits: redaction.hits,
      forwarded_at: null,
      forwarded_report_id: null,
      consecutive_same_status_polls: 0,
    };

    await this.store().upsert(record, tokenHash);

    return {
      report_id: id,
      access_token: accessToken,
      status: "received",
      submitted_at: record.submitted_at,
      next_check_suggested_at: deriveNextCheck(record),
      redaction_preview: {
        applied: redaction.applied,
        redacted_description: redaction.body,
        fields_redacted_count: redaction.fields_redacted,
        backstop_hits: redaction.hits,
      },
    };
  }

  async status(accessToken: string): Promise<SandboxReportStatusResponse> {
    const record = await this.store().getByTokenHash(hashSandboxToken(accessToken));
    if (!record) {
      throw new Error("sandbox report not found for access_token");
    }
    record.consecutive_same_status_polls = (record.consecutive_same_status_polls ?? 0) + 1;
    await this.store().upsert(record);
    return projectStatus(record);
  }
}

export class HttpSandboxReportTransport implements SandboxReportTransport {
  constructor(
    private readonly forwardUrl: string,
    private readonly bearer: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async submit(
    rawArgs: SubmitSandboxReportArgs,
    submitterIp: string
  ): Promise<SandboxReportSubmitResponse> {
    const args = sanitizeInput(rawArgs);
    const res = await this.fetchImpl(this.forwardUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.bearer}`,
        "x-sandbox-submitter-ip-hash": hashSubmitterIp(submitterIp || "unknown"),
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`sandbox report forward failed: ${res.status} ${text.slice(0, 200)}`);
    }
    return (await res.json()) as SandboxReportSubmitResponse;
  }

  async status(accessToken: string): Promise<SandboxReportStatusResponse> {
    const url = `${this.forwardUrl.replace(/\/submit$/, "")}/status?access_token=${encodeURIComponent(accessToken)}`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: { authorization: `Bearer ${this.bearer}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`sandbox report status failed: ${res.status} ${text.slice(0, 200)}`);
    }
    return (await res.json()) as SandboxReportStatusResponse;
  }
}

export function resolveSandboxReportTransport(): SandboxReportTransport {
  const forwardUrl = process.env.NEOTOMA_SANDBOX_REPORT_FORWARD_URL?.trim();
  const bearer = process.env.NEOTOMA_SANDBOX_REPORT_FORWARD_BEARER?.trim();
  if (forwardUrl && bearer) {
    return new HttpSandboxReportTransport(forwardUrl, bearer);
  }
  return new LocalSandboxReportTransport();
}
