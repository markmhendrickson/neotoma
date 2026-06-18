/**
 * Compact rendering of the agent attribution stamped on a Neotoma record.
 *
 * Shows a coloured trust-tier pill plus the best available label
 * (client name → agent subject → thumbprint → "anonymous"). The full
 * provenance block is exposed via a tooltip so curious humans can inspect
 * the raw identity without cluttering table rows.
 *
 * Used by Observation / Relationship / Source / TimelineEvent / Interpretation
 * list views and the Agent filter introduced in Phase 1.11.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  AgentAttestationOutcome,
  AgentAttribution,
  AgentAttributionTier,
} from "@/types/api";

/**
 * Extract an {@link AgentAttribution} from a row's `provenance` blob. Returns
 * `null` when the blob is missing or carries no attribution keys — callers
 * render "unattributed" for this case.
 */
export function extractAgentAttribution(
  provenance: Record<string, unknown> | undefined | null
): AgentAttribution | null {
  if (!provenance || typeof provenance !== "object") return null;
  const p = provenance as Record<string, unknown>;
  const any =
    p.agent_public_key ||
    p.agent_thumbprint ||
    p.agent_sub ||
    p.client_name ||
    p.attribution_tier ||
    p.connection_id;
  if (!any) return null;
  const tier =
    typeof p.attribution_tier === "string"
      ? (p.attribution_tier as AgentAttributionTier)
      : undefined;
  const operatorSource =
    p.operator_allowlist_source === "issuer" ||
    p.operator_allowlist_source === "issuer_subject"
      ? p.operator_allowlist_source
      : null;
  return {
    agent_public_key:
      typeof p.agent_public_key === "string" ? p.agent_public_key : undefined,
    agent_thumbprint:
      typeof p.agent_thumbprint === "string" ? p.agent_thumbprint : undefined,
    agent_algorithm:
      typeof p.agent_algorithm === "string" ? p.agent_algorithm : undefined,
    agent_sub: typeof p.agent_sub === "string" ? p.agent_sub : undefined,
    agent_iss: typeof p.agent_iss === "string" ? p.agent_iss : undefined,
    client_name:
      typeof p.client_name === "string" ? p.client_name : undefined,
    client_version:
      typeof p.client_version === "string" ? p.client_version : undefined,
    connection_id:
      typeof p.connection_id === "string" ? p.connection_id : undefined,
    attribution_tier: tier,
    attributed_at:
      typeof p.attributed_at === "string" ? p.attributed_at : undefined,
    attestation: extractAttestationOutcome(p.attestation),
    operator_allowlist_source: operatorSource,
  };
}

/**
 * Read an attestation outcome blob off provenance defensively. Returns
 * `null` when the field is absent or malformed; we never throw because
 * provenance is third-party data and the badge needs to keep rendering.
 */
function extractAttestationOutcome(
  raw: unknown
): AgentAttestationOutcome | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.verified !== "boolean") return null;
  return {
    verified: r.verified,
    format:
      r.format === "apple-secure-enclave" ||
      r.format === "webauthn-packed" ||
      r.format === "tpm2"
        ? r.format
        : null,
    reason: typeof r.reason === "string" ? (r.reason as never) : null,
    aaguid: typeof r.aaguid === "string" ? r.aaguid : null,
    key_binding_matches_cnf_jwk:
      typeof r.key_binding_matches_cnf_jwk === "boolean"
        ? r.key_binding_matches_cnf_jwk
        : null,
    challenge_digest:
      typeof r.challenge_digest === "string" ? r.challenge_digest : null,
    chain: Array.isArray(r.chain)
      ? (r.chain as AgentAttestationOutcome["chain"])
      : null,
  };
}

/**
 * Human-readable label for an attribution record, used both inside the
 * badge and as the sort/filter key in tables.
 *
 * Priority: `client_name` (+ version) → `agent_sub` → shortened thumbprint
 * → "Anonymous".
 */
export function getAttributionLabel(
  attribution: AgentAttribution | null | undefined
): string {
  if (!attribution) return "Anonymous";
  if (attribution.client_name) {
    return attribution.client_version
      ? `${attribution.client_name} ${attribution.client_version}`
      : attribution.client_name;
  }
  if (attribution.agent_sub) return attribution.agent_sub;
  if (attribution.agent_thumbprint) {
    return `key:${attribution.agent_thumbprint.slice(0, 10)}`;
  }
  return "Anonymous";
}

/**
 * Canonical identifier for filter / group-by operations. Prefers the
 * thumbprint (stable across sessions when AAuth is in use), then the JWT
 * subject, then the client name. Returns `null` for anonymous rows so
 * callers can bucket them together.
 */
export function getAttributionKey(
  attribution: AgentAttribution | null | undefined
): string | null {
  if (!attribution) return null;
  if (attribution.agent_thumbprint) return `thumb:${attribution.agent_thumbprint}`;
  if (attribution.agent_sub) return `sub:${attribution.agent_sub}`;
  if (attribution.client_name) {
    return attribution.client_version
      ? `name:${attribution.client_name}@${attribution.client_version}`
      : `name:${attribution.client_name}`;
  }
  return null;
}

/**
 * Tier → colour + label mapping. Keep tier names short (single word) because
 * the badge sits inside dense tables; the long descriptions live in the
 * tooltip.
 */
const TIER_VISUAL: Record<
  AgentAttributionTier,
  { label: string; className: string; description: string }
