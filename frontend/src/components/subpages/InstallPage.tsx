import { Link } from "react-router-dom";
import { SolidLockup } from "@/components/onepager/NeotomaLogos";
import "@/components/onepager/onepager.css";
import { useLocale } from "@/i18n/LocaleContext";
import { NEOTOMA_GITHUB_REPO } from "@/site/neotoma_repo";
import { MdxSitePage } from "./MdxSitePage";

/**
 * /install on the one-pager site: the real install page, with the same editorial chrome and minimal
 * chrome (masthead with the accepted lockup, a way back, GitHub). The page body is unchanged.
 */
export function InstallPage() {
  const { subpage } = useLocale();
  return (
    <div className="plan plan-install">
      <div className="plan-install-masthead">
        <Link to="/" aria-label="Neotoma, back to the home page">
          <SolidLockup />
        </Link>
        <nav aria-label="Install page" className="plan-install-links">
          <Link to="/" className="plan-link">
            Back to neotoma.io
          </Link>
          <a href={NEOTOMA_GITHUB_REPO} className="plan-link">
            GitHub
          </a>
        </nav>
      </div>
      <section className="plan-sheet plan-install-sheet" aria-label="Install Neotoma">
        <MdxSitePage canonicalPath="/install" detailTitle={subpage.install.title} />
      </section>
    </div>
  );
}
