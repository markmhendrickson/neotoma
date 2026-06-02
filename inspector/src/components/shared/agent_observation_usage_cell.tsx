/**
 * Compact badges for observation volume by target `entity_type`, with a
 * tooltip listing the full breakdown (Agents directory column).
 */

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AgentDirectoryEntry } from "@/types/api";

const HIGHLIGHT_ENTITY_TYPES: readonly [string, string][] = [
  ["product_feedback", "Feedback"],
  ["agent_grant", "Grants"],
  ["issue", "Issues"],
];

export function AgentObservationUsageCell({ agent }: { agent: AgentDirectoryEntry }) {
  const counts = agent.observation_entity_type_counts;
  if (!counts || Object.keys(counts).length === 0) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  const typedEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const highlights = HIGHLIGHT_ENTITY_TYPES.map(([et, label]) => {
    const n = counts[et];
    if (!n) return null;
    const title = `${n} observation${n === 1 ? "" : "s"} on ${et} entities (new observations for that entity type attributed to this agent)`;
    return (
      <Badge key={et} variant="outline" className="font-normal shrink-0" title={title}>
        {label}: {n}
      </Badge>
    );
  }).filter(Boolean);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-wrap gap-1 max-w-[240px] cursor-help">
            {highlights.length > 0 ? (
              highlights
            ) : (
              <Badge variant="secondary" className="font-normal">
                {typedEntries.length} type{typedEntries.length === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="left"
          align="start"
          collisionPadding={16}
          className="max-w-md p-0"
        >
          <div className="border-b bg-popover px-3 py-2">
            <p className="text-xs font-medium">Observation count by target entity type</p>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">
              Each value is how many <strong className="font-medium text-foreground">observation</strong>{" "}
              rows this agent stamped for entities of that <code className="text-[11px]">entity_type</code>{" "}
              (history can add multiple observations per entity).
            </p>
          </div>
          <div className="max-h-[min(55vh,18rem)] overflow-y-auto overscroll-contain px-3 py-2">
            <ul className="space-y-0.5 text-xs">
              {typedEntries.map(([type, n]) => (
                <li key={type} className="flex justify-between gap-4 font-mono leading-tight">
                  <span className="min-w-0 flex-1 text-muted-foreground break-all" title={type}>
                    {type}
                  </span>
                  <span className="tabular-nums shrink-0 text-foreground">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
