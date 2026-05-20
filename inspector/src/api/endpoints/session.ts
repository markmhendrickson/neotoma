import { get } from "../client";

/**
 * Diagnostic block returned by `GET /session`. Mirrors the server-side
 * `AttributionDecisionDiagnostics` shape but with only the fields the
 * Inspector actually renders. Keep this aligned with
 * `src/services/session_attribution.ts`.
 */
export type SessionAttestationFormat =
  | "apple-secure-enclave"
  | "webauthn-packed"
  | "tpm2"
  | "unknown";

export type SessionAttestationFailureReason =
  | "not_present"
  | "unsupported_format"
  | "key_binding_failed"
  | "challenge_mismatch"
  | "chain_invalid"
  | "signature_invalid"
  | "aaguid_not_trusted"
  | "pubarea_mismatch"
  | "not_implemented"
  | "malformed";

export type SessionAttestationOutcome =
  | { verified: true; format: Exclude<SessionAttestationFormat, "unknown"> }
  | {
      verified: false;
      format: SessionAttestationFormat;
      reason: SessionAttestationFailureReason;
    };

export interface SessionAttribution {
  tier?:
    | "hardware"
    | "operator_attested"
    | "software"
    | "unverified_client"
    | "anonymous"
    | string;
  agent_thumbprint?: string;
  agent_sub?: string;
  agent_iss?: string;
  client_name?: string;
  client_version?: string;
  connection_id?: string;
  decision?: {
    reason?: string;
    client_name?: string;
    client_version?: string;
    agent_sub?: string;
    resolved_tier?: string;
    signature_present?: boolean;
    signature_verified?: boolean;
    signature_error_code?: string;
    client_info_raw_name?: string;
    client_info_normalised_to_null_reason?: string;
    attestation?: SessionAttestationOutcome | null;
    operator_allowlist_source?: "issuer" | "issuer_subject" | null;
  } | null;
}

export interface SessionResponse {
  attribution?: SessionAttribution;
  user_id?: string;
  authority?: string;
  /**
   * Top-level convenience flag on the server response (see
   * `src/services/session_info.ts`). True iff the resolved tier would
   * pass the active attribution policy on the default write path.
   */
  eligible_for_trusted_writes?: boolean;
  policy?: Record<string, unknown>;
}

export function getSession() {
  return get<SessionResponse>("/session");
}
