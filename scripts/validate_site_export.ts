#!/usr/bin/env tsx
/**
 * Post-build validation for the static site export (site_pages/).
 * Checks that all expected files exist and contain meaningful content
 * so crawlers (Claude, ChatGPT, Googlebot, etc.) see real HTML.
 *
 * Run after `npm run build:site:pages`:
 *   tsx scripts/validate_site_export.ts
 *
 * Exits 0 when all checks pass, 1 on failure.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { NON_DEFAULT_LOCALES } from "../frontend/src/i18n/config";
import { localizePath } from "../frontend/src/i18n/routing";
import { DOCS_VIEWER_INDEX, SPANISH_DOCS_VIEWER_INDEX, SPANISH_DOCS_VIEWER_MANIFEST, isDocsViewerRoute } from "../frontend/src/site/docs_viewer_manifest";
import { SPANISH_RETAINED_BASE_ROUTES } from "../frontend/src/site/spanish_route_set";
import { assertExportedUiEntry } from "./site_ui_source_binding";
import {
  LIVE_ROUTES,
  LOCALIZED_LEGAL_PATHS,
  RETIRED_DESTINATIONS,
  heldReason,
  isRetiredRoute,
  resolveDestination,
} from "../frontend/src/site/route_retirement";
import {
  DEVELOPER_PREVIEW,
  LIVE_PAGE_CLAIM_PATTERNS,
  OLD_LEDE,
  SERVED_PAGE_STATEMENTS,
  UNMEASURED_INSTALL_TIME,
  LIVE_PAGE_RETIRED_META_PHRASES as RETIRED_META_PHRASES,
  findClaimProblems,
  telemetryProblems,
} from "./docs_viewer/claim_patterns";
import { pageText, scanHtml, validateDocsViewerExport } from "./docs_viewer/validate_export";
import { headMetaText, jsonLdBlocks } from "./site_html";
import { llmsLinkProblems } from "./llms_links";
import { REPO_VERSION } from "../frontend/src/site/site_data";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const siteDir = path.join(repoRoot, "site_pages");
const seoMetadataPath = path.join(repoRoot, "frontend/src/site/seo_metadata.ts");

let failures = 0;

function fail(message: string): void {
  console.error(`❌  ${message}`);
  failures++;
}

function pass(message: string): void {
  console.log(`✓  ${message}`);
}

// ---------------------------------------------------------------------------
// Extract indexable paths from seo_metadata.ts (text-based, no imports)
// ---------------------------------------------------------------------------
function extractIndexablePaths(): string[] {
  const source = fs.readFileSync(seoMetadataPath, "utf-8");
  const metaMatch = source.match(
    /const ROUTE_METADATA:\s*Record<string,\s*SeoRouteMetadata>\s*=\s*\{([^]*?)\n\};/
  );
  if (!metaMatch) {
    throw new Error("Could not locate ROUTE_METADATA in seo_metadata.ts");
  }
  const block = metaMatch[1];
  const paths: string[] = [];
  const entryRe = /^\s+"(\/[^"]*)":\s*\{([^]*?)(?=^\s+"\/|\s*\};?\s*$)/gm;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(block)) !== null) {
    if (/robots:\s*"index,follow"/.test(m[2])) {
      paths.push(m[1]);
    }
  }
  return paths;
}

if (!fs.existsSync(siteDir)) {
  fail("site_pages/ directory does not exist — run `npm run build:site:pages` first");
  process.exit(1);
}

const indexablePaths = extractIndexablePaths();

// ---------------------------------------------------------------------------
// 1. Required crawler artifacts
// ---------------------------------------------------------------------------
const REQUIRED_ARTIFACTS = ["robots.txt", "sitemap.xml", "favicon.svg"];
const SENTINEL_FILES = [".nojekyll"];

for (const artifact of REQUIRED_ARTIFACTS) {
  const filePath = path.join(siteDir, artifact);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
    pass(`${artifact} exists`);
  } else {
    fail(`${artifact} missing or empty in site_pages/`);
  }
}
for (const sentinel of SENTINEL_FILES) {
  const filePath = path.join(siteDir, sentinel);
  if (fs.existsSync(filePath)) {
    pass(`${sentinel} exists`);
  } else {
    fail(`${sentinel} missing from site_pages/`);
  }
}

const llmsPath = path.join(siteDir, "llms.txt");
if (fs.existsSync(llmsPath) && fs.statSync(llmsPath).size > 0) {
  pass("llms.txt exists");
} else {
  console.warn("⚠  llms.txt missing from site_pages/ (recommended for LLM discovery)");
}

// ---------------------------------------------------------------------------
// 2. Root index.html must exist and contain prerendered content
// ---------------------------------------------------------------------------
const rootIndex = path.join(siteDir, "index.html");
if (!fs.existsSync(rootIndex)) {
  fail("site_pages/index.html does not exist");
} else {
  const html = fs.readFileSync(rootIndex, "utf-8");
  if (html.includes('<div id="root"></div>')) {
    fail("index.html has empty #root — prerender did not inject content");
  } else if (html.length < 5000) {
    fail(`index.html suspiciously small (${html.length} bytes) — prerender may have failed`);
  } else {
    pass("index.html prerendered with content");
  }
}

// ---------------------------------------------------------------------------
// 3. Every indexable page must have a static HTML file
// ---------------------------------------------------------------------------
let missingPages = 0;
let emptyPages = 0;
let landmarkFailures = 0;

for (const routePath of indexablePaths) {
  if (isRetiredRoute(routePath)) continue; // retired routes are redirect stubs, checked in 3e
  const htmlPath =
    routePath === "/" ? rootIndex : path.join(siteDir, routePath.replace(/^\//, ""), "index.html");

  if (!fs.existsSync(htmlPath)) {
    fail(`Missing HTML for indexable route: ${routePath}`);
    missingPages++;
    continue;
  }

  const html = fs.readFileSync(htmlPath, "utf-8");
  if (html.includes('<div id="root"></div>')) {
    fail(`Empty #root in prerendered HTML for ${routePath}`);
    emptyPages++;
  }
}

// Check the entire retained public route inventory, including localized pages and
// docs readers. The indexable metadata check above covers only default-locale pages.
const retainedPaths = new Set<string>([
  ...indexablePaths,
  "/404",
  ...NON_DEFAULT_LOCALES.flatMap((locale) =>
    indexablePaths.map((routePath) => localizePath(routePath, locale))
  ),
  ...DOCS_VIEWER_INDEX.entries.map((entry) => `/${entry.slug}`),
]);
let retainedLandmarkPages = 0;
for (const routePath of retainedPaths) {
  if (isRetiredRoute(routePath)) continue;
  const htmlPath =
    routePath === "/404"
      ? path.join(siteDir, "404.html")
      : routePath === "/"
        ? rootIndex
        : path.join(siteDir, routePath.replace(/^\//, ""), "index.html");
  if (!fs.existsSync(htmlPath)) {
    fail(`Missing HTML for retained route: ${routePath}`);
    landmarkFailures++;
    continue;
  }
  const parsed = JSDOM.fragment(fs.readFileSync(htmlPath, "utf-8"));
  const main = parsed.querySelectorAll<HTMLElement>("main");
  const skip = parsed.querySelectorAll<HTMLAnchorElement>("a.plan-skip, a.dv-skip");
  const firstFocusable = parsed.querySelector(
    'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const targetId = skip[0]?.getAttribute("href")?.replace(/^#/, "");
  const ids = [...parsed.querySelectorAll<HTMLElement>("[id]")].map((element) => element.id);
  const target = targetId
    ? [...parsed.querySelectorAll<HTMLElement>("[id]")].find((element) => element.id === targetId)
    : null;
  if (
    main.length !== 1 ||
    skip.length !== 1 ||
    firstFocusable !== skip[0] ||
    !target ||
    target.tabIndex !== -1 ||
    new Set(ids).size !== ids.length
  ) {
    fail(
      `Retained route ${routePath} lacks one first-tab skip link, focusable target, unique IDs or main landmark`
    );
    landmarkFailures++;
  }
  retainedLandmarkPages++;
}

if (missingPages === 0 && emptyPages === 0) {
  pass(
    `All ${indexablePaths.filter((r) => !isRetiredRoute(r)).length} live and held pages have prerendered HTML files`
  );
}
if (landmarkFailures === 0)
  pass(
    `All ${retainedLandmarkPages} retained pages have one main landmark and first-tab skip link`
  );

// ---------------------------------------------------------------------------
// 3b. Bundled assets must be root-absolute (/assets/), never ../assets/
// ---------------------------------------------------------------------------
function collectHtmlFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, name.name);
      if (name.isDirectory()) walk(p);
      else if (name.isFile() && name.name.endsWith(".html")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

let badAssetPaths = 0;
for (const htmlPath of collectHtmlFiles(siteDir)) {
  const html = fs.readFileSync(htmlPath, "utf-8");
  if (/\.\.\/assets\//.test(html)) {
    fail(
      `HTML must not use ../assets/ for bundles (breaks when stale vs /assets/): ${path.relative(repoRoot, htmlPath)}`
    );
    badAssetPaths++;
  }
}
if (badAssetPaths === 0) {
  pass("All HTML files use root /assets/ for bundled scripts and stylesheets");
}

// ---------------------------------------------------------------------------
// 3c. Non-English prerendered homepages must not retain obvious English hero copy
// ---------------------------------------------------------------------------
const NON_ENGLISH_SITE_LOCALES = [
  "es",
  "ca",
  "zh",
  "hi",
  "ar",
  "fr",
  "pt",
  "ru",
  "bn",
  "ur",
  "id",
  "de",
] as const;
/**
 * Retired category lines. The home route is the one-pager in every locale, so none of these may appear
 * in any locale's home HTML (they were the pre-one-pager hero and the retired "memory" frame).
 */
