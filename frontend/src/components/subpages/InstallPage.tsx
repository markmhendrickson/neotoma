import "@/components/onepager/onepager.css";
import { useLocale } from "@/i18n/LocaleContext";
import { SiteFooter, SiteHeader, SiteSkipLink } from "@/components/onepager/SiteChrome";
import { MdxSitePage } from "./MdxSitePage";

/**
 * /install keeps the shared editorial rails without nesting the narrow documentation shell.
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
        <h1>{subpage.install.title}</h1>
        <MdxSitePage canonicalPath="/install" shell="bare" />
      </main>
      <SiteFooter />
    </div>
  );
}
