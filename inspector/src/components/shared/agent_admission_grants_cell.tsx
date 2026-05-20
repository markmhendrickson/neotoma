/**
 * Per–agent-directory row: admission grants whose identity matches this
 * agent_key (permission surface), not observation volume.
 */

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatAgentGrantCapabilitiesLine,
  grantsMatchingAgentKey,
} from "@/lib/agent_grant_key";
import type { AgentGrant } from "@/types/api";

export function AgentAdmissionGrantsCell({
  agentKey,
  grants,
}: {
  agentKey: string;
  grants: AgentGrant[];
}) {
  const matched = useMemo(() => grantsMatchingAgentKey(grants, agentKey), [grants, agentKey]);

  if (matched.length === 0) {
    const isAnonymous = agentKey === "anonymous";
    const triggerLabel = isAnonymous ? "—" : "None";
    const detail = isAnonymous
      ? "This row is the catch-all anonymous bucket: there is no thumbprint or JWT subject to match against agent_grant rows. Anonymous-tier writers can still appear when policy allows; grants are keyed to concrete identities."
      : "No agent_grant in this workspace matches this directory key (thumbprint or subject). That is normal for most activity: issues, conversations, and conversation messages are usually not admission-gated. Grants mainly authorize mutating protected governance types (for example agent_grant entities) for agents that would otherwise be rejected on those paths.";
    return (
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help border-b border-dotted border-muted-foreground/35 text-muted-foreground text-sm">
              {triggerLabel}
            </span>
          </TooltipTrigger>
          <TooltipContent side="left" align="start" className="max-w-sm text-xs leading-relaxed">
            {detail}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const shown = matched.slice(0, 3);
  const overflow = matched.length - shown.length;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-wrap gap-1 max-w-[220px] cursor-help">
            {shown.map((g) => (
              <Badge
                key={g.grant_id}
                variant={g.status === "active" ? "secondary" : "outline"}
                className="max-w-[130px] truncate font-normal text-xs"
                title={`${g.label} (${g.status})`}
              >
                {g.label}
              </Badge>
            ))}
            {overflow > 0 ? (
              <Badge variant="outline" className="font-normal text-xs">
                +{overflow}
              </Badge>
            ) : null}
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" align="start" collisionPadding={16} className="max-w-md p-0">
          <div className="border-b bg-popover px-3 py-2">
            <p className="text-xs font-medium">Admission grants for this identity</p>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">
              These rows are <strong className="font-medium text-foreground">capabilities</strong>{" "}
              (allowed ops and entity types), not counts of writes. Match is by grant thumbprint or
              subject vs this directory <code className="text-[11px]">agent_key</code>.
            </p>
          </div>
          <ul className="max-h-[min(50vh,16rem)] overflow-y-auto overscroll-contain space-y-2 px-3 py-2 text-xs">
            {matched.map((g) => (
              <li key={g.grant_id} className="border-b border-border/60 pb-2 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{g.label}</span>
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {g.status}
                  </Badge>
                  {g.linked_github_login && (
                    <a
                      href={`https://github.com/${g.linked_github_login}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      @{g.linked_github_login}
                    </a>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground break-all">
                  {formatAgentGrantCapabilitiesLine(g)}
                </p>
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
