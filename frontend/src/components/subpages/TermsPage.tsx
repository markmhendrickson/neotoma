import { useLocale } from "@/i18n/LocaleContext";
import { MdxSitePage } from "./MdxSitePage";

/**
 * Shell for `/terms`. Prose lives in `docs/site/pages/en/terms.mdx` (regenerate from
 * `docs/legal/site_terms_of_use.md` via `npm run mdx:sync-legal` after legal edits).
 */
export function TermsPage() {
  const { subpage } = useLocale();
  return <MdxSitePage canonicalPath="/terms" detailTitle={subpage.terms.title} />;
}
