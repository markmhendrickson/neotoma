import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isApiUrlConfigured, MISSING_API_URL_MESSAGE } from "@/api/client";
import { useStats } from "@/hooks/use_stats";
import { useUsage } from "@/hooks/use_usage";
import { usePeersList } from "@/hooks/use_peers";
import { useHealthCheck, useServerInfo, useHealthCheckSnapshots } from "@/hooks/use_infra";
import { PageShell } from "@/components/layout/page_shell";
import { AttributionSummary } from "@/components/shared/attribution_summary";
import { TypeBadge } from "@/components/shared/type_badge";
import {
  QueryErrorAlert,
} from "@/components/shared/query_status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { entityTypeListPath } from "@/lib/entity_type_labels";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { formatDate } from "@/lib/utils";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { ChevronDown, ListFilter, Shield } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

/** Default number of entity types shown in the bar chart (by count, highest first). */
const CHART_DEFAULT_MAX_TYPES = 10;
const BADGE_DEFAULT_MAX_TYPES = 10;
const BADGE_INCREMENT = 10;

export default function DashboardPage() {
  const stats = useStats();
  const usage = useUsage();
  const peersList = usePeersList();
  const health = useHealthCheck();
  const serverInfo = useServerInfo();
  const snapshotHealth = useHealthCheckSnapshots();

  const s = stats.data;
  const u = usage.data;

  const typeEntries = useMemo(() => {
    if (!s) return [];
    return Object.entries(s.entities_by_type).sort(([, a], [, b]) => b - a);
  }, [s]);

  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(() => new Set());
  const [visibleTypeCount, setVisibleTypeCount] = useState(BADGE_DEFAULT_MAX_TYPES);

  useEffect(() => {
    if (!s) return;
    const sorted = Object.entries(s.entities_by_type).sort(([, a], [, b]) => b - a);
    const defaultSelection = new Set(
      sorted.slice(0, CHART_DEFAULT_MAX_TYPES).map(([type]) => type),
    );
    setSelectedTypes((prev) => {
      if (prev.size === 0) return defaultSelection;
      return prev;
    });
  }, [s]);

  const chartData = useMemo(
    () =>
      typeEntries
        .filter(([type]) => selectedTypes.has(type))
        .map(([type, count]) => ({ type, count })),
    [typeEntries, selectedTypes],
  );

  const visibleTypeEntries = useMemo(
    () => typeEntries.slice(0, visibleTypeCount),
    [typeEntries, visibleTypeCount],
  );
  const hasMoreTypeBadges = visibleTypeEntries.length < typeEntries.length;

  function toggleChartType(type: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function selectAllChartTypes() {
    if (!s) return;
    setSelectedTypes(new Set(Object.keys(s.entities_by_type)));
  }

  function clearChartTypes() {
    setSelectedTypes(new Set());
  }

  const selectedCount = selectedTypes.size;
  const chartTypesLabel =
    typeEntries.length === 0
      ? "Types"
      : selectedCount === 0
        ? "None selected"
        : selectedCount === typeEntries.length
          ? "All types"
          : `${selectedCount} of ${typeEntries.length} types`;

  const observationSourceChartData = useMemo(() => {
    if (!u) return [];
    return Object.entries(u.observations_by_source)
      .sort(([, a], [, b]) => b - a)
      .map(([source, count]) => ({ source, count }));
  }, [u]);

  const usageInitialLoading = showInitialQuerySkeleton(usage);
  const statsInitialLoading = showInitialQuerySkeleton(stats);
  const isBackgroundRefreshing =
    showBackgroundQueryRefresh(stats) || showBackgroundQueryRefresh(usage);

  const schemaCoverage =
    u && u.entity_types_total > 0
      ? Math.round((u.entity_types_with_schema / u.entity_types_total) * 100)
      : 0;

  const lastUpdated = s?.last_updated ?? u?.last_updated;

  if (!isApiUrlConfigured()) {
    return (
      <PageShell title="Analytics" description="API not configured">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm text-muted-foreground">{MISSING_API_URL_MESSAGE}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="default" size="sm">
                <a href="/?from=inspector" rel="noopener">
                  Start a sandbox session
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/settings">Open Settings</Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Server health, connection, and snapshot checks live under Settings. Browse entities,
              sources, and other primitives from the sidebar.
            </p>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Analytics"
      actions={isBackgroundRefreshing ? <QueryRefreshIndicator label="Updating analytics" /> : undefined}
      description={
        lastUpdated ? `Usage, entity distribution, observations, and operator health. Last updated ${formatDate(lastUpdated)}.` : "Usage, entity distribution, observations, and operator health."
      }
    >
      {/* Summary tiles (Usage stats) */}
      <SummaryTiles
        usage={u}
        loading={usageInitialLoading}
        error={usage.isError ? String(usage.error) : null}
        schemaCoverage={schemaCoverage}
      />

      {/* Charts + Health/Attribution */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Entities by Type */}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-4">
              <CardTitle className="text-base">Entities by Type</CardTitle>
              {typeEntries.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
                      <ListFilter className="h-3.5 w-3.5" />
                      <span className="max-w-[140px] truncate sm:max-w-[200px]">{chartTypesLabel}</span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-72 w-64 overflow-y-auto">
                    <DropdownMenuLabel>Types in chart</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        selectAllChartTypes();
                      }}
                    >
                      Select all
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        clearChartTypes();
                      }}
                    >
                      Clear all
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {typeEntries.map(([type, count]) => (
                      <DropdownMenuCheckboxItem
                        key={type}
                        checked={selectedTypes.has(type)}
                        onCheckedChange={() => toggleChartType(type)}
                        className="pr-2"
                      >
                        <div className="flex w-full min-w-0 items-center gap-2">
                          <span className="min-w-0 flex-1 truncate" title={type}>
                            {type}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {count}
                          </span>
                        </div>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </CardHeader>
            <CardContent>
              {statsInitialLoading ? (
                <Skeleton className="h-[300px] w-full" aria-hidden />
              ) : stats.isError ? (
                <QueryErrorAlert title="Could not load entities-by-type">
                  {stats.error?.message ?? String(stats.error)}
                </QueryErrorAlert>
              ) : typeEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No entities yet.</p>
              ) : selectedCount === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Select at least one type to show the chart.
                </p>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="type"
                      angle={-45}
                      textAnchor="end"
                      interval={0}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      stroke="hsl(var(--border))"
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      stroke="hsl(var(--border))"
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        color: "hsl(var(--popover-foreground))",
                        borderRadius: "0.375rem",
                      }}
                      itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                      labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                      cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground">No data for the current selection.</p>
              )}
              {typeEntries.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {visibleTypeEntries.map(([type, count]) => (
                    <Link key={type} to={entityTypeListPath(type)}>
                      <TypeBadge type={type} className="cursor-pointer" />
                      <span className="ml-1 text-xs text-muted-foreground">{count}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
              {typeEntries.length > BADGE_DEFAULT_MAX_TYPES ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {hasMoreTypeBadges ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVisibleTypeCount((c) => c + BADGE_INCREMENT)}
                      >
                        Show more
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setVisibleTypeCount(typeEntries.length)}
                      >
                        Show all
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setVisibleTypeCount(BADGE_DEFAULT_MAX_TYPES)}
                    >
                      Show less
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground">
                    Showing {visibleTypeEntries.length} of {typeEntries.length}
                  </span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Observations by Source */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Observations by Source</CardTitle>
            </CardHeader>
            <CardContent>
              {usageInitialLoading ? (
                <Skeleton className="h-[200px] w-full" aria-hidden />
              ) : usage.isError ? (
                <QueryErrorAlert title="Could not load observations-by-source">
                  {String(usage.error)}
                </QueryErrorAlert>
              ) : observationSourceChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No observations yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={observationSourceChartData}
                    margin={{ top: 4, right: 16, left: 0, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="source"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      stroke="hsl(var(--border))"
                      angle={-25}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      stroke="hsl(var(--border))"
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        color: "hsl(var(--popover-foreground))",
                        borderRadius: "0.375rem",
                      }}
                      itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                      labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                      cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Health + Attribution */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4" /> Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">API</span>
                <span className={health.data?.ok ? "text-success" : "text-destructive"}>
                  {health.data?.ok ? "Healthy" : "Unreachable"}
                </span>
              </div>
              {serverInfo.data && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Port</span>
                    <span>{serverInfo.data.httpPort}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground">MCP</span>
                    <p className="break-all font-mono text-[11px] leading-snug">
                      {serverInfo.data.mcpUrl || "—"}
                    </p>
                  </div>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => snapshotHealth.mutate(false)}
                disabled={snapshotHealth.isPending}
              >
                Check Snapshot Health
              </Button>
              {snapshotHealth.data && (
                <p className="text-xs text-muted-foreground">
                  Stale snapshots: {snapshotHealth.data.stale_snapshots ?? 0}
                </p>
              )}
              {peersList.data && (
                <div className="mt-2 flex justify-between border-t pt-1">
                  <span className="text-muted-foreground">Peers</span>
                  <span>
                    {peersList.data.peers.filter((p) => p.active).length} active /{" "}
                    {peersList.data.peers.length} total
                  </span>
                </div>
              )}
              {peersList.isPending ? (
                <p className="pt-1 text-xs text-muted-foreground">Loading peer summary…</p>
              ) : null}
            </CardContent>
          </Card>

          <AttributionSummary />
        </div>
      </div>
    </PageShell>
  );
}

interface SummaryTilesProps {
  usage: ReturnType<typeof useUsage>["data"];
  loading: boolean;
  error: string | null;
  schemaCoverage: number;
}

function SummaryTiles({ usage, loading, error, schemaCoverage }: SummaryTilesProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <QueryErrorAlert title="Could not load usage statistics">{error}</QueryErrorAlert>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Entities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{usage?.total_entities ?? 0}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {usage?.entity_types_total ?? 0} entity type
            {usage?.entity_types_total !== 1 ? "s" : ""}
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
          <div className="text-2xl font-bold">{usage?.total_observations ?? 0}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{usage?.entities_created_last_7_days ?? 0}</div>
          <p className="mt-1 text-xs text-muted-foreground">entities last 7 days</p>
          <p className="text-xs text-muted-foreground">
            {usage?.entities_created_last_30_days ?? 0} last 30 days
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
          <p className="mt-1 text-xs text-muted-foreground">
            {usage?.entity_types_with_schema ?? 0} of {usage?.entity_types_total ?? 0} types
            registered
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
