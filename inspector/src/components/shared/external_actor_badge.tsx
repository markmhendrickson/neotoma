/**
 * External actor provenance badge for the Inspector.
 *
 * Displays the GitHub actor from `observations.provenance.external_actor`
 * with a colour-coded verification pill and tooltip showing provenance
 * detail (verified_via, delivery_id, attesting_aauth_thumbprint, etc.).
 */

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface ExternalActorData {
  provider: string;
  login: string;
  id: number;
  type?: string;
  verified_via?: string;
  delivery_id?: string;
  event_type?: string;
  repository?: string;
  event_id?: number;
  comment_id?: number;
  linked_neotoma_user_id?: string;
  attesting_aauth_thumbprint?: string;
  provenance_warning?: string;
}

const VERIFIED_VIA_CONFIG = {
  claim: {
    label: "claim",
    color: "bg-muted text-muted-foreground",
    description: "Self-reported in payload.",
  },
  linked_attestation: {
    label: "attested",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    description: "Carried in submitter agent_token claim, verified via AAuth signature.",
  },
  oauth_link: {
    label: "OAuth",
    color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
    description: "Linked on this install via GitHub OAuth.",
  },
  webhook_signature: {
    label: "webhook",
    color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
    description: "Verified GitHub webhook delivery.",
  },
} as const;

type VerifiedViaKey = keyof typeof VERIFIED_VIA_CONFIG;

function getVerifiedViaConfig(via: string | undefined) {
  const key: VerifiedViaKey =
    via !== undefined && via in VERIFIED_VIA_CONFIG ? (via as VerifiedViaKey) : "claim";
  return VERIFIED_VIA_CONFIG[key];
}

export function ExternalActorBadge({
  actor,
}: {
  actor: ExternalActorData;
}) {
  const viaConfig = getVerifiedViaConfig(actor.verified_via);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1.5 cursor-help">
            <a
              href={`https://github.com/${actor.login}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              @{actor.login}
            </a>
            <Badge
              variant="outline"
              className={`text-[10px] font-normal px-1.5 py-0 h-4 ${viaConfig.color}`}
            >
              {viaConfig.label}
            </Badge>
            {actor.provenance_warning && (
              <span className="text-destructive text-sm" title={actor.provenance_warning}>
                ⚠
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="max-w-sm space-y-2 text-xs">
          <div>
            <p className="font-medium">GitHub Actor</p>
            <p className="text-muted-foreground">
              {actor.login} ({actor.type ?? "User"}) · ID {actor.id}
            </p>
          </div>
          <div>
            <p className="font-medium">Verification</p>
            <p className="text-muted-foreground">{viaConfig.description}</p>
          </div>
          {actor.attesting_aauth_thumbprint && (
            <div>
              <p className="font-medium">Attesting AAuth Thumbprint</p>
              <p className="font-mono text-[10px] text-muted-foreground break-all">
                {actor.attesting_aauth_thumbprint}
              </p>
            </div>
          )}
          {actor.delivery_id && (
            <div>
              <p className="font-medium">Webhook Delivery</p>
              <p className="font-mono text-[10px] text-muted-foreground">
                {actor.delivery_id}
              </p>
            </div>
          )}
          {actor.repository && (
            <div>
              <p className="font-medium">Repository</p>
              <p className="text-muted-foreground">{actor.repository}</p>
            </div>
          )}
          {actor.linked_neotoma_user_id && (
            <div>
              <p className="font-medium">Linked Local User</p>
              <p className="font-mono text-[10px] text-muted-foreground">
                {actor.linked_neotoma_user_id}
              </p>
            </div>
          )}
          {actor.provenance_warning && (
            <div className="border-t pt-2">
              <p className="font-medium text-destructive">Warning</p>
              <p className="text-muted-foreground">{actor.provenance_warning}</p>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Extract the `external_actor` block from an observation's provenance JSON.
 */
export function extractExternalActor(
  provenance: Record<string, unknown> | string | null | undefined,
): ExternalActorData | null {
  if (!provenance) return null;
  let parsed: Record<string, unknown>;
  if (typeof provenance === "string") {
    try {
      parsed = JSON.parse(provenance);
    } catch {
      return null;
    }
  } else {
    parsed = provenance;
  }
  const actor = parsed.external_actor;
  if (!actor || typeof actor !== "object" || Array.isArray(actor)) return null;
  const a = actor as Record<string, unknown>;
  if (typeof a.login !== "string" || typeof a.id !== "number") return null;
  return a as unknown as ExternalActorData;
}
