import { useMe } from "@/hooks/use_infra";
import { isApiUrlConfigured } from "@/api/client";
import { BundledDocsFooter } from "@/components/layout/bundled_docs_footer";
import { PageShell } from "@/components/layout/page_shell";
import { StatTotalsGrid } from "@/components/shared/stat_totals_grid";
import { HeroSection } from "@/components/home/hero_section";
import { StateFlowDiagram } from "@/components/home/state_flow_diagram";
import { DifferentiatorStrip } from "@/components/home/differentiator_strip";
import { OutcomesCarousel } from "@/components/home/outcomes_carousel";
import { FaqPreviewSection } from "@/components/home/faq_preview_section";
import { QuotesStrip } from "@/components/home/quotes_strip";
import { PinnedDashboardPanel } from "@/components/home/pinned_dashboard_panel";

/**
 * Marketing home — six stacked sections in order:
 *
 *   1. Hero (headline, subheader, chips, primary + GitHub CTA)
 *   2. State flow diagram (invoice → stored → balance answer)
 *   3. Differentiator strip (vs platform memory / RAG / SQLite / cloud)
 *   4. Before/after outcomes carousel (4 categories)
 *   5. FAQ preview (3 highest-priority questions; link to /faq)
 *   6. Quotes + final install/docs CTA bar
 *
 * The `StatTotalsGrid` is shown only for users hitting their own configured
 * instance (`isApiUrlConfigured()`) — first-time public visitors do not see
 * a wall of zero counts.
 */
export default function HomePage() {
  const me = useMe();
  const mode = me.data?.sandbox_mode;
  // The sandbox CTA is the right primary when the server can mint an
  // ephemeral session for the visitor. In `local` mode the visitor is
  // already on their own install and the install CTA is noise; flip to docs.
  const sandboxAvailable = mode === "hosted_sandbox" || mode === "local_sandbox";
  const showOperatorStats = isApiUrlConfigured() && mode === "local";
  const showPinnedPanel = isApiUrlConfigured();

  return (
    <div className="flex min-h-full flex-col">
      <PageShell>
        <div className="space-y-12">
          {showPinnedPanel ? <PinnedDashboardPanel /> : null}
          <HeroSection sandboxAvailable={sandboxAvailable} />
          {showOperatorStats ? <StatTotalsGrid /> : null}
          <StateFlowDiagram />
          <DifferentiatorStrip />
          <OutcomesCarousel />
          <FaqPreviewSection />
          <QuotesStrip />
        </div>
      </PageShell>
      <BundledDocsFooter />
    </div>
  );
}
