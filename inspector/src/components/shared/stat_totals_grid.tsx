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
  type LucideIcon,
} from "lucide-react";

const statCardLinkClass =
  "block rounded-lg ring-offset-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

type LinkedStatCardProps = {
  to: string;
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
};

function LinkedStatCard({ to, title, value, icon, description }: LinkedStatCardProps) {
  return (
    <Link to={to} aria-label={`View ${title.toLowerCase()}`} className={statCardLinkClass}>
      <StatCard title={title} value={value} icon={icon} description={description} />
    </Link>
  );
}

/**
 * Shared 8-card stat totals grid used on the home page and analytics
 * dashboard. Renders skeleton while stats are loading and an error alert
 * on failure. Each card links to its corresponding Inspector page.
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
      <LinkedStatCard to="/entities" title="Entities" value={s.total_entities} icon={Box} />
      <LinkedStatCard
        to="/observations"
        title="Observations"
        value={s.total_observations}
        icon={Eye}
      />
      <LinkedStatCard to="/sources" title="Sources" value={s.sources_count} icon={FileText} />
      <LinkedStatCard
        to="/relationships"
        title="Relationships"
        value={s.total_relationships}
        icon={GitBranch}
      />
      <LinkedStatCard to="/timeline" title="Events" value={s.total_events} icon={Clock} />
      <LinkedStatCard
        to="/interpretations"
        title="Interpretations"
        value={s.total_interpretations}
        icon={Cpu}
      />
      <LinkedStatCard
        to="/subscriptions"
        title="Subscriptions"
        value={subscriptionStats.data?.total ?? (subscriptionStats.isPending ? "…" : 0)}
        icon={Bell}
        description="Substrate webhooks / SSE"
      />
      <LinkedStatCard
        to="/peers"
        title="Peers"
        value={peersList.data?.peers?.length ?? (peersList.isPending ? "…" : 0)}
        icon={RefreshCw}
        description="Cross-instance sync"
      />
    </div>
  );
}