const ENGLISH_HOME_SENTINELS = [
  "Your agents forget.",
  "Without shared memory across your AI tools:",
] as const;

let englishHomeSentinelHits = 0;
for (const loc of NON_ENGLISH_SITE_LOCALES) {
  const homePath = path.join(siteDir, loc, "index.html");
  if (!fs.existsSync(homePath)) continue;
  const html = fs.readFileSync(homePath, "utf-8");
  for (const phrase of ENGLISH_HOME_SENTINELS) {
    if (html.includes(phrase)) {
      fail(
        `site_pages/${loc}/index.html contains English homepage sentinel "${phrase.slice(0, 48)}${phrase.length > 48 ? "…" : ""}" — locale prerender may be wrong`
      );
      englishHomeSentinelHits++;
    }
  }
}
if (englishHomeSentinelHits === 0) {
  pass("No non-English homepage HTML contained English hero sentinels");
}

// ---------------------------------------------------------------------------
// 3d. The home page is the one-pager: current category, no old app chrome
// ---------------------------------------------------------------------------
const HOME_REQUIRED = [
  "A record, not recall.",
  "the system of record for AI agents",
  "04 · Advanced",
  "Grow your use as advanced capabilities arrive",
  "05 · EVALUATE",
  "Evaluate the fit",
] as const;
const HOME_FORBIDDEN = [
  "Your agents forget",
  "makes them remember",
  "state layer for AI agents",
  "Memory guarantees",
  'id="site-footer"',
  "plan-titleblock",
] as const;
let homeFailures = 0;
{
  const html = fs.readFileSync(path.join(siteDir, "index.html"), "utf-8");
  for (const phrase of HOME_REQUIRED) {
    if (!html.includes(phrase)) {
      fail(`site_pages/index.html is missing "${phrase}"`);
      homeFailures++;
    }
  }
  for (const phrase of HOME_FORBIDDEN) {
    if (html.includes(phrase)) {
      fail(`site_pages/index.html still carries retired or old-chrome content "${phrase}"`);
      homeFailures++;
    }
  }
}
if (homeFailures === 0) {
  pass(
    "Home page is the one-pager: current category, advanced and evaluate sections, no old header, footer or title blocks"
  );
}

