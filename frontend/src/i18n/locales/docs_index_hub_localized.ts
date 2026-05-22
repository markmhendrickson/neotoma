import type { SupportedLocale } from "@/i18n/config";
import type { LocaleDictionary } from "@/i18n/dictionaries";
import { DOC_INDEX_HUB_EN, type DocHubCategory } from "@/i18n/locales/docs_index_hub_en";
import { applyDocHubEsOverlays } from "@/i18n/locales/docs_index_hub_es_overlays";

function translateCategoryTitleFromEnglish(title: string, dict: LocaleDictionary): string {
  if (title === "Getting started") return dict.categoryGettingStarted;
  if (title === "Reference") return dict.categoryReference;
  if (title === "Memory guarantees") return dict.memoryGuaranteesNav;
  if (title === "Memory models") return "Memory models";
  if (title === "Foundations") return "Foundations";
  if (title === "Agent behavior") return dict.categoryAgentBehavior;
  if (title === "Use cases") return dict.categoryUseCases;
  if (title === "Integration guides" || title === "Integrations") return dict.categoryIntegrationGuides;
  if (title === "External") return dict.categoryExternal;
  if (title === "Compare") return dict.categoryCompare;
  if (title === "Use Cases") return dict.categoryUseCases;
  return title;
}

/** Hub card grid for `/docs`: Spanish overlays on `es`; other locales translate category titles from `dict` where mapped. */
export function getLocalizedDocHubCategories(
  locale: SupportedLocale,
  dict: LocaleDictionary,
): DocHubCategory[] {
  const base = DOC_INDEX_HUB_EN;
  const withTitles =
    locale === "es"
      ? applyDocHubEsOverlays(base)
      : base.map((cat) => ({
          ...cat,
          title: translateCategoryTitleFromEnglish(cat.title, dict),
        }));
  return withTitles;
}
