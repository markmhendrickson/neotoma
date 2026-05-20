#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "../frontend/src/i18n/config";
import { getDictionary, type LocaleDictionary } from "../frontend/src/i18n/dictionaries";
import { getStaticLocalePack, type StaticLocalePack } from "../frontend/src/i18n/locales/static_packs";
import { SITEMAP_PATHS } from "../frontend/src/site/seo_metadata";
import { localizePath } from "../frontend/src/i18n/routing";

const errors: string[] = [];
const warnings: string[] = [];

function recordError(msg: string): void {
  errors.push(msg);
}
function recordWarning(msg: string): void {
  warnings.push(msg);
}

function assertNonEmpty(label: string, value: unknown): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    recordError(`Missing/empty translation: ${label}`);
  }
}

function assertNotEnglish(label: string, localizedValue: string, englishValue: string): void {
  if (localizedValue === englishValue) {
    recordError(`Fallback to English detected: ${label} = "${englishValue}"`);
  }
}

const enDict = getDictionary(DEFAULT_LOCALE);
const enPack = getStaticLocalePack(DEFAULT_LOCALE);

/** Nav/UI labels that often stay English or match cognates (technical + false positives). */
const DICTIONARY_KEYS_SKIP_NOT_ENGLISH = new Set<keyof LocaleDictionary>([
  "docs",
  "viewPageMarkdown",
  "architecture",
  "allDocumentation",
  "categoryVerticals",
  "themeSystem",
]);

function validateDictionary(locale: string, dict: LocaleDictionary): void {
  const dictKeys: (keyof LocaleDictionary)[] = [
    "languageName", "docs", "search", "quickStart", "install", "evaluate",
    "meetTheCreator", "architecture", "memoryGuaranteesNav", "allDocumentation",
    "developerPreview", "home", "themeSystem", "themeDark", "themeLight",
    "language", "pageNotFound", "notFoundDescription", "goHome", "docsIntro",
    "categoryGettingStarted", "categoryReference", "categoryAgentBehavior",
    "categoryUseCases", "categoryIntegrationGuides", "categoryExternal",
    "categoryCompare", "categoryVerticals", "viewAll", "showMore", "showLess",
    "topPages", "noResults", "copied", "copy", "viewPageMarkdown",
    "backToHtmlPage", "allPagesMarkdown", "rawMarkdownDirect",
    "footerColumnProduct", "footerColumnDocumentation", "footerColumnExternal",
    "footerColumnLegal", "footerTagline", "footerCtaBlurb", "footerReleaseSingular",
    "footerReleasePlural", "footerMitLicensed", "footerBuiltBy",
    "footerLinkMemoryGuarantees", "footerLinkBlog",
  ];

  for (const key of dictKeys) {
    const label = `${locale}.dict.${key}`;
    assertNonEmpty(label, dict[key]);
    if (key !== "languageName" && !DICTIONARY_KEYS_SKIP_NOT_ENGLISH.has(key)) {
      assertNotEnglish(label, dict[key], enDict[key]);
    }
  }
}

