import { FaqPreviewSection } from "@/components/home/faq_preview_section";
import { BundledDocsFooter } from "@/components/layout/bundled_docs_footer";
import { PageShell } from "@/components/layout/page_shell";
import { StatTotalsGrid } from "@/components/shared/stat_totals_grid";
import { isApiUrlConfigured } from "@/api/client";
import { NEOTOMA_TAGLINE } from "@/lib/site_copy";

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <PageShell>
        <header className="min-w-0">
          <h1 className="max-w-2xl text-2xl font-semibold tracking-tight text-foreground">
            {NEOTOMA_TAGLINE}
          </h1>
        </header>
        {isApiUrlConfigured() ? <StatTotalsGrid /> : null}
        <FaqPreviewSection />
      </PageShell>
      <BundledDocsFooter />
    </div>
  );
}
