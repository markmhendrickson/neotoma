import type { SupportedLocale } from "@/i18n/config";
import { type LocaleDictionary } from "@/i18n/dictionaries";
import { getSubpageLocalePack } from "@/i18n/locales/subpage_packs";
import { type StaticLocalePack } from "@/i18n/locales/static_packs";
import { SITE_SECTION_CORE } from "@/site/site_data_core";
import { DOC_NAV_CATEGORIES } from "@/site/site_data";

export interface LocalizedSiteSection {
  id: string;
  label: string;
  shortLabel: string;
  icon: string;
}

export function getLocalizedSiteSections(pack: StaticLocalePack): LocalizedSiteSection[] {
  const labels = pack.siteSections;
  const labelById: Record<string, { label: string; shortLabel: string }> = {
    intro: { label: labels.intro, shortLabel: labels.intro },
    outcomes: { label: labels.beforeAfter, shortLabel: labels.beforeAfter },
    who: { label: labels.who ?? "Who", shortLabel: labels.who ?? "Who" },
    "memory-guarantees": { label: labels.guarantees, shortLabel: labels.guarantees },
    "record-types": { label: labels.recordTypes ?? "Record types", shortLabel: labels.recordTypes ?? "Types" },
    evaluate: { label: labels.evaluate ?? "Evaluate", shortLabel: labels.evaluate ?? "Evaluate" },
    "common-questions": {
      label: labels.commonQuestions ?? "Common questions",
      shortLabel: "Questions",
    },
  };

  return SITE_SECTION_CORE.map((section) => ({
    ...section,
    ...(labelById[section.id] ?? { label: section.id, shortLabel: section.id }),
  }));
}

export function getLocalizedDocNavCategories(dict: LocaleDictionary, locale: SupportedLocale) {
  const sub = getSubpageLocalePack(locale);
  const dn = sub.docNav;

  const titleMap: Record<string, string> = {
    "Getting started": dict.categoryGettingStarted,
    Reference: dict.categoryReference,
    "Agent behavior": dict.categoryAgentBehavior,
    "Use cases": dict.categoryUseCases,
    "Integration guides": dict.categoryIntegrationGuides,
    Integrations: dict.categoryIntegrationGuides,
    External: dict.categoryExternal,
    Compare: dict.categoryCompare,
    "Use Cases": dict.categoryUseCases,
    Hosted: dn.categoryHosted,
  };

  const itemLabelByHref: Record<string, string> = {
    "/docs": dict.allDocumentation,
    "/install": dict.install,
    "/meet": dict.meetTheCreator,
    "/architecture": dict.architecture,
    "/evaluate": dict.evaluate,
    "/what-to-store": dn.whatToStoreFirst,
    "/backup": dn.backupRestore,
    "/connect": sub.connect.title,
    "/tunnel": dn.exposeTunnel,
    "/walkthrough": dn.walkthrough,
    "/hosted": dn.hostedNeotoma,
    "/sandbox": dn.publicSandbox,
  };

  return DOC_NAV_CATEGORIES.map((category) => ({
    ...category,
    title: titleMap[category.title] ?? category.title,
    items: category.items.map((item) => ({
      ...item,
      label: itemLabelByHref[item.href] ?? item.label,
    })),
  }));
}

