/**
 * GitHub-style `by {author}` line with a hover tooltip that layers Neotoma
 * write-path identity (AAuth / clientInfo) from entity snapshot provenance.
 */

import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AgentAttributionTooltipBody,
  extractAgentAttribution,
} from "./agent_badge";
import { ExternalActorBadge, extractExternalActor } from "./external_actor_badge";

export type IssueAuthorLineContext = "issue" | "message";

export interface IssueAuthorLineProps {
  /** Trigger label (e.g. issue reporter, or thread row role label like `User`). */
  author: string;
  provenance?: Record<string, unknown> | null;
  /** Merged onto the trigger span (defaults to dotted underline + cursor-help). */
  triggerClassName?: string;
  /**
   * `issue` — header line: `by {author}` and issue-oriented tooltip labels.
   * `message` — thread row: `{author}` only (same tooltip pattern as issue).
   */
  context?: IssueAuthorLineContext;
  /**
   * Underlying login shown in the tooltip when it differs from the trigger
   * (e.g. trigger `User` with underlying `octocat`). Defaults to `author`.
   */
  tooltipSnapshotAuthor?: string;
}

export function IssueAuthorLine({
  author,
  provenance,
  triggerClassName,
  context = "issue",
  tooltipSnapshotAuthor,
}: IssueAuthorLineProps) {
  const attribution = React.useMemo(
    () => extractAgentAttribution(provenance ?? null),
    [provenance],
  );
  const externalActor = React.useMemo(
    () => extractExternalActor(provenance ?? null),
    [provenance],
  );

  const snapshotLabel = context === "message" ? "Author:" : "Issue author:";
  const snapshotAuthor = (tooltipSnapshotAuthor ?? author).trim() || author;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={
              triggerClassName ??
              "cursor-help border-b border-dotted border-muted-foreground/40 hover:border-muted-foreground/70"
            }
          >
            {context === "issue" ? <>by {author}</> : <>{author}</>}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="max-w-lg max-h-[min(70vh,28rem)] overflow-y-auto"
        >
          <div className="space-y-3 text-xs">
            <p>
              <span className="text-muted-foreground">{snapshotLabel}</span>{" "}
              <span className="font-medium text-foreground break-all">{snapshotAuthor}</span>
            </p>
            {externalActor && (
              <div className="border-t border-border pt-2">
                <p className="font-semibold text-foreground mb-1.5">
                  GitHub actor (provenance)
                </p>
                <ExternalActorBadge actor={externalActor} />
              </div>
            )}
            <div className="border-t border-border pt-2">
              <p className="font-semibold text-foreground mb-1.5">Agent</p>
              <AgentAttributionTooltipBody attribution={attribution} />
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
