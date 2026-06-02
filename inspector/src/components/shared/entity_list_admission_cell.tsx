/**
 * Entities table: how many admission grants list this row's entity_type
 * (or "*") in their capabilities.
 */

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { grantsForEntityType } from "@/lib/agent_grant_key";
import type { AgentGrant, EntitySnapshot } from "@/types/api";

export function EntityListAdmissionCell({
  row,
  grants,
}: {
  row: EntitySnapshot;
  grants: AgentGrant[];
}) {
  const et = row.entity_type;
  const matched = grantsForEntityType(grants, et);
  const n = matched.length;

  if (n === 0) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help border-b border-dotted border-muted-foreground/35 text-sm tabular-nums">
            {n}
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-sm text-xs">
          <p className="font-medium mb-1">{n} grant{ n === 1 ? "" : "s"} reference {et}</p>
          <ul className="space-y-1 text-muted-foreground">
            {matched.map((g) => (
              <li key={g.grant_id} className="truncate" title={g.label}>
                {g.label} <span className="opacity-70">({g.status})</span>
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
