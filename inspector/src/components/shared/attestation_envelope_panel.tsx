/**
 * Collapsible drill-down panel for the attestation envelope attached to
 * a single agent. Renders next to the agent's identity card on the
 * agent detail page so operators can inspect *why* a tier resolved the
 * way it did without log-spelunking.
 *
 * Conditional render: returns `null` when no attestation outcome is
 * available — today this is every agent (the v0.8.0 server only stamps
 * `decision.attestation` at the `/session` boundary, not per-row), so
 * the panel stays dormant. v0.9.0 / FU-1 server enrichment can start
 * stamping `AgentDirectoryEntry.attestation` and the panel will light
 * up automatically with no Inspector release required.
 *
 * Sections:
 * - Header: format discriminator + verified/failed badge.
 * - Trust gates: chain trust, key-binding match, challenge match.
 * - Chain summary: leaf → root subject/issuer rows.
 * - Failure reason badge when `verified === false`.
 * - "Show raw" toggle exposing the full envelope JSON.
 */

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import type {
  AgentAttestationOutcome,
  AttestationFailureReason,
  AttestationFormat,
} from "@/types/api";

const FORMAT_LABEL: Record<AttestationFormat, string> = {
  "apple-secure-enclave": "Apple Secure Enclave",
  "webauthn-packed": "WebAuthn (packed)",
  tpm2: "TPM 2.0",
};

const REASON_LABEL: Record<AttestationFailureReason, string> = {
  format_unsupported: "Format unsupported",
  challenge_mismatch: "Challenge mismatch",
  key_binding_mismatch: "Key binding mismatch",
  chain_invalid: "Chain invalid",
  signature_invalid: "Signature invalid",
  aaguid_not_trusted: "AAGUID not on trust list",
  pubarea_mismatch: "Public area mismatch",
  verifier_not_implemented: "Verifier not implemented",
  not_present: "No envelope on this agent",
};

export interface AttestationEnvelopePanelProps {
  attestation?: AgentAttestationOutcome | null;
  /**
   * Source of an `operator_attested` tier promotion when applicable —
   * surfaced alongside the envelope because operator allowlisting and
   * attestation verification are the two paths into elevated tiers and
   * users debugging tier resolution want both visible at once.
   */
  operatorAllowlistSource?: "issuer" | "issuer_subject" | null;
}

export function AttestationEnvelopePanel({
  attestation,
  operatorAllowlistSource,
}: AttestationEnvelopePanelProps) {
  const [showRaw, setShowRaw] = React.useState(false);

  if (!attestation && !operatorAllowlistSource) {
    return null;
  }

  if (!attestation) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span>Attestation envelope</span>
            <Badge variant="secondary">Operator-attested</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No cryptographic attestation envelope on this agent. Tier was
          promoted via the operator allowlist (
          {operatorAllowlistSource === "issuer_subject" ? "iss + sub" : "iss"}
          ).
        </CardContent>
      </Card>
    );
  }

  const verified = attestation.verified === true;
  const formatLabel = attestation.format
    ? FORMAT_LABEL[attestation.format]
    : "Unknown format";
  const reasonLabel = attestation.reason
    ? REASON_LABEL[attestation.reason] ?? attestation.reason
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>Attestation envelope</span>
          <Badge variant={verified ? "default" : "destructive"}>
            {verified ? "Verified" : "Failed"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Format</dt>
          <dd className="font-mono">{formatLabel}</dd>
          {attestation.aaguid && (
            <>
              <dt className="text-muted-foreground">AAGUID / model</dt>
              <dd className="break-all font-mono">{attestation.aaguid}</dd>
            </>
          )}
          {attestation.key_binding_matches_cnf_jwk != null && (
            <>
              <dt className="text-muted-foreground">Key binding</dt>
              <dd>
                {attestation.key_binding_matches_cnf_jwk ? (
                  <Badge variant="secondary">Matches cnf.jwk</Badge>
                ) : (
                  <Badge variant="destructive">Mismatch</Badge>
                )}
              </dd>
            </>
          )}
          {attestation.challenge_digest && (
            <>
              <dt className="text-muted-foreground">Challenge</dt>
              <dd className="break-all font-mono text-xs">
                {attestation.challenge_digest.slice(0, 32)}
                {attestation.challenge_digest.length > 32 ? "…" : ""}
              </dd>
            </>
          )}
          {operatorAllowlistSource && (
            <>
              <dt className="text-muted-foreground">Operator allowlist</dt>
              <dd>
                <Badge variant="outline">
                  {operatorAllowlistSource === "issuer_subject"
                    ? "iss + sub"
                    : "iss"}
                </Badge>
              </dd>
            </>
          )}
        </dl>

        {!verified && reasonLabel && (
          <div>
            <Badge variant="destructive">{reasonLabel}</Badge>
          </div>
        )}

        {attestation.chain && attestation.chain.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              Trust chain (leaf → root)
            </div>
            <ol className="space-y-1 text-xs">
              {attestation.chain.map((entry, idx) => (
                <li
                  key={`${entry.serial ?? idx}-${idx}`}
                  className="rounded border border-border/50 px-2 py-1"
                >
                  <div className="font-mono">
                    {entry.subject_cn ?? "(unknown subject)"}
                  </div>
                  <div className="text-muted-foreground">
                    issued by {entry.issuer_cn ?? "(unknown issuer)"}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div>
          <Button
            variant="ghost"
            size="sm"
            className="px-0"
            onClick={() => setShowRaw((prev) => !prev)}
            aria-expanded={showRaw}
          >
            <ChevronRight
              className={`mr-1 h-4 w-4 transition-transform ${
                showRaw ? "rotate-90" : ""
              }`}
            />
            {showRaw ? "Hide raw envelope" : "Show raw envelope"}
          </Button>
          {showRaw && (
            <pre
              data-testid="attestation-envelope-raw"
              className="mt-2 max-h-96 overflow-auto rounded bg-muted p-3 font-mono text-xs"
            >
              {JSON.stringify(attestation, null, 2)}
            </pre>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
