import { useMe } from "@/hooks/use_infra";
import { isApiUrlConfigured } from "@/api/client";
import { BundledDocsFooter } from "@/components/layout/bundled_docs_footer";
import { PageShell } from "@/components/layout/page_shell";
import { StatTotalsGrid } from "@/components/shared/stat_totals_grid";
import { PinnedDashboardPanel } from "@/components/home/pinned_dashboard_panel";
import { OrientationStrip } from "@/components/home/orientation_strip";

/**
 * Operator-focused home — three stacked sections in this order:
 *
 *   1. At-a-glance stat totals (whenever a configured API is reachable).
 *   2. Orientation strip (visitor modes only: hosted_sandbox / local_sandbox /
 *      refuse). One factual line; hidden for installed operators.
 *   3. Pinned dashboard panel (rendered whenever the API is reachable; shows
 *      an empty-state placeholder when nothing has been pinned yet).
 *
 * Marketing content (hero, state-flow diagram, differentiator strip, outcomes
 * carousel, FAQ preview, quotes strip) was removed in this RC: the inspector
 * is an operator surface for users who have already chosen to run Neotoma, not
 * a marketing site for first-time visitors.
 */
export default function HomePage() {
  const me = useMe();
  const mode = me.data?.sandbox_mode;
  const dataDir = me.data?.storage?.data_dir;
  const apiConfigured = isApiUrlConfigured();
  const showPinnedPanel = apiConfigured;
  const showOperatorStats = apiConfigured;

  return (
    <div className="flex min-h-full flex-col">
      <PageShell>
        <div className="space-y-6">
          {showOperatorStats ? <StatTotalsGrid /> : null}
          <OrientationStrip mode={mode} dataDir={dataDir} />
          {showPinnedPanel ? <PinnedDashboardPanel /> : null}
        </div>
      </PageShell>
      <BundledDocsFooter />
    </div>
  );
}