function validateStaticPack(locale: string, pack: StaticLocalePack): void {
  const heroKeys: (keyof StaticLocalePack["homeHero"])[] = [
    "titlePrefix", "titleMid", "titleFocus",
    "withoutSharedMemory", "summary",
    "ctaEvaluateWithAgent", "ctaEvaluateCompact", "ctaViewGuarantees",
    "ctaInstall", "ctaMeetCreator", "ctaMeetCreatorCompact",
    "ctaOfficeHours", "ctaOfficeHoursSubtext", "subcopy", "curiosityGap",
    "audienceTagline", "heroReinforcement", "heroReinforcementSecondary",
  ];
  for (const key of heroKeys) {
    const label = `${locale}.pack.homeHero.${key}`;
    const val = pack.homeHero[key];
    if (typeof val === "string") {
      assertNonEmpty(label, val);
      assertNotEnglish(label, val, enPack.homeHero[key] as string);
    }
  }

  if (pack.homeHero.bullets) {
    for (let i = 0; i < pack.homeHero.bullets.length; i++) {
      const label = `${locale}.pack.homeHero.bullets[${i}]`;
      assertNonEmpty(label, pack.homeHero.bullets[i]);
      assertNotEnglish(label, pack.homeHero.bullets[i], enPack.homeHero.bullets[i]);
    }
  }

  if (pack.homeHero.summaryRecordTypes) {
    for (let i = 0; i < pack.homeHero.summaryRecordTypes.length; i++) {
      const label = `${locale}.pack.homeHero.summaryRecordTypes[${i}]`;
      assertNonEmpty(label, pack.homeHero.summaryRecordTypes[i]);
      // Record-type tokens often stay English until full glossary localization.
    }
  }

  const sectionKeys: (keyof StaticLocalePack["siteSections"])[] = [
    "intro", "personalOs", "beforeAfter", "guarantees",
    "inspect", "architecture", "useCases", "interfaces", "learnMore", "resources",
  ];
  const siteSectionSkipNotEnglish = new Set<string>(["architecture", "interfaces"]);
  for (const key of sectionKeys) {
    const label = `${locale}.pack.siteSections.${key}`;
    const val = pack.siteSections[key];
    if (typeof val === "string") {
      assertNonEmpty(label, val);
      const enVal = enPack.siteSections[key];
      if (typeof enVal === "string" && !siteSectionSkipNotEnglish.has(key)) {
        assertNotEnglish(label, val, enVal);
      }
    }
  }

  const memoryKeys: (keyof Omit<StaticLocalePack["memory"], "showAllGuarantees" | "showFewer">)[] = [
    "vendors", "representativeProviders", "platform", "retrievalRag",
    "files", "database", "deterministic", "onThisPage",
  ];
  const memorySkipNotEnglish = new Set<string>(["platform", "database"]);
  for (const key of memoryKeys) {
    const label = `${locale}.pack.memory.${key}`;
    const val = (pack.memory as Record<string, unknown>)[key];
    if (typeof val === "string") {
      assertNonEmpty(label, val);
      if (!memorySkipNotEnglish.has(key)) {
        assertNotEnglish(label, val, (enPack.memory as Record<string, unknown>)[key] as string);
      }
    }
  }

  const foundationKeys: (keyof StaticLocalePack["foundations"])[] = [
    "title", "onThisPage", "privacyFirst", "deterministic", "crossPlatform",
  ];
  for (const key of foundationKeys) {
    const label = `${locale}.pack.foundations.${key}`;
    assertNonEmpty(label, pack.foundations[key]);
    assertNotEnglish(label, pack.foundations[key], enPack.foundations[key]);
  }

  const seoRoutes: (keyof StaticLocalePack["seo"])[] = [
    "home", "docs", "install", "foundations", "memoryGuarantees",
  ];
  for (const route of seoRoutes) {
    for (const field of ["title", "description"] as const) {
      const label = `${locale}.pack.seo.${route}.${field}`;
      assertNonEmpty(label, pack.seo[route][field]);
      assertNotEnglish(label, pack.seo[route][field], enPack.seo[route][field]);
    }
  }

  assertNonEmpty(
    `${locale}.pack.memory.showAllGuarantees`,
    pack.memory.showAllGuarantees(12),
  );

  validateHomeBody(locale, pack.homeBody);
}

/** Paths where English is intentional (stable tokens, enums, proper nouns). */
function shouldSkipHomeBodyPath(path: string): boolean {
  if (/\.(slug|status|scenarioIndex|attributionHref)$/.test(path)) return true;
  if (/^scenarios\[\d+\]\.version$/.test(path)) return true;
  if (path === "proof.founderName") return true;
  /** Punctuation / proper nouns / product names shared across locales. */
  if (path === "who.calloutNotForTrail") return true;
  if (path === "recordTypes.schemaEvolutionCalloutBodyAfterLink") return true;
  if (path === "proof.founderPhotoAlt") return true;
  if (path === "hero.githubLabel") return true;
  return false;
}

