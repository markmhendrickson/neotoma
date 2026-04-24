/**
 * POST /sandbox/report/submit (public route)
 *
 * Receives an abuse report forwarded from the public sandbox Fly deployment
 * (sandbox.neotoma.io). Authenticated by `AGENT_SITE_SANDBOX_BEARER` so the
 * sandbox forwarder is the only caller. Reuses the shared redaction scanner
 * as a backstop and persists to Netlify Blobs under the `sandbox_reports`
 * store so records survive weekly sandbox resets.
 */

import type { Config } from "@netlify/functions";
import {
  generateAccessToken,
  generateFeedbackId,
  hashAccessToken,
} from "../lib/ids.js";
import {
  generateRedactionSalt,
  scanAndRedact,
} from "../lib/redaction.js";
import { errorResponse, jsonResponse } from "../lib/responses.js";
import {
  addToPending,
  writeReport,
  writeTokenIndex,
  type StoredSandboxReport,
} from "../lib/sandbox_storage.js";

const VALID_REASONS = [
  "abuse",
  "pii_leak",
  "illegal_content",
  "spam",
  "bug",
  "other",
];

function readBearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim();
}

function requireSandboxBearer(req: Request) {
  const expected = process.env.AGENT_SITE_SANDBOX_BEARER;
  if (!expected) {
    return { ok: false, status: 500, message: "AGENT_SITE_SANDBOX_BEARER not configured" };
  }
  const provided = readBearer(req);
  if (!provided || provided !== expected) {
    return { ok: false, status: 401, message: "Missing or invalid bearer token" };
  }
  return { ok: true } as const;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return errorResponse(405, "method_not_allowed", "Use POST");
  const auth = requireSandboxBearer(req);
  if (auth.ok !== true) return errorResponse(auth.status, "unauthorized", auth.message);

  let payload: {
    reason?: string;
    description?: string;
    entity_id?: string;
    url?: string;
    reporter_contact?: string;
    metadata?: Record<string, unknown>;
  };
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    return errorResponse(400, "bad_request", "Body must be valid JSON");
  }

  const reason = (payload.reason ?? "").toString();
  if (!VALID_REASONS.includes(reason)) {
    return errorResponse(400, "bad_request", `reason must be one of: ${VALID_REASONS.join(", ")}`);
  }
  const description = (payload.description ?? "").toString().trim().slice(0, 8_000);
  if (!description) return errorResponse(400, "bad_request", "description is required");

  // The sandbox forwarder passes the hashed IP via a header; never trust a
  // raw IP in the payload.
  const submitterIpHash =
    req.headers.get("x-sandbox-submitter-ip-hash")?.toString().slice(0, 64) || "unknown";

  const salt = generateRedactionSalt();
  const redaction = scanAndRedact({ title: reason, body: description, salt });
  const reporterContact = payload.reporter_contact
    ? scanAndRedact({ title: "", body: payload.reporter_contact, salt }).body
    : null;

  const now = new Date();
  const id = generateFeedbackId().replace(/^fbk_/, "sbx_");
  const accessToken = generateAccessToken();
  const accessTokenHash = hashAccessToken(accessToken);

  const record: StoredSandboxReport = {
    id,
    submitter_ip_hash: submitterIpHash,
    reason,
    description: redaction.body,
    entity_id: payload.entity_id?.toString().slice(0, 128) ?? null,
    url: payload.url?.toString().slice(0, 2048) ?? null,
    reporter_contact: reporterContact,
    metadata: payload.metadata ?? {},
    submitted_at: now.toISOString(),
    status: "received",
    status_updated_at: now.toISOString(),
    resolution_notes: null,
    access_token_hash: accessTokenHash,
    redaction_applied: redaction.applied,
    redaction_backstop_hits: redaction.hits,
  };

  await writeReport(record);
  await writeTokenIndex(accessTokenHash, id);
  await addToPending(id);

  return jsonResponse({
    report_id: id,
    access_token: accessToken,
    status: "received",
    submitted_at: record.submitted_at,
    next_check_suggested_at: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
    redaction_preview: {
      applied: redaction.applied,
      redacted_description: redaction.body,
      fields_redacted_count: redaction.fields_redacted,
      backstop_hits: redaction.hits,
    },
  });
};

export const config: Config = {
  path: "/sandbox/report/submit",
};
