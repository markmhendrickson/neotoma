import type { SupportedLocale } from "@/i18n/config";

/** Companion JSON for each `docs/site/pages` MDX file (same basename, `.meta.json`). */
export interface MdxSitePageMeta {
  /** Default-locale site path, e.g. `/changelog` */
  path: string;
  locale: SupportedLocale;
  /** H1 text inside DetailPage (not necessarily the full `<title>` suffix). */
  page_title: string;
  /** When this file is a translation, canonical default-locale path (usually same as `path`). */
  translation_of: string | null;
  /** Locale of the canonical source when this row is a translation. */
  source_locale: SupportedLocale;
  /** Bump when English source meaningfully changes; translations should refresh. */
  translated_from_revision: string;
  translation_status: "canonical" | "human_reviewed" | "human_draft" | "machine_draft";
  /** Optional docs hub / sidebar grouping key. */
  nav_group?: string;
  nav_order?: number;
}

export function isMdxSitePageMeta(value: unknown): value is MdxSitePageMeta {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  const translationOk =
    o.translation_of === null || o.translation_of === undefined || typeof o.translation_of === "string";
  return (
    typeof o.path === "string" &&
    o.path.startsWith("/") &&
    typeof o.locale === "string" &&
    typeof o.page_title === "string" &&
    translationOk &&
    typeof o.source_locale === "string" &&
    typeof o.translated_from_revision === "string" &&
    typeof o.translation_status === "string"
  );
}
