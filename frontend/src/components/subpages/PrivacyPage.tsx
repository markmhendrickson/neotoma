import { useLocale } from "@/i18n/LocaleContext";
import { MdxSitePage } from "./MdxSitePage";

/**
 * Shell for `/privacy`. Prose lives in `docs/site/pages/en/privacy.mdx` (regenerate from
 * `docs/legal/site_privacy_notice.md` via `npm run mdx:sync-legal` after legal edits).
 */
export function PrivacyPage() {
  const { subpage } = useLocale();
  return <MdxSitePage canonicalPath="/privacy" detailTitle={subpage.privacy.title} />;
}
