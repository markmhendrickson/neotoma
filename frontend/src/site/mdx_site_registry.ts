import type { SupportedLocale } from "@/i18n/config";
import { DEFAULT_LOCALE } from "@/i18n/config";
import type { MdxSitePageMeta } from "@/site/mdx_page_meta";
import { isMdxSitePageMeta } from "@/site/mdx_page_meta";
import type React from "react";

export type MdxPageBundle = {
  meta: MdxSitePageMeta;
  Component: React.ComponentType;
};

function normKey(p: string): string {
  return p.replace(/\\/g, "/");
}

function metaPathToMdxPath(metaKey: string): string {
  return normKey(metaKey).replace(/\.meta\.json$/i, ".mdx");
}

const mdxModules = import.meta.glob<{ default: React.ComponentType }>(
  "../../../docs/site/pages/**/*.mdx",
  { eager: true },
);

const metaModules = import.meta.glob<MdxSitePageMeta>("../../../docs/site/pages/**/*.meta.json", {
  eager: true,
  import: "default",
});

function buildIndex(): Map<string, MdxPageBundle> {
  const byRouteLocale = new Map<string, MdxPageBundle>();

  for (const [rawMetaKey, metaUnknown] of Object.entries(metaModules)) {
    const metaKey = normKey(rawMetaKey);
    if (!isMdxSitePageMeta(metaUnknown)) {
      console.warn(`[mdx_site_registry] invalid meta JSON: ${metaKey}`);
      continue;
    }
    const meta = metaUnknown;
    const mdxKey = metaPathToMdxPath(metaKey);
    const mdxEntry = Object.entries(mdxModules).find(([k]) => normKey(k) === mdxKey);
    if (!mdxEntry) {
      console.warn(`[mdx_site_registry] missing MDX for meta: ${metaKey} (expected ${mdxKey})`);
      continue;
    }
    const Component = mdxEntry[1].default;
    const mapKey = `${meta.path}\0${meta.locale}`;
    byRouteLocale.set(mapKey, { meta, Component });
  }

  return byRouteLocale;
}

const index = buildIndex();

function mapKey(path: string, locale: SupportedLocale): string {
  return `${path}\0${locale}`;
}

/**
 * Resolve MDX page for a canonical path and UI locale.
 * Falls back to {@link DEFAULT_LOCALE} when a translation file is missing.
 */
export function resolveMdxSitePage(
  canonicalPath: string,
  locale: SupportedLocale,
): { bundle: MdxPageBundle; usedFallbackFromLocale: SupportedLocale | null } {
  const primary = index.get(mapKey(canonicalPath, locale));
  if (primary) {
    return { bundle: primary, usedFallbackFromLocale: null };
  }
  if (locale !== DEFAULT_LOCALE) {
    const fallback = index.get(mapKey(canonicalPath, DEFAULT_LOCALE));
    if (fallback) {
      return { bundle: fallback, usedFallbackFromLocale: locale };
    }
  }
  throw new Error(`No MDX bundle for path ${canonicalPath} (locale ${locale})`);
}

export function hasMdxSitePage(canonicalPath: string): boolean {
  return index.has(mapKey(canonicalPath, DEFAULT_LOCALE));
}

export function listMdxSitePages(): MdxSitePageMeta[] {
  return [...index.values()].map((b) => b.meta);
}
