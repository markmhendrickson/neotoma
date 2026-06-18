/**
 * Agent grant detail / edit view.
 *
 * Editing flows through the same shared `AgentGrantForm`. Status
 * transitions (suspend / revoke / restore) are exposed as dedicated
 * buttons because the server tracks them as explicit observations.
 */

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageShell } from "@/components/layout/page_shell";
import {
  DetailPageSkeleton,
  QueryErrorAlert,
} from "@/components/shared/query_status";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AgentGrantForm } from "@/components/agents/agent_grant_form";
import { formatDate } from "@/lib/utils";
import {
  useAgentGrant,
  useSetAgentGrantStatus,
  useUpdateAgentGrant,
} from "@/hooks/use_agents";
import type { AgentGrantStatus, AgentGrantUpdateRequest } from "@/types/api";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";

function statusBadgeVariant(
  status: AgentGrantStatus,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "active":
      return "default";
    case "suspended":
      return "secondary";
    case "revoked":
      return "destructive";
    default:
      return "outline";
  }
}

export default function AgentGrantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const grantId = id ?? "";

  const grantQ = useAgentGrant(grantId);
  const updateMutation = useUpdateAgentGrant(grantId);
  const statusMutation = useSetAgentGrantStatus(grantId);

  const [updateError, setUpdateError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  if (showInitialQuerySkeleton(grantQ)) {
    return (
      <PageShell title="Agent grant">
        <DetailPageSkeleton />
      </PageShell>
    );
  }

  if (grantQ.error) {
    return (
      <PageShell title="Agent grant">
        <QueryErrorAlert title="Could not load grant">
          {grantQ.error.message}
        </QueryErrorAlert>
      </PageShell>
    );
  }

  if (!grantQ.data) {
    return (
      <PageShell title="Agent grant">
        <div className="text-muted-foreground">Grant not found.</div>
      </PageShell>
    );
  }

  const grant = grantQ.data.grant;
  const status: AgentGrantStatus = grant.status;

  async function handleUpdate(payload: AgentGrantUpdateRequest) {
    setUpdateError(null);
    try {
      await updateMutation.mutateAsync(payload);
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : "Failed to update grant");
    }
  }

  async function handleSetStatus(next: "active" | "suspended" | "revoked") {
    setStatusError(null);
    try {
      await statusMutation.mutateAsync(next);
    } catch (err) {
      setStatusError(
        err instanceof Error ? err.message : "Failed to change grant status",
      );
    }
  }

  return (
    <PageShell
      title={grant.label}
      description={
        <span>
          Edit the grant in place; status transitions are tracked as
          explicit observations on this <code className="font-mono">agent_grant</code>{" "}
          entity. Identity changes are picked up by AAuth admission within
          one cache TTL.
        </span>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {showBackgroundQueryRefresh(grantQ) ? <QueryRefreshIndicator /> : null}
          <Button asChild variant="ghost" size="sm">
            <Link to="/agents/grants">
              <ArrowLeft className="mr-1 h-4 w-4" />
              All grants
            </Link>
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Identity &amp; capabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <AgentGrantForm
              initial={grant}
              submitLabel="Save changes"
              isSubmitting={updateMutation.isPending}
              errorMessage={updateError}
              onSubmit={(payload) => handleUpdate(payload as AgentGrantUpdateRequest)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Status</CardTitle>
            <Badge variant={statusBadgeVariant(status)}>{status}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
              <div className="contents">
                <dt className="text-muted-foreground">Grant ID</dt>
                <dd className="break-all font-mono">{grant.grant_id}</dd>
              </div>
              <div className="contents">
                <dt className="text-muted-foreground">Owner user</dt>
                <dd className="break-all font-mono">{grant.user_id}</dd>
              </div>
              <div className="contents">
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDate(grant.created_at ?? undefined)}</dd>
              </div>
              <div className="contents">
                <dt className="text-muted-foreground">Last used</dt>
                <dd>{formatDate(grant.last_used_at ?? undefined)}</dd>
              </div>
              <div className="contents">
                <dt className="text-muted-foreground">Last observation</dt>
                <dd>{formatDate(grant.last_observation_at ?? undefined)}</dd>
              </div>
              {grant.import_source && (
                <div className="contents">
                  <dt className="text-muted-foreground">Import source</dt>
                  <dd>
                    <Badge variant="outline">{grant.import_source}</Badge>
                  </dd>
                </div>
              )}
            </dl>

            <Separator />

            <div className="grid gap-2">
              {status !== "active" && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={statusMutation.isPending}
                  onClick={() => handleSetStatus("active")}
                >
                  Restore to active
                </Button>
              )}
              {status === "active" && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={statusMutation.isPending}
                  onClick={() => handleSetStatus("suspended")}
                >
                  Suspend
                </Button>
              )}
              {status !== "revoked" && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={statusMutation.isPending}
                  onClick={() => handleSetStatus("revoked")}
                >
                  Revoke
                </Button>
              )}
            </div>
            {statusError && (
              <p className="text-sm text-destructive" role="alert">
                {statusError}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
