/**
 * Best-effort forwarder that mirrors agent-site feedback records into a
 * native Neotoma `neotoma_feedback` entity over the Cloudflare Named
 * Tunnel.
 *
 * Contract:
 *   - Never throws. All failures surface as `{ mirrored: false, reason }`.
 *   - Short timeout (2s by default) so the submit/status response path
 *     stays snappy even when the tunnel is slow.
 *   - No request is made at all when `NEOTOMA_FEEDBACK_FORWARD_MODE=off` or
 *     when `NEOTOMA_TUNNEL_URL` is unset.
 *
 * Auth headers attached to every request:
 *   - `Authorization: AAuth ...` + `Signature` / `Signature-Input` /
 *     `Signature-Key` / `Content-Digest` / `Date` — RFC 9421 HTTP Message
 *     Signatures produced by `./aauth_signer.ts`. The corresponding public
 *     key is discoverable at `/.well-known/jwks.json`.
 *   - `CF-Access-Client-Id` / `CF-Access-Client-Secret` — Cloudflare Access
 *     service-token layer. The tunnel hostname is gated by an Access app so
 *     random public callers can't reach it even if they learn the URL.
 *   - `X-Agent-Label` — self-reported agent identifier. Neotoma cross-checks
 *     this against the AAuth `sub` claim when the label is listed in
 *     `NEOTOMA_STRICT_AAUTH_SUBS` (see docs/subsystems/agent_capabilities.md).
 *
 * The payload uses the `store_structured` shape (entities + relationships)
 * so the same endpoint that powers MCP works here too.
 */

import type { MirrorTask } from "./storage.js";
import type { StoredFeedback } from "./types.js";
import { storedFeedbackToEntity } from "./neotoma_payload.js";
import {
  signedFetch,
  SignerConfigError,
  type SignerConfig,
} from "./aauth_signer.js";

export type ForwardMode = "off" | "best_effort" | "required";

export interface ForwardResult {
  mirrored: boolean;
  /** Neotoma `entity_id` returned by `store_structured` on success. */
  entity_id?: string;
  /**
   * Short, machine-friendly reason on failure:
   *   `disabled` | `misconfigured` | `signer_misconfigured` |
   *   `timeout` | `network` | `http_<status>` | `bad_response`
   */
  reason?: string;
  /** HTTP status code when the forward reached the endpoint but was rejected. */
  http_status?: number;
}

export interface ForwarderConfig {
  mode: ForwardMode;
  tunnelUrl?: string;
  cfAccessClientId?: string;
  cfAccessClientSecret?: string;
  agentLabel?: string;
  timeoutMs?: number;
  /** Injected for tests; defaults to `signedFetch` from `./aauth_signer.js`. */
  signedFetchImpl?: typeof signedFetch;
  /** Test hook: pre-built signer config to bypass env loading. */
  signerConfig?: SignerConfig;
}

function parseMode(value: string | undefined): ForwardMode {
  if (value === "off" || value === "required") return value;
  return "best_effort";
}

export function loadForwarderConfigFromEnv(): ForwarderConfig {
  return {
    mode: parseMode(process.env.NEOTOMA_FEEDBACK_FORWARD_MODE),
    tunnelUrl: process.env.NEOTOMA_TUNNEL_URL,
    cfAccessClientId: process.env.CF_ACCESS_CLIENT_ID,
    cfAccessClientSecret: process.env.CF_ACCESS_CLIENT_SECRET,
    agentLabel:
      process.env.AGENT_SITE_NEOTOMA_AGENT_LABEL ?? "agent-site@neotoma.io",
    timeoutMs: Number.parseInt(
      process.env.NEOTOMA_FEEDBACK_FORWARD_TIMEOUT_MS ?? "2000",
      10,
    ),
  };
}

function buildHeaders(config: ForwarderConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    "x-agent-label": config.agentLabel ?? "agent-site@neotoma.io",
    "user-agent": "agent.neotoma.io forwarder/1.0",
  };
  if (config.cfAccessClientId) {
    headers["cf-access-client-id"] = config.cfAccessClientId;
  }
  if (config.cfAccessClientSecret) {
    headers["cf-access-client-secret"] = config.cfAccessClientSecret;
  }
  return headers;
}

