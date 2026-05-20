import { useMemo } from "react";
import { isApiUrlConfigured, MISSING_API_URL_MESSAGE } from "@/api/client";
import { useUsage } from "@/hooks/use_usage";
import { PageShell } from "@/components/layout/page_shell";
import { QueryErrorAlert } from "@/components/shared/query_status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { showInitialQuerySkeleton } from "@/lib/query_loading";
import { formatDate } from "@/lib/utils";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function UsagePage() {
  const usage = useUsage();
  const u = usage.data;

  const entityTypeChartData = useMemo(() => {
    if (!u) return [];
    return Object.entries(u.entities_by_type)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([type, count]) => ({ type, count }));
  }, [u]);

  const observationSourceChartData = useMemo(() => {
    if (!u) return [];
    return Object.entries(u.observations_by_source)
      .sort(([, a], [, b]) => b - a)
      .map(([source, count]) => ({ source, count }));
  }, [u]);

  if (!isApiUrlConfigured()) {
    return (
      <PageShell title="Usage">
        <QueryErrorAlert title="API URL not configured">
          {MISSING_API_URL_MESSAGE}
        </QueryErrorAlert>
      </PageShell>
    );
  }

  if (showInitialQuerySkeleton(usage)) {
    return (
      <PageShell title="Usage">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="mt-4">
          <CardHeader>
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (usage.isError) {
    return (
      <PageShell title="Usage">
        <QueryErrorAlert title="Failed to load usage statistics">
          {String(usage.error)}
        </QueryErrorAlert>
      </PageShell>
    );
  }

  const schemaCoverage =
    u && u.entity_types_total > 0
      ? Math.round((u.entity_types_with_schema / u.entity_types_total) * 100)
      : 0;

  return (
    <PageShell
      title="Usage"
      meta={
        u ? (
          <div className="flex items-center gap-2">
            <QueryRefreshIndicator />
            <span className="text-xs text-muted-foreground">
              Updated {formatDate(u.last_updated)}
            </span>
          </div>
        ) : undefined
      }
    >
      {/* Summary stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Entities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{u?.total_entities ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {u?.entity_types_total ?? 0} entity type{u?.entity_types_total !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Observations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{u?.total_observations ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{u?.entities_created_last_7_days ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              entities last 7 days
            </p>
            <p className="text-xs text-muted-foreground">
              {u?.entities_created_last_30_days ?? 0} last 30 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Schema Coverage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{schemaCoverage}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {u?.entity_types_with_schema ?? 0} of {u?.entity_types_total ?? 0} types registered
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Entities by type chart */}
      {entityTypeChartData.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Entities by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={entityTypeChartData} margin={{ top: 4, right: 16, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="type"
                  tick={{ fontSize: 11 }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <RechartsTooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Observations by source chart */}
      {observationSourceChartData.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Observations by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={observationSourceChartData}
                margin={{ top: 4, right: 16, left: 0, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="source"
                  tick={{ fontSize: 11 }}
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <RechartsTooltip />
                <Bar dataKey="count" fill="hsl(var(--secondary-foreground))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {u && u.total_entities === 0 && u.total_observations === 0 && (
        <Card className="mt-4">
          <CardContent className="py-8 text-center text-muted-foreground">
            No data yet. Start ingesting entities to see usage statistics.
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
