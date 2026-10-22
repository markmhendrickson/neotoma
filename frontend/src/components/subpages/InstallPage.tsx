import { useLocale } from "@/i18n/LocaleContext";
import { MdxSitePage } from "./MdxSitePage";

export function InstallPage() {
  const { subpage } = useLocale();
  return <MdxSitePage canonicalPath="/install" detailTitle={subpage.install.title} />;
}