// ---------------------------------------------------------------------------
// 3e. Route set: /install is a real page; every retired route is a redirect stub to its destination
// ---------------------------------------------------------------------------
let routeFailures = 0;
const installHtml = path.join(siteDir, "install", "index.html");
if (!fs.existsSync(installHtml)) {
  fail("site_pages/install/index.html missing: /install must stay a real page");
  routeFailures++;
} else {
  const html = fs.readFileSync(installHtml, "utf-8");
  if (
    html.includes('http-equiv="refresh"') ||
    html.length < 5000 ||
    html.includes('<div id="root"></div>')
  ) {
    fail(
      "site_pages/install/index.html is a stub or empty: /install must stay a real, prerendered page"
    );
    routeFailures++;
  }
}
for (const route of Object.keys(RETIRED_DESTINATIONS)) {
  if (!isRetiredRoute(route)) continue; // served by a docs viewer page, checked in section 5
  const stubPath = path.join(siteDir, route.replace(/^\//, ""), "index.html");
  if (!fs.existsSync(stubPath)) {
    // The build emits a stub for every retired route, so a missing stub means the page now 404s.
    fail(`site_pages${route}/index.html is missing: every retired route must have a redirect stub`);
    routeFailures++;
    continue;
  }
  const html = fs.readFileSync(stubPath, "utf-8");
  const dest = resolveDestination(route);
  const target = dest.url === "/" ? "https://neotoma.io/" : dest.url;
  for (const needle of [
    `http-equiv="refresh" content="0; url=${target}"`,
    `<link rel="canonical" href="${target}">`,
    'name="robots" content="noindex,follow"',
    `<a href="${target}">Continue`,
  ]) {
    if (!html.includes(needle)) {
      fail(
        `site_pages${route}/index.html is not a complete redirect stub (missing: ${needle.slice(0, 60)})`
      );
      routeFailures++;
      break;
    }
  }
}
for (const loc of NON_ENGLISH_SITE_LOCALES) {
  const stub = path.join(siteDir, loc, "index.html");
  if (loc === "es") {
    if (!fs.existsSync(stub) || !fs.readFileSync(stub, "utf-8").includes('<html lang="es"')) {
      fail("site_pages/es/index.html must be a substantive Spanish homepage");
      routeFailures++;
    }
    continue;
  }
  if (
    !fs.existsSync(stub) ||
    !fs.readFileSync(stub, "utf-8").includes('content="0; url=https://neotoma.io/"')
  ) {
    fail(`site_pages/${loc}/index.html must be a redirect stub to the one-pager`);
    routeFailures++;
  }
}
// One representative of each held namespace, including the agent-fetched ones (/evaluate, /markdown, /skills),
// and EVERY localized legal route (page and markdown mirror), must stay a real page until its owner
// retires it. "Real" means: present, not a redirect stub, and not the not-found page.
const notFoundHtml = fs.existsSync(path.join(siteDir, "404.html"))
  ? fs.readFileSync(path.join(siteDir, "404.html"), "utf-8")
  : "";
const firstHeading = (html: string): string | null =>
  /<h1[^>]*>([\s\S]*?)<\/h1>/i
    .exec(html)?.[1]
    ?.replace(/<[^>]+>/g, "")
    .trim() ?? null;
const notFoundHeading = firstHeading(notFoundHtml);
const heldRoutes: string[] = [
  "/evaluate",
  "/evaluate/agent-instructions",
  "/markdown/install",
  "/skills/ensure-neotoma",
  "/privacy",
  "/terms",
  "/sandbox",
  "/sandbox/terms-of-use",
  "/meet",
  ...NON_ENGLISH_SITE_LOCALES.flatMap((loc) =>
    LOCALIZED_LEGAL_PATHS.flatMap((legal) => [`/${loc}${legal}`, `/${loc}/markdown${legal}`])
  ),
];
for (const route of heldRoutes) {
  if (!heldReason(route)) {
    fail(`${route} is expected to be held but is not in HELD_ROUTES`);
    routeFailures++;
    continue;
  }
  const heldPath = path.join(siteDir, route.replace(/^\//, ""), "index.html");
  if (!fs.existsSync(heldPath)) {
    fail(`held route ${route} must stay a real page until its owner retires it (page missing)`);
    routeFailures++;
    continue;
  }
  const html = fs.readFileSync(heldPath, "utf-8");
  if (html.includes('http-equiv="refresh"')) {
    fail(
      `held route ${route} must stay a real page until its owner retires it (it is a redirect stub)`
    );
    routeFailures++;
  } else if (html.length < 5000 || html.includes('<div id="root"></div>')) {
    fail(`held route ${route} is empty or not prerendered`);
    routeFailures++;
  } else if (notFoundHeading && firstHeading(html) === notFoundHeading) {
    fail(`held route ${route} renders the not-found page instead of its content`);
    routeFailures++;
  }
}
{
  const sitemap = fs.readFileSync(path.join(siteDir, "sitemap.xml"), "utf-8");
  const locs = [...sitemap.matchAll(/<loc>https:\/\/neotoma\.io([^<]*)<\/loc>/g)].map(
    (m) => m[1] || "/"
  );
  const leaked = locs.filter((r) => isRetiredRoute(r));
  if (leaked.length) {
    fail(`sitemap.xml lists retired routes: ${leaked.slice(0, 5).join(", ")}`);
    routeFailures++;
  }
  if (process.env.SITE_PREVIEW === "1") {
    if (locs.length) {
      fail("preview sitemap.xml must contain no URLs");
      routeFailures++;
    }
    if (
      fs.readFileSync(path.join(siteDir, "robots.txt"), "utf8") !== "User-agent: *\nDisallow: /\n"
    ) {
      fail("preview robots.txt must disallow crawling");
      routeFailures++;
    }
  } else {
    for (const live of LIVE_ROUTES) {
      if (!locs.includes(live)) {
        fail(`sitemap.xml is missing live route ${live}`);
        routeFailures++;
      }
    }
  }
}
// llms.txt is read by agents without a browser: every link in its Links block must land on a real page.
{
  const llms = path.join(siteDir, "llms.txt");
  const problems = fs.existsSync(llms)
    ? llmsLinkProblems(fs.readFileSync(llms, "utf-8"), repoRoot)
    : ["llms.txt is missing"];
  for (const problem of problems) {
    fail(`llms.txt: ${problem}`);
    routeFailures++;
  }
}
if (routeFailures === 0) {
  pass(
    "Route set holds: /install is real, retired routes are redirect stubs, sitemap follows build mode"
  );
}

// ---------------------------------------------------------------------------
// 3g. Live pages: no retired phrase in JSON-LD or meta keywords, and none of the omitted claims in the text
// ---------------------------------------------------------------------------
// Scope: the live routes (/ and /install). Held pages (/evaluate, /markdown/*, /skills/*) keep older copy
// until their owner decides; they are listed in the pull request, not checked here.
// The pattern lists live in scripts/docs_viewer/claim_patterns.ts with the docs viewer's lists.
let liveClaimFailures = 0;
for (const route of LIVE_ROUTES) {
  const livePath = path.join(siteDir, route === "/" ? "" : route.slice(1), "index.html");
  if (!fs.existsSync(livePath)) continue; // missing live pages are reported in 3e
  const html = fs.readFileSync(livePath, "utf-8");
  const jsonLd = jsonLdBlocks(html).join("\n");
  const keywords = /<meta name="keywords" content="([^"]*)"/.exec(html)?.[1] ?? "";
  for (const phrase of RETIRED_META_PHRASES) {
    if (jsonLd.includes(phrase) || keywords.toLowerCase().includes(phrase.toLowerCase())) {
      fail(
        `site_pages${route === "/" ? "/" : route + "/"}index.html carries retired phrase "${phrase}" in JSON-LD or meta keywords`
      );
      liveClaimFailures++;
    }
  }
  if (!keywords.includes("system of record")) {
    fail(
      `site_pages${route === "/" ? "/" : route + "/"}index.html meta keywords do not name the category: "${keywords}"`
    );
    liveClaimFailures++;
  }
  for (const m of html.matchAll(
    /<meta (?:property|name)="(?:og|twitter):image" content="([^"]*)"/g
  )) {
    const imgPath = new URL(m[1], "https://neotoma.io").pathname;
    if (!fs.existsSync(path.join(siteDir, imgPath))) {
      fail(
        `site_pages${route === "/" ? "/" : route + "/"}index.html names a social image that is not in the build: ${imgPath}`
      );
      liveClaimFailures++;
    }
  }
  const text = pageText(html);
  // An unqualified "no telemetry" is wrong: the CLI and the stdio MCP server query the npm registry.
  const wholeText = text + " " + jsonLd;
  // The claim lists run on the visible text above; the title, meta tags and JSON-LD carry the same
  // headline copy, so the old lede, the developer-preview label and the install-time claim are checked there too.
  const headFindings = findClaimProblems(headMetaText(html), [
    ...OLD_LEDE,
    {
      id: "retired-frame",
      name: "dev-preview",
      re: DEVELOPER_PREVIEW,
      label: "developer-preview label",
    },
    {
      id: "omitted-claim",
      name: "install-time",
      re: UNMEASURED_INSTALL_TIME,
      label: "unmeasured install-time claim",
    },
  ]);
  for (const label of new Set(headFindings.map((f) => `"${f.match}" (${f.label})`))) {
    fail(
      `site_pages${route === "/" ? "/" : route + "/"}index.html title, meta tags or JSON-LD carry ${label}`
    );
    liveClaimFailures++;
  }
  // The fragment list is shared with the docs viewer lint (scripts/docs_viewer/claim_patterns.ts).
  for (const t of telemetryProblems(wholeText)) {
    fail(
      `site_pages${route === "/" ? "/" : route + "/"}index.html says "${t.match}" without the npm update-check qualification (missing: ${t.missing.join(", ")})`
    );
    liveClaimFailures++;
  }
  // The docs list plus the named live-page extras: a superset of what a docs page is checked for.
  const omitted = findClaimProblems(text, LIVE_PAGE_CLAIM_PATTERNS).filter(
    (f) => f.id !== "telemetry"
  );
  for (const label of new Set(omitted.map((f) => `${f.label} ("${f.match}")`))) {
    fail(
      `site_pages${route === "/" ? "/" : route + "/"}index.html makes an omitted claim: ${label}`
    );
    liveClaimFailures++;
  }
}
// Held pages keep their old shell but must not offer navigation entries that only land on redirect stubs.
const STUB_NAV_LABELS = ["Memory guarantees", "Memory models", "Hosted Neotoma"];
for (const heldRoute of [
  "/evaluate",
  "/evaluate/agent-instructions",
  "/sandbox",
  "/meet",
  "/skills",
  "/privacy",
  "/terms",
  "/skills/ensure-neotoma",
]) {
  const heldPath = path.join(siteDir, heldRoute.slice(1), "index.html");
  if (!fs.existsSync(heldPath)) continue;
  const heldText = pageText(fs.readFileSync(heldPath, "utf-8"));
  if (UNMEASURED_INSTALL_TIME.test(heldText)) {
    fail(`site_pages${heldRoute}/index.html makes the unmeasured install-time claim "5 minutes"`);
    liveClaimFailures++;
  }
  // The old app shell used to render a "Developer preview" badge in the header of every held page.
  if (DEVELOPER_PREVIEW.test(heldText)) {
    fail(`site_pages${heldRoute}/index.html still shows the developer-preview label`);
    liveClaimFailures++;
  }
  for (const label of STUB_NAV_LABELS) {
    // The footer entry is gone too, so no held page offers any of these labels.
    if (heldText.includes(label)) {
      fail(
        `site_pages${heldRoute}/index.html still offers the navigation entry "${label}", which only lands on a redirect stub`
      );
      liveClaimFailures++;
    }
  }
}
// "5 minutes" is an unmeasured claim (the /install claim is "a few minutes"). Besides the live and held pages
// above, check the whole served HTML, meta tags and JSON-LD included, of the pages that carried it.
for (const route of ["/", "/install", "/evaluate", "/markdown/neotoma-with-cursor"]) {
  const servedPath = path.join(siteDir, route === "/" ? "" : route.slice(1), "index.html");
  if (!fs.existsSync(servedPath)) continue;
  const servedHtml = fs.readFileSync(servedPath, "utf-8");
  const served = pageText(servedHtml) + "\n" + headMetaText(servedHtml);
  const hit = UNMEASURED_INSTALL_TIME.exec(served);
  if (hit) {
    fail(
      `site_pages${route === "/" ? "/" : route + "/"}index.html still says "${hit[0]}" (text, meta or JSON-LD)`
    );
    liveClaimFailures++;
  }
}
// /evaluate is held, and agents are sent to it from /install, so its headline (title, description, JSON-LD) and
// the text above "Who Neotoma is built for" must not carry the retired frame or an omitted claim. The rest of the
// page keeps older copy until its owner decides; this check deliberately stops at that heading.
const EVALUATE_FIRST_SCREEN_END = "Who Neotoma is built for";
const EVALUATE_RETIRED_PHRASES: [RegExp, string][] = [
  [/deterministic state/i, "deterministic state layer"],
  [/replay(able)?/i, "replay"],
  [/pick up where|picks? up where|retomen donde/i, "pick up where they left off"],
  [/memory layer|state layer/i, "retired category noun"],
];
const evaluatePath = path.join(siteDir, "evaluate", "index.html");
if (fs.existsSync(evaluatePath)) {
  const html = fs.readFileSync(evaluatePath, "utf-8");
  const headline = headMetaText(html);
  const bodyText = pageText(html);
  const endAt = bodyText.indexOf(EVALUATE_FIRST_SCREEN_END);
  if (endAt === -1) {
    fail(
      `site_pages/evaluate/index.html no longer has the "${EVALUATE_FIRST_SCREEN_END}" heading that bounds the first-screen check`
    );
    liveClaimFailures++;
  } else {
    const firstScreen = headline + "\n" + bodyText.slice(0, endAt);
    if (
      !/system of record/i.test(headline) ||
      !/system of record for AI agents/i.test(bodyText.slice(0, endAt))
    ) {
      fail(
        "site_pages/evaluate/index.html headline and first screen do not name the category (system of record for AI agents)"
      );
      liveClaimFailures++;
    }
    for (const [re, label] of EVALUATE_RETIRED_PHRASES) {
      if (re.test(firstScreen)) {
        fail(`site_pages/evaluate/index.html headline or first screen carries "${label}"`);
        liveClaimFailures++;
      }
    }
    // The shared live-page list (retired nouns, omitted claims, old lede, developer preview, install time).
    const firstScreenProblems = findClaimProblems(firstScreen, LIVE_PAGE_CLAIM_PATTERNS).filter(
      (f) => f.id !== "telemetry"
    );
    for (const label of new Set(firstScreenProblems.map((f) => `${f.label} ("${f.match}")`))) {
      fail(`site_pages/evaluate/index.html headline or first screen carries ${label}`);
      liveClaimFailures++;
    }
  }
}
// ---------------------------------------------------------------------------
// 3h. Every served page (not a redirect stub): statements the claims check found wrong on the published
// package, mirror pages whose source page is retired, and duplicated JSON-LD
// ---------------------------------------------------------------------------
function collectServedPages(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "assets") continue;
      collectServedPages(full, out);
    } else if (entry.name === "index.html" || entry.name === "404.html") {
      out.push(full);
    }
  }
  return out;
}
const isStubPage = (html: string): boolean => html.includes('http-equiv="refresh"');
/** Visible text plus title, meta tags and JSON-LD: the places a retired statement can sit. */
const servedText = (html: string): string => pageText(html) + "\n" + headMetaText(html);
let servedPageFailures = 0;
const servedPages = collectServedPages(siteDir);
const isRealPageAt = (route: string): boolean => {
  const file =
    route === "/"
      ? path.join(siteDir, "index.html")
      : path.join(siteDir, route.slice(1), "index.html");
  return fs.existsSync(file) && !isStubPage(fs.readFileSync(file, "utf-8"));
};
for (const file of servedPages) {
  const rel = path.relative(siteDir, file).replace(/\\/g, "/");
  const html = fs.readFileSync(file, "utf-8");
  if (isStubPage(html)) continue;
  const route = "/" + rel.replace(/(^|\/)index\.html$/, "").replace(/404\.html$/, "404");
  const shown = rel;
  const text = servedText(html);
  const stated = findClaimProblems(text, SERVED_PAGE_STATEMENTS).filter(
    (f) => f.id !== "telemetry"
  );
  for (const f of new Map(stated.map((x) => [x.name + x.match, x])).values()) {
    fail(`site_pages/${shown} carries "${f.match}" (${f.label})`);
    servedPageFailures++;
  }
  // The old shell footer links only to served pages (a footer link to a retired page lands on a stub).
  if (!/^\/[a-z]{2}(\/|$)/.test(route)) {
    const footerStart = html.indexOf("<footer");
    const footerEnd = footerStart < 0 ? -1 : html.indexOf("</footer>", footerStart);
    if (footerEnd >= 0) {
      for (const tag of scanHtml(html.slice(footerStart, footerEnd)).tags) {
        const href = tag.name === "a" ? tag.attrs.find((a) => a.name === "href")?.value : undefined;
        if (!href || !href.startsWith("/") || href.startsWith("//")) continue;
        const target = href.split(/[?#]/)[0].replace(/\/$/, "") || "/";
        if (!isRealPageAt(target)) {
          fail(`site_pages/${shown} footer links to ${target}, which is a redirect stub`);
          servedPageFailures++;
        }
      }
    }
  }
  // Each JSON-LD block is emitted once.
  const blocks = jsonLdBlocks(html).map((b) => b.trim());
  if (new Set(blocks).size !== blocks.length) {
    fail(`site_pages/${shown} emits the same JSON-LD block more than once`);
    servedPageFailures++;
  }
  // A markdown mirror is served only while its source page is.
  if (/^\/markdown\/./.test(route)) {
    const source = route.slice("/markdown".length).replace(/\/$/, "");
    if (!isRealPageAt(source)) {
      fail(
        `site_pages/${shown} is a markdown mirror whose source page ${source} is a redirect stub; the mirror must be a stub too`
      );
      servedPageFailures++;
    }
  }
}
// The default /install page selects among 14 distinct paths. Its JSON-LD must stay neutral,
// and the full effects link must precede the first visible command in the server-rendered page.
const installHtmlForSelectedFlow = path.join(siteDir, "install", "index.html");
if (fs.existsSync(installHtmlForSelectedFlow)) {
  const html = fs.readFileSync(installHtmlForSelectedFlow, "utf-8");
  const blocks = jsonLdBlocks(html);
  const effectsLink = html.indexOf('href="/install/system-changes/"');
  const firstCommand = html.indexOf(`npm install -g neotoma@${REPO_VERSION}`);
  if (
    blocks.some((block) => block.includes('"HowTo"')) ||
    !blocks.some((block) => block.includes('"WebPage"')) ||
    !html.includes("Choose your tool") ||
    effectsLink < 0 ||
    firstCommand < 0 ||
    effectsLink >= firstCommand
  ) {
    fail("site_pages/install/index.html selected-host flow lacks neutral metadata or upfront effects disclosure");
    servedPageFailures++;
  }
}
// Validate the actual exported JSON-LD on every route, not only the route metadata source.
for (const filePath of collectHtmlFiles(siteDir)) {
  const blocks = jsonLdBlocks(fs.readFileSync(filePath, "utf-8"));
  for (const block of blocks) {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(block) as Record<string, unknown>;
    } catch {
      continue; // malformed JSON-LD is reported by the general structured-data validation
    }
    if (entry["@type"] !== "HowTo") continue;
    const text = (Array.isArray(entry.step) ? entry.step : [])
      .map((step: { text?: string }) => step.text ?? "")
      .join(" ");
    if (
      (text.includes("npm install -g neotoma") &&
        !text.includes(`npm install -g neotoma@${REPO_VERSION}`)) ||
      text.includes("setup --tool openclaw") ||
      (entry.name === "How to connect Neotoma to Claude Desktop" &&
        !text.includes("neotoma setup --tool claude-desktop --install-scope user"))
    ) {
      fail(`${path.relative(siteDir, filePath)} has unsupported or unpinned HowTo instructions`);
      servedPageFailures++;
    }
  }
}
// Each advanced card must keep its status and qualification together in the exported page.
const homeForLimits = path.join(siteDir, "index.html");
if (fs.existsSync(homeForLimits)) {
  const homeHtml = fs.readFileSync(homeForLimits, "utf-8");
  const advancedStart = homeHtml.indexOf('id="vision"');
  const evaluateStart = homeHtml.indexOf('id="evaluate"', advancedStart);
  const advancedHtml =
    advancedStart >= 0 && evaluateStart > advancedStart
      ? homeHtml.slice(advancedStart, evaluateStart)
      : "";
  const cardPattern =
    /<div class="plan-vision-content"><p class="plan-label">([^<]+)<\/p><h3>([^<]+)<\/h3><p>([^<]+)<\/p>/g;
  const cards = [...advancedHtml.matchAll(cardPattern)].map((match) => ({
    status: match[1],
    title: match[2],
    detail: match[3],
  }));
  const expectedCards = [
    {
      status: "Supported",
      title: "A shared system of record",
      detail:
        "Teams and collaborators can work with the same records through configured access to one instance and data profile.",
    },
    {
      status: "Supported",
      title: "Verified identity and scoped access",
      detail:
        "An admitted signed request can establish agent identity; active scoped grants determine permitted actions. Other paths may have self-reported or absent writer identity.",
    },
    {
      status: "Supported",
      title: "Selected record exchange",
      detail:
        "Configured peers exchange selected records between separate instances, without claiming complete history, files or deletions.",
    },
    {
      status: "Planned",
      title: "Bounded domain ownership",
      detail:
        "Planned domain ownership would make clear who may correct each bounded part of the record.",
    },
    {
      status: "Planned",
      title: "Retained positions",
      detail:
        "Planned position tracking would make a selected position inspectable while retaining the competing claim.",
    },
    {
      status: "Planned",
      title: "Inspectable explanations",
      detail:
        "Planned explanations would show why a value holds, whose authority it follows and which connected values a change could affect.",
    },
  ] as const;
  if (cards.length !== expectedCards.length) {
    fail(
      `site_pages/index.html advanced section has ${cards.length} capability cards; expected six`
    );
    servedPageFailures++;
  }
  for (const expected of expectedCards) {
    const card = cards.find((candidate) => candidate.title === expected.title);
    if (!card || card.status !== expected.status || card.detail !== expected.detail) {
      fail(
        `site_pages/index.html advanced capability "${expected.title}" lost its status or limit`
      );
      servedPageFailures++;
    }
  }
  const homeText = servedText(homeHtml).replace(/\s+/g, " ");
  if (
    /Authority over the record is not modeled|organizations, workspaces and rules for who may correct|One operator per instance|users are separate tenants|corrections always win|export (with|including) (full )?history/i.test(
      homeText
    )
  ) {
    fail("site_pages/index.html limits section still carries the retired authority limit");
    servedPageFailures++;
  }
}
liveClaimFailures += servedPageFailures;
if (servedPageFailures === 0) {
  pass(
    `Served pages: ${servedPages.length} files checked for retired statements, duplicate JSON-LD, orphan markdown mirrors and the /install selected-host flow`
  );
}

if (liveClaimFailures === 0) {
  pass(
    "Live pages: no retired phrase in JSON-LD or meta keywords, and no omitted claim in the text"
  );
}

// ---------------------------------------------------------------------------
// 4. 404.html must render the not-found page, not the homepage
// ---------------------------------------------------------------------------
const notFoundPath = path.join(siteDir, "404.html");
if (!fs.existsSync(notFoundPath)) {
  fail("404.html does not exist");
} else {
  const html = fs.readFileSync(notFoundPath, "utf-8");
  const looksLikeNotFound = /page\s*not\s*found/i.test(html) || html.includes("404");
  if (!looksLikeNotFound) {
    fail("404.html does not contain expected not-found content — may be rendering wrong page");
  } else {
    pass("404.html contains not-found content");
  }
}

// ---------------------------------------------------------------------------
// 5. Curated topic pages (/<slug>/, frontend/src/site/docs_viewer_manifest.ts)
// ---------------------------------------------------------------------------
{
  const allowedSourceSlugs = [...DOCS_VIEWER_INDEX.entries, ...SPANISH_DOCS_VIEWER_INDEX.entries].map((entry) => entry.slug);
  const { problems, checked } = validateDocsViewerExport(siteDir, {
    sourceContext: process.env.SITE_PREVIEW === "1" ? "local-preview" : "published",
    repoRoot: process.cwd(),
    allowedSourceSlugs,
  });
  const spanish = validateDocsViewerExport(siteDir, {
    index: SPANISH_DOCS_VIEWER_INDEX,
    manifest: SPANISH_DOCS_VIEWER_MANIFEST,
    sourceContext: process.env.SITE_PREVIEW === "1" ? "local-preview" : "published",
    repoRoot: process.cwd(),
    allowedSourceSlugs,
    skipGlobalChecks: true,
  });
  for (const problem of problems) fail(problem);
  for (const problem of spanish.problems) fail(problem);
  if (problems.length === 0 && spanish.problems.length === 0) {
    pass(
      `Docs viewer: ${checked} English and ${spanish.checked} Spanish included page(s) are real, safe without JavaScript and claim-safe; optional analytics asset is constrained`
    );
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
try {
  const appBases = SPANISH_RETAINED_BASE_ROUTES.filter((route) => !isDocsViewerRoute(route));
  const appRoutes = ["/en/", ...appBases.flatMap((route) => [route, `/es${route === "/" ? "/" : route}`])];
  const ui = assertExportedUiEntry(siteDir, repoRoot, appRoutes);
  pass(`UI entry ${ui.entry} matches source ${ui.head.slice(0, 12)}, compiled asset and ${appRoutes.length} EN/ES app pages`);
} catch (error) {
  fail(`Source-bound UI export mismatch: ${(error as Error).message}`);
}

if (failures === 0) {
  console.log(
    `\n✓  Site export validation passed — ${indexablePaths.length} route metadata entries checked (${process.env.SITE_PREVIEW === "1" ? "preview noindex" : "production indexable"}).\n`
  );
  process.exit(0);
} else {
  console.error(`\n${failures} check(s) failed. Fix before deploying.\n`);
  process.exit(1);
}
