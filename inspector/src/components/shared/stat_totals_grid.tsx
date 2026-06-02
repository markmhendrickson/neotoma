import { Link } from "react-router-dom";
import { useStats } from "@/hooks/use_stats";
import { useEntitiesQuery } from "@/hooks/use_entities";
import { usePeersList } from "@/hooks/use_peers";
import { StatCard } from "@/components/shared/stat_card";
import {
  DashboardStatsSkeleton,
  QueryErrorAlert,
} from "@/components/shared/query_status";
import { showInitialQuerySkeleton } from "@/lib/query_loading";
import {
  Bell,
  Box,
  Clock,
  Cpu,
  Eye,
  FileText,
  GitBranch,
  RefreshCw,
} from "lucide-react";

/**
 * Shared 8-card stat totals grid used on the home page and analytics
 * dashboard. Renders skeleton while stats are loading and an error alert
 * on failure. Subscriptions and Peers cards are linked.
 */
export function StatTotalsGrid() {
  const stats = useStats();
  const subscriptionStats = useEntitiesQuery({
    entity_type: "subscription",
    limit: 1,
    offset: 0,
    include_snapshots: false,
  });
  const peersList = usePeersList();

  if (showInitialQuerySkeleton(stats)) {
    return <DashboardStatsSkeleton />;
  }

  if (stats.error) {
    return (
      <QueryErrorAlert title="Could not load totals">
        {stats.error.message}
      </QueryErrorAlert>
    );
  }

  const s = stats.data;
  if (!s) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <StatCard title="Entities" value={s.total_entities} icon={Box} />
      <StatCard title="Observations" value={s.total_observations} icon={Eye} />
      <StatCard title="Sources" value={s.sources_count} icon={FileText} />
      <StatCard
        title="Relationships"
        value={s.total_relationships}
        icon={GitBranch}
      />
      <StatCard title="Events" value={s.total_events} icon={Clock} />
      <StatCard
        title="Interpretations"
        value={s.total_interpretations}
        icon={Cpu}
      />
      <Link
        to="/subscriptions"
        className="block rounded-md ring-offset-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <StatCard
          title="Subscriptions"
          value={
            subscriptionStats.data?.total ??
            (subscriptionStats.isPending ? "…" : 0)
          }
          icon={Bell}
          description="Substrate webhooks / SSE"
        />
      </Link>
      <Link
        to="/peers"
        className="block rounded-md ring-offset-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <StatCard
          title="Peers"
          value={peersList.data?.peers?.length ?? (peersList.isPending ? "…" : 0)}
          icon={RefreshCw}
          description="Cross-instance sync"
        />
      </Link>
    </div>
  );
}