function validateHomeBody(locale: string, body: StaticLocalePack["homeBody"]): void {
  walkHomeBody(locale, "", body, enPack.homeBody);
}

function walkHomeBody(locale: string, path: string, loc: unknown, enVal: unknown): void {
  if (shouldSkipHomeBodyPath(path)) return;

  const label = path ? `${locale}.pack.homeBody.${path}` : `${locale}.pack.homeBody`;

  if (loc === undefined || enVal === undefined) {
    if (loc !== enVal) {
      recordError(`${label}: undefined mismatch`);
    }
    return;
  }
  if (loc === null || enVal === null) {
    if (loc !== enVal) {
      recordError(`${label}: null mismatch`);
    }
    return;
  }

  if (typeof loc === "string" && typeof enVal === "string") {
    const allowEmptyToolContent =
      /^cliDemo\.chatScenarios\[\d+\]\.messages\[\d+\]\.content$/.test(path) && loc === "" && enVal === "";
    if (!allowEmptyToolContent) {
      assertNonEmpty(label, loc);
    }
    /** Scripted demo: CLI/MCP payloads and tool names stay English; UI chrome is localized in `modeTabs` etc. */
    if (path === "cliDemo" || path.startsWith("cliDemo.")) {
      return;
    }
    assertNotEnglish(label, loc, enVal);
    return;
  }
  if (typeof loc === "number" && typeof enVal === "number") {
    if (loc !== enVal) {
      recordError(`${label}: expected ${enVal}, got ${loc}`);
    }
    return;
  }
  if (typeof loc === "boolean" && typeof enVal === "boolean") {
    if (loc !== enVal) {
      recordError(`${label}: boolean mismatch`);
    }
    return;
  }

  if (Array.isArray(loc) && Array.isArray(enVal)) {
    if (loc.length !== enVal.length) {
      recordError(`${label}: array length ${loc.length} vs English ${enVal.length}`);
      return;
    }
    for (let i = 0; i < loc.length; i++) {
      const childPath = path ? `${path}[${i}]` : `[${i}]`;
      walkHomeBody(locale, childPath, loc[i], enVal[i]);
    }
    return;
  }

  if (typeof loc === "object" && typeof enVal === "object") {
    const lk = Object.keys(loc as object);
    const ek = Object.keys(enVal as object);
    const keys = new Set([...lk, ...ek]);
    for (const k of keys) {
      const childPath = path ? `${path}.${k}` : k;
      walkHomeBody(
        locale,
        childPath,
        (loc as Record<string, unknown>)[k],
        (enVal as Record<string, unknown>)[k],
      );
    }
    return;
  }

  recordError(`${label}: unsupported type pair for locale parity`);
}

for (const locale of SUPPORTED_LOCALES) {
  if (locale === DEFAULT_LOCALE) continue;
  const dict = getDictionary(locale);
  const pack = getStaticLocalePack(locale);

  validateDictionary(locale, dict);
  validateStaticPack(locale, pack);

  const localizedRoot = localizePath("/", locale);
  if (!SITEMAP_PATHS.includes(localizedRoot)) {
    recordError(`Missing localized root in sitemap paths: ${localizedRoot}`);
  }

  const sitePagesRoot = path.resolve(process.cwd(), "site_pages");
  const localizedIndexPath = path.join(sitePagesRoot, localizedRoot.replace(/^\//, ""), "index.html");
  if (fs.existsSync(localizedIndexPath)) {
    const html = fs.readFileSync(localizedIndexPath, "utf-8");
    assertNonEmpty(`${locale}.renderedHtml`, html);
  }
}

if (warnings.length > 0) {
  console.warn(`\n⚠️  ${warnings.length} warning(s):`);
  for (const w of warnings) console.warn(`  - ${w}`);
}

if (errors.length > 0) {
  console.error(`\n❌ ${errors.length} locale parity error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `✅ Locale parity validated for ${SUPPORTED_LOCALES.length} locales (${SUPPORTED_LOCALES.length - 1} non-English); all fields translated, no fallback-to-English detected.`,
);