> = {
  hardware: {
    label: "Hardware",
    className:
      "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-700",
    description:
      "AAuth-verified with a cryptographically attested hardware-backed key (Secure Enclave / TPM / YubiKey).",
  },
  operator_attested: {
    label: "Operator-attested",
    className:
      "bg-teal-100 text-teal-900 ring-1 ring-teal-300 dark:bg-teal-900/30 dark:text-teal-200 dark:ring-teal-700",
    description:
      "AAuth-verified, and this issuer (or issuer:subject) is in the operator-managed allowlist.",
  },
  software: {
    label: "Software",
    className:
      "bg-sky-100 text-sky-900 ring-1 ring-sky-300 dark:bg-sky-900/30 dark:text-sky-200 dark:ring-sky-700",
    description: "AAuth-verified with a software-only key.",
  },
  unverified_client: {
    label: "Self-reported",
    className:
      "bg-amber-100 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700",
    description:
      "Client name and version from MCP `initialize.clientInfo`. Self-reported, not cryptographically verified.",
  },
  anonymous: {
    label: "Anonymous",
    className:
      "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
    description:
      "No identifying information on this write (no AAuth, no meaningful clientInfo).",
  },
};

export interface AgentAttributionTooltipBodyProps {
  /** Null or partial objects still render the anonymous tier explainer. */
  attribution: AgentAttribution | null;
}

/**
 * Rich tooltip / panel body listing every surfaced write-path identity field
 * (tier, thumbprint, public key, JWT claims, clientInfo, attestation, etc.).
 * Shared by {@link AgentBadge} and issue views that show a plain GitHub-style
 * `by …` line but need the same drill-down as tables.
 */
export function AgentAttributionTooltipBody({
  attribution,
}: AgentAttributionTooltipBodyProps) {
  const tier: AgentAttributionTier =
    attribution?.attribution_tier ?? "anonymous";
  const visual = TIER_VISUAL[tier];
  const label = getAttributionLabel(attribution);

  const att = attribution?.attestation ?? null;
  const tooltipRows: Array<[string, string | undefined]> = [
    ["Tier", visual.label],
    ["Agent", label],
    ["Algorithm", attribution?.agent_algorithm],
    ["Thumbprint", attribution?.agent_thumbprint],
    ["Public key", attribution?.agent_public_key],
    ["Subject", attribution?.agent_sub],
    ["Issuer", attribution?.agent_iss],
    ["Client", attribution?.client_name],
    ["Version", attribution?.client_version],
    ["Connection", attribution?.connection_id],
    ["Stamped at", attribution?.attributed_at],
    [
      "Operator allowlist",
      attribution?.operator_allowlist_source === "issuer_subject"
        ? "iss + sub"
        : attribution?.operator_allowlist_source === "issuer"
          ? "iss"
          : undefined,
    ],
    ["Attestation", att ? (att.verified ? "verified" : "failed") : undefined],
    ["Attestation format", att?.format ?? undefined],
    ["AAGUID / model", att?.aaguid ?? undefined],
    [
      "Key binding",
      att?.key_binding_matches_cnf_jwk == null
        ? undefined
        : att.key_binding_matches_cnf_jwk
          ? "matches cnf.jwk"
          : "mismatch",
    ],
    [
      "Challenge",
      att?.challenge_digest
        ? `${att.challenge_digest.slice(0, 16)}…`
        : undefined,
    ],
    ["Failure reason", att?.reason ?? undefined],
  ];

  return (
    <div className="space-y-1 text-xs">
      <p className="font-medium">{visual.label}</p>
      <p className="text-muted-foreground">{visual.description}</p>
      <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-2 gap-y-0.5">
        {tooltipRows
          .filter(([, value]) => !!value)
          .map(([key, value]) => (
            <React.Fragment key={key}>
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="break-all font-mono">{value}</dd>
            </React.Fragment>
          ))}
      </dl>
    </div>
  );
}

export interface AgentBadgeProps {
  /**
   * Either a raw provenance object (we will extract attribution) or an
   * already-extracted {@link AgentAttribution}. Passing the raw blob is
   * convenient inside table cells; passing the extracted value avoids
   * repeated parsing on detail pages.
   */
  provenance?: Record<string, unknown> | null;
  attribution?: AgentAttribution | null;
  /** When true, omit the label and show only the tier pill. */
  iconOnly?: boolean;
  className?: string;
}

export function AgentBadge({
  provenance,
  attribution: explicitAttribution,
  iconOnly = false,
  className,
}: AgentBadgeProps) {
  const attribution = React.useMemo(
    () => explicitAttribution ?? extractAgentAttribution(provenance),
    [explicitAttribution, provenance]
  );
  const tier: AgentAttributionTier =
    attribution?.attribution_tier ?? "anonymous";
  const visual = TIER_VISUAL[tier];
  const label = getAttributionLabel(attribution);

  const trigger = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        visual.className,
        className
      )}
    >
      <span aria-hidden="true">{tierIcon(tier)}</span>
      {!iconOnly && (
        <span className="max-w-[16ch] truncate" title={label}>
          {label}
        </span>
      )}
    </span>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <AgentAttributionTooltipBody attribution={attribution} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Short, decorative glyph for the tier. Uses text characters rather than
 * icon fonts because the badge shows up in narrow table columns and we
 * want it zero-dependency.
 *
 * Exported (test-only) so the deterministic tier → glyph mapping can be
 * pinned in a unit test without spinning up the DOM.
 */
export function tierIcon(tier: AgentAttributionTier): string {
  switch (tier) {
    case "hardware":
      return "◆";
    case "operator_attested":
      // Half-filled diamond — visually between hardware (filled) and
      // software (outlined) so a quick scan reads the trust ladder
      // without needing to read the label.
      return "◈";
    case "software":
      return "◇";
    case "unverified_client":
      return "●";
    case "anonymous":
    default:
      return "○";
  }
}
