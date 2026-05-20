/**
 * Session attestation diagnostics card.
 *
 * Renders the `attribution.decision` block returned by `GET /session` so
 * operators can see how the AAuth middleware resolved the current
 * request's tier:
 *
 * - resolved tier (with the same {@link AgentBadge} pill the rest of
 *   the Inspector uses);
 * - the `cnf.attestation` envelope outcome (verified / format /
 *   failure reason — most useful when wiring up a new hardware key);
 * - the operator allowlist hit, when promotion to `operator_attested`
 *   was driven by `NEOTOMA_OPERATOR_ATTESTED_*` env vars.
 *
 * Lives next to {@link AttributionSummary} on the Settings page; the
 * summary is a roll-up over recent rows whereas this card is the
 * "what tier am I right now?" view for the request the Inspector is
 * itself making.
 */

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineSkeleton } from "@/components/shared/query_status";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { AgentBadge } from "@/components/shared/agent_badge";
import { useSession } from "@/hooks/use_infra";
import type {
  SessionAttestationFormat,
  SessionAttestationFailureReason,
  SessionAttestationOutcome,
  SessionAttribution,
} from "@/api/endpoints/session";
import type { AgentAttributionTier } from "@/types/api";

const FORMAT_LABEL: Record<SessionAttestationFormat, string> = {
  "apple-secure-enclave": "Apple Secure Enclave",
  "webauthn-packed": "WebAuthn (packed)",
  tpm2: "TPM 2.0",
  unknown: "(none supplied)",
};

const FAILURE_REASON_LABEL: Record<SessionAttestationFailureReason, string> = {
  not_present: "No attestation envelope was supplied (cnf.attestation absent).",
  unsupported_format:
    "Envelope used an attestation format this server does not yet verify.",
  key_binding_failed:
    "Attested public key did not match the AAuth signing key thumbprint.",
  challenge_mismatch:
    "Attestation challenge did not match the expected iss|sub|iat|jkt binding.",
  chain_invalid:
    "X.509 / certificate chain validation against trusted roots failed.",
  signature_invalid:
    "Attestation signature did not verify against the leaf credential.",
  not_implemented:
    "Verifier for this format is still a stub (scheduled for a follow-up release).",
  malformed: "Envelope was structurally invalid (missing fields or bad encoding).",
  aaguid_not_trusted:
    "Authenticator AAGUID is not on the server trust list.",
  pubarea_mismatch:
    "TPM public area did not match the expected key parameters.",
};

const ALLOWLIST_LABEL: Record<"issuer" | "issuer_subject", string> = {
  issuer: "Issuer (NEOTOMA_OPERATOR_ATTESTED_ISSUERS)",
  issuer_subject: "Issuer:Subject (NEOTOMA_OPERATOR_ATTESTED_SUBS)",
};

function attestationOutcome(
  attribution: SessionAttribution | undefined,
): SessionAttestationOutcome | null {
  const candidate = attribution?.decision?.attestation;
  if (!candidate) return null;
  return candidate as SessionAttestationOutcome;
}

function attestationStatusText(outcome: SessionAttestationOutcome | null): {
  label: string;
  tone: "verified" | "absent" | "failed";
} {
  if (!outcome) {
    return { label: "Not present", tone: "absent" };
  }
  if (outcome.verified) {
    return { label: "Verified", tone: "verified" };
  }
  if (outcome.reason === "not_present") {
    return { label: "Not present", tone: "absent" };
  }
  return { label: "Failed", tone: "failed" };
}

const TONE_CLASSNAME: Record<"verified" | "absent" | "failed", string> = {
  verified:
    "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-700",
  absent:
    "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
  failed:
    "bg-rose-100 text-rose-900 ring-1 ring-rose-300 dark:bg-rose-900/30 dark:text-rose-200 dark:ring-rose-700",
};

export function SessionAttestationCard() {
  const session = useSession();
  const attribution = session.data?.attribution;
  const decision = attribution?.decision ?? null;
  const outcome = attestationOutcome(attribution);
  const status = attestationStatusText(outcome);
  const tier = (attribution?.tier as AgentAttributionTier | undefined) ?? "anonymous";
  const allowlistSource = decision?.operator_allowlist_source ?? null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Current Session Attestation</CardTitle>
          {showBackgroundQueryRefresh(session) ? <QueryRefreshIndicator /> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {showInitialQuerySkeleton(session) ? (
          <div className="space-y-2">
            <InlineSkeleton className="h-4 w-full max-w-xs" />
            <InlineSkeleton className="h-4 w-full max-w-sm" />
          </div>
        ) : !session.data ? (
          <span className="text-muted-foreground">
            Unable to fetch session diagnostics.
          </span>
        ) : (
          <>
            <Row label="Resolved tier">
              <AgentBadge
                attribution={{
                  attribution_tier: tier,
                  client_name: attribution?.client_name,
                  client_version: attribution?.client_version,
                  agent_sub: attribution?.agent_sub,
                  agent_thumbprint: attribution?.agent_thumbprint,
                }}
              />
            </Row>
            <Row label="Signature">
              <span className="text-xs">
                {decision?.signature_present === false
                  ? "Not present"
                  : decision?.signature_verified === true
                    ? "Verified"
                    : decision?.signature_error_code
                      ? `Failed (${decision.signature_error_code})`
                      : "Unknown"}
              </span>
            </Row>
            <Row label="Attestation">
              <span
                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${TONE_CLASSNAME[status.tone]}`}
                title={
                  outcome && !outcome.verified
                    ? FAILURE_REASON_LABEL[outcome.reason]
                    : undefined
                }
              >
                {status.label}
              </span>
            </Row>
            {outcome ? (
              <Row label="Format">
                <span className="text-xs font-mono">
                  {FORMAT_LABEL[outcome.format]}
                </span>
              </Row>
            ) : null}
            {outcome && !outcome.verified ? (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                <span className="font-medium">Reason:</span>{" "}
                {FAILURE_REASON_LABEL[outcome.reason]}
              </p>
            ) : null}
            {allowlistSource ? (
              <Row label="Operator allowlist">
                <span className="text-xs">{ALLOWLIST_LABEL[allowlistSource]}</span>
              </Row>
            ) : null}
            <p className="border-t pt-3 text-xs text-muted-foreground">
              Tier resolution cascade: verified attestation envelope →{" "}
              <code>hardware</code>; operator allowlist hit →{" "}
              <code>operator_attested</code>; otherwise →{" "}
              <code>software</code>. See{" "}
              <code className="font-mono">docs/subsystems/aauth_attestation.md</code>.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  );
}
