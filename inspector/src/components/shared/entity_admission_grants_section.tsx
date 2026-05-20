/**
 * Entity detail: grants whose capabilities include this entity's type.
 */

import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import {
  formatAgentGrantCapabilitiesLine,
  grantDerivedAgentKey,
  grantsForEntityType,
} from "@/lib/agent_grant_key";
import type { AgentGrant } from "@/types/api";

export function EntityAdmissionGrantsSection({
  entityType,
  entityId: _entityId,
  grants,
  grantsLoading,
  grantsError,
}: {
  entityType: string;
  entityId: string;
  grants: AgentGrant[];
  grantsLoading: boolean;
  grantsError: Error | null;
}) {
  void _entityId;
  const matched = grantsForEntityType(grants, entityType);

  return (
    <Card id="entity-admission-grants" className="scroll-mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Admission grants ({entityType})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <code className="text-[11px]">agent_grant</code> capabilities that include{" "}
          <code className="text-[11px]">{entityType}</code> or <code className="text-[11px]">*</code>. See also the{" "}
          <Link to={`/schemas/${encodeURIComponent(entityType)}#admission-grants`} className="text-primary hover:underline">
            schema page
          </Link>{" "}
          for the same list in schema context.
        </p>

        {grantsLoading ? (
          <InlineSkeleton className="h-16 w-full max-w-xl" />
        ) : grantsError ? (
          <QueryErrorAlert title="Could not load grants">{grantsError.message}</QueryErrorAlert>
        ) : matched.length === 0 ? (
          <p className="text-sm text-muted-foreground">No grants reference this entity type.</p>
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