function buildStoreRequestBody(
  record: StoredFeedback,
  op: MirrorTask["op"],
): Record<string, unknown> {
  const mapped = storedFeedbackToEntity(record, {
    dataSource:
      op === "update"
        ? `agent-site netlify update ${new Date().toISOString().slice(0, 10)}`
        : undefined,
  });
  const body: Record<string, unknown> = {
    entities: [mapped.entity],
    idempotency_key: mapped.idempotency_key,
    source_priority: 100,
  };
  if (mapped.related_entity_ids.length > 0) {
    // Server resolves these via its existing auto-REFERS_TO path when
    // reference_fields are declared; we pass as nested metadata too so
    // downstream triage can reconstruct the edges explicitly.
    body.related_entity_ids = mapped.related_entity_ids;
  }
  return body;
}

/**
 * Forward one `StoredFeedback` record to Neotoma. Pass `op: "update"` when
 * mirroring an admin status patch so the data_source stamp reflects the
 * retry semantics.
 */
export async function forwardToNeotoma(
  record: StoredFeedback,
  op: MirrorTask["op"] = "create",
  configOverrides?: Partial<ForwarderConfig>,
): Promise<ForwardResult> {
  const envConfig = loadForwarderConfigFromEnv();
  const config: ForwarderConfig = { ...envConfig, ...configOverrides };

  if (config.mode === "off") {
    return { mirrored: false, reason: "disabled" };
  }
  if (!config.tunnelUrl) {
    return { mirrored: false, reason: "misconfigured" };
  }

  const url = new URL("/store", config.tunnelUrl).toString();
  const body = buildStoreRequestBody(record, op);
  const bodyJson = JSON.stringify(body);
  const signedFetchFn = config.signedFetchImpl ?? signedFetch;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.max(250, config.timeoutMs ?? 2000),
  );

  let response: Response;
  try {
    response = await signedFetchFn(url, {
      method: "POST",
      headers: buildHeaders(config),
      body: bodyJson,
      signal: controller.signal,
      configOverride: config.signerConfig,
    });
  } catch (err) {
    if (err instanceof SignerConfigError) {
      return { mirrored: false, reason: "signer_misconfigured" };
    }
    const aborted = (err as Error & { name?: string }).name === "AbortError";
    return {
      mirrored: false,
      reason: aborted ? "timeout" : "network",
    };
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    return {
      mirrored: false,
      reason: `http_${response.status}`,
      http_status: response.status,
    };
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return { mirrored: false, reason: "bad_response" };
  }

  const entityId = extractEntityId(parsed);
  if (!entityId) {
    // The forward landed but didn't yield a usable id (partial replay, etc).
    // Treat as non-terminal so a retry eventually stamps one.
    return { mirrored: false, reason: "bad_response" };
  }

  return { mirrored: true, entity_id: entityId };
}

/**
 * Pull the `neotoma_feedback` entity id out of the `store_structured`
 * response envelope. Tolerates both current and historical response shapes:
 *   { structured: { entities: [{ entity_id, entity_type }] } }
 *   { entities: [{ entity_id, entity_type }] }
 */
function extractEntityId(response: unknown): string | undefined {
  if (!response || typeof response !== "object") return undefined;
  const root = response as Record<string, unknown>;
  const structured =
    (root.structured as Record<string, unknown> | undefined) ??
    (root as Record<string, unknown>);
  const entities = structured.entities;
  if (!Array.isArray(entities)) return undefined;
  for (const entry of entities) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (e.entity_type === "neotoma_feedback" && typeof e.entity_id === "string") {
      return e.entity_id;
    }
  }
  // Fallback: first entity with an entity_id.
  for (const entry of entities) {
    if (entry && typeof entry === "object") {
      const e = entry as Record<string, unknown>;
      if (typeof e.entity_id === "string") return e.entity_id;
    }
  }
  return undefined;
}
