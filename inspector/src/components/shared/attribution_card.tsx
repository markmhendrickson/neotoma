/**
 * Structured card-style rendering of agent attribution.
 *
 * Complements {@link AgentBadge}: the badge is compact enough for table
 * cells, this card surfaces the entire {@link AgentAttribution} block as a
 * definition list so humans can inspect provenance on detail pages without
 * squinting at a tooltip or pressing "expand JSON".
 *
 * The card degrades gracefully:
 *   - When no attribution keys are present, renders a muted "anonymous"
 *     placeholder (so it is still a visible element on the page rather
 *     than silently disappearing).
 *   - When a subset of keys is available, only those rows are rendered.
 *
 * Used on entity detail, source detail, and relationship detail pages and
 * reusable wherever we want a "who wrote this?" panel.
 */

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentBadge, extractAgentAttribution } from "./agent_badge";
import type { AgentAttribution } from "@/types/api";

export interface AttributionCardProps {
  /**
   * Either a raw provenance blob (the card extracts attribution) or an
   * already-extracted attribution object. Passing the raw blob is
   * convenient when the caller did not pre-parse.
   */
  provenance?: Record<string, unknown> | null;
  attribution?: AgentAttribution | null;
  /** Optional heading; defaults to "Agent attribution". */
  title?: string;
  /** Optional one-line hint shown below the heading. */
  description?: React.ReactNode;
  className?: string;
}

export function AttributionCard({
  provenance,
  attribution: explicitAttribution,
  title = "Agent attribution",
  description,
  className,
}: AttributionCardProps) {
  const attribution = React.useMemo(
    () => explicitAttribution ?? extractAgentAttribution(provenance),
    [explicitAttribution, provenance]
  );

  const rows: Array<[string, string | undefined]> = [
    ["Tier", attribution?.attribution_tier],
    ["Client", attribution?.client_name],
    ["Version", attribution?.client_version],
    ["Agent subject", attribution?.agent_sub],
    ["Agent issuer", attribution?.agent_iss],
    ["Algorithm", attribution?.agent_algorithm],
    ["Thumbprint", attribution?.agent_thumbprint],
    ["Public key", attribution?.agent_public_key],
    ["Connection", attribution?.connection_id],
    ["Stamped at", attribution?.attributed_at],
  ];
  const visibleRows = rows.filter(([, value]) => !!value);

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <AgentBadge attribution={attribution} />
      </CardHeader>
      <CardContent>
        {visibleRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No agent attribution recorded for this record. Writes made
            before AAuth was enabled or with generic <code>clientInfo</code>
            collapse to the <em>anonymous</em> tier.
          </p>
        ) : (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
            {visibleRows.map(([key, value]) => (
              <React.Fragment key={key}>
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="break-all font-mono text-xs">{value}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
