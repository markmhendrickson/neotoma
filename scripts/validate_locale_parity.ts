#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_LOCALES } from "../frontend/src/i18n/config";
import { getDictionary } from "../frontend/src/i18n/dictionaries";
import { getStaticLocalePack } from "../frontend/src/i18n/locales/static_packs";
import { SITEMAP_PATHS } from "../frontend/src/site/seo_metadata";
import { localizePath } from "../frontend/src/i18n/routing";

function assertNonEmpty(label: string, value: unknown): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing/empty translation: ${label}`);
  }
}

for (const locale of SUPPORTED_LOCALES) {
  const dict = getDictionary(locale);
  const pack = getStaticLocalePack(locale);

  assertNonEmpty(`${locale}.dict.docs`, dict.docs);
  assertNonEmpty(`${locale}.dict.search`, dict.search);
  assertNonEmpty(`${locale}.dict.install`, dict.install);
  assertNonEmpty(`${locale}.dict.architecture`, dict.architecture);
  assertNonEmpty(`${locale}.dict.docsIntro`, dict.docsIntro);
  assertNonEmpty(`${locale}.dict.showMore`, dict.showMore);
  assertNonEmpty(`${locale}.dict.showLess`, dict.showLess);
  assertNonEmpty(`${locale}.dict.noResults`, dict.noResults);

  assertNonEmpty(`${locale}.pack.siteSections.intro`, pack.siteSections.intro);
  assertNonEmpty(`${locale}.pack.siteSections.install`, pack.siteSections.install);
  assertNonEmpty(`${locale}.pack.siteSections.architecture`, pack.siteSections.architecture);
  assertNonEmpty(`${locale}.pack.foundations.title`, pack.foundations.title);
  assertNonEmpty(`${locale}.pack.memory.vendors`, pack.memory.vendors);
  assertNonEmpty(`${locale}.pack.memory.onThisPage`, pack.memory.onThisPage);
  assertNonEmpty(`${locale}.pack.seo.home.title`, pack.seo.home.title);
  assertNonEmpty(`${locale}.pack.seo.home.description`, pack.seo.home.description);
  assertNonEmpty(
    `${locale}.pack.memory.showAllGuarantees`,
    pack.memory.showAllGuarantees(12)
  );

  const localizedRoot = localizePath("/", locale);
  if (!SITEMAP_PATHS.includes(localizedRoot)) {
    throw new Error(`Missing localized root in sitemap paths: ${localizedRoot}`);
  }

  const sitePagesRoot = path.resolve(process.cwd(), "site_pages");
  const localizedIndexPath = path.join(sitePagesRoot, localizedRoot.replace(/^\//, ""), "index.html");
  if (fs.existsSync(localizedIndexPath)) {
    const html = fs.readFileSync(localizedIndexPath, "utf-8");
    assertNonEmpty(`${locale}.renderedHtml`, html);
    if (!html.includes(dict.install)) {
      throw new Error(`Rendered HTML missing expected locale marker "${dict.install}" in ${localizedIndexPath}`);
    }
    if (
      locale !== "en" &&
      html.includes("Your production agent has amnesia")
    ) {
      throw new Error(`Rendered HTML still contains English hero copy in ${localizedIndexPath}`);
    }
  }
}

console.log(
  `Locale parity validated for ${SUPPORTED_LOCALES.length} locales; sitemap localization looks good.`
);

