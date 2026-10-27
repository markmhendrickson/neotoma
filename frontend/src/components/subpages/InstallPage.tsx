import "@/components/onepager/onepager.css";
import { useLocale } from "@/i18n/LocaleContext";
import { SiteFooter, SiteHeader, SiteSkipLink } from "@/components/onepager/SiteChrome";
import { MdxSitePage } from "./MdxSitePage";

/**
 * /install on the one-pager site: the real install page, with the same editorial chrome and minimal
 * chrome (masthead with the accepted lockup, a way back, GitHub). The page body is unchanged.
 */
export function InstallPage() {
  const { subpage } = useLocale();
  return (
    <div className="plan plan-install">
      <SiteSkipLink />
      <div className="plan-sheet plan-hero">
        <SiteHeader />
      </div>
      <main
        className="plan-sheet plan-install-sheet"
        id="main"
        tabIndex={-1}
        aria-label={subpage.install.title}
      >
        <MdxSitePage canonicalPath="/install" detailTitle={subpage.install.title} />
      </main>
      <SiteFooter />
    </div>
  );
}
