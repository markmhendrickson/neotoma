import { useLocale } from "@/i18n/LocaleContext";
import { MdxSitePage } from "./MdxSitePage";

export function MemoryGuaranteesPage() {
  const { pack } = useLocale();
  const detailTitle = pack.seo.memoryGuarantees.title.replace(" | Neotoma", "");
  return <MdxSitePage canonicalPath="/memory-guarantees" detailTitle={detailTitle} />;
}
