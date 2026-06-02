/**
 * Lists agent_grant rows whose capabilities reference a schema entity_type
 * (or "*"), for schema detail and cross-navigation from the schemas table.
 */

import { Link } from "react-router-dom";
import { useAgentGrants } from "@/hooks/use_agents";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import {
  formatAgentGrantCapabilitiesLine,
  grantDerivedAgentKey,
  grantsForEntityType,
} from "@/lib/agent_grant_key";

export function SchemaAdmissionGrantsCard({ entityType }: { entityType: string }) {
  const grantsQ = useAgentGrants({ status: "all" });
  const grants = grantsQ.data?.grants ?? [];
  const matched = grantsForEntityType(grants, entityType);

  return (
    <Card id="admission-grants" className="mb-6 scroll-mt-4">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base">Admission grants</CardTitle>
        {showBackgroundQueryRefresh(grantsQ) ? <QueryRefreshIndicator /> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <code className="text-[11px]">agent_grant</code> capabilities that include this{" "}
          <code className="text-[11px]">{entityType}</code> in <code className="text-[11px]">entity_types</code>{" "}
          (or <code className="text-[11px]">*</code>). These gate permissioned operations for admitted agents;
          ordinary user-authenticated writes may still proceed without a grant for non-protected types.
        </p>

        {showInitialQuerySkeleton(grantsQ) ? (
          <InlineSkeleton className="h-20 w-full max-w-xl" />
        ) : grantsQ.error ? (
          <QueryErrorAlert title="Could not load grants">{grantsQ.error.message}</QueryErrorAlert>
        ) : matched.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No grants reference <span className="font-mono">{entityType}</span>. Add capabilities on an{" "}
            <code className="text-xs">agent_grant</code> entity if agents should be admitted for this type.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {matched.map((g) => {
              const key = grantDerivedAgentKey(g);
              const agentHref = key !== "anonymous" ? `/agents/${encodeURIComponent(key)}` : null;
              return (
                <li key={g.grant_id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3">
                  <span className="font-medium">{g.label}</span>
                  <Badge variant="outline" className="w-fit text-xs font-normal">
                    {g.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono break-all">
                    {g.match_thumbprint
                      ? `thumb:${g.match_thumbprint}`
                      : g.match_sub
                        ? `sub:${g.match_sub}${g.match_iss ? ` @ ${g.match_iss}` : ""}`
                        : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground w-full sm:flex-1 sm:min-w-[12rem]">
                    {formatAgentGrantCapabilitiesLine(g)}
                  </span>
                  {agentHref ? (
                    <Link to={agentHref} className="text-xs text-primary hover:underline shrink-0">
                      Agent directory →
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
