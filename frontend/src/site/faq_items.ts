/**
 * FAQ content — FaqPage, SeoHead JSON-LD, site search.
 * Kept out of FaqPage.tsx to avoid a circular import: seo_metadata → FaqPage → DetailPage → SeoHead → seo_metadata.
 */

import type { SupportedLocale } from "@/i18n/config";
import type { FaqItem } from "@/site/faq_types";
import { FAQ_ITEMS_EN } from "@/site/faq_items_en";
import { FAQ_ITEMS_ES } from "@/site/faq_items_es";

export type { FaqItem } from "@/site/faq_types";
export {
  FAQ_DEEP_LINK_SECTION_IDS,
  FAQ_ITEMS_EN,
  FAQ_QUESTION_BUILDING_YOUR_OWN_MEMORY_SYSTEM,
  FAQ_QUESTION_GIT_LIKE_AGENT_MEMORY,
  FAQ_QUESTION_NOT_FOR_THOUGHT_PARTNER,
} from "@/site/faq_items_en";

/** @deprecated Prefer `item.sectionId` or `FAQ_DEEP_LINK_SECTION_IDS`; kept for legacy anchors derived from English question text. */
export function faqQuestionToSectionId(question: string): string {
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return slug || "faq";
}

export function faqItemSectionId(item: FaqItem): string {
  return item.sectionId;
}

export const FAQ_ITEMS: FaqItem[] = FAQ_ITEMS_EN;

export function getFaqItems(locale: SupportedLocale): FaqItem[] {
  if (locale === "en") return FAQ_ITEMS_EN;
  if (locale === "es") return FAQ_ITEMS_ES;
  return FAQ_ITEMS_EN;
}
