#!/usr/bin/env tsx
/**
 * Static site builder for GitHub Pages (neotoma.io).
 *
 * Adding a new public page:
 *   1. Add the route to APP_ROUTES in frontend/src/components/MainApp.tsx.
 *   2. Add an entry to ROUTE_METADATA in frontend/src/site/seo_metadata.ts
 *      with at least title, description, and robots ("index,follow" for
 *      indexable pages). Pages with "index,follow" are automatically
 *      included in the sitemap and prerendered as static HTML.
 *   3. Run `npm run validate:routes` to confirm parity.
 *   4. After building (`npm run build:pages:site`), run
 *      `npm run validate:site-export` to verify the HTML was emitted.
 *
 * CI runs both validations before deploying; a mismatch blocks the deploy.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FAVICON_SVG } from "../frontend/src/site/site_data";
import {
  DEFAULT_LOCALE,
  NON_DEFAULT_LOCALES,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "../frontend/src/i18n/config";
import { getLocaleFromPath, localizePath, stripLocaleFromPath } from "../frontend/src/i18n/routing";
import {
  buildRobotsTxt,
  buildSitemapXml,
  INDEXABLE_SITE_PAGE_PATHS,
  injectRouteMetaIntoHtml,
  SITEMAP_PATHS,
} from "../frontend/src/site/seo_metadata";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "site_pages");
const outputFile = path.join(outputDir, "index.html");
const noJekyllFile = path.join(outputDir, ".nojekyll");
const faviconFile = path.join(outputDir, "favicon.svg");
const heroImageSrc = path.join(repoRoot, "frontend", "public", "neotoma-hero.png");
const heroImageDest = path.join(outputDir, "neotoma-hero.png");
const ogImageSrc = path.join(repoRoot, "frontend", "public", "neotoma-og-1200x630.png");
const ogImageDest = path.join(outputDir, "neotoma-og-1200x630.png");
const robotsFile = path.join(outputDir, "robots.txt");
const sitemapFile = path.join(outputDir, "sitemap.xml");
const llmsTxtSrc = path.join(repoRoot, "frontend", "public", "llms.txt");
const llmsTxtDest = path.join(outputDir, "llms.txt");
const notFoundFile = path.join(outputDir, "404.html");
const publicIndex = path.join(repoRoot, "public", "index.html");
const publicAssetsDir = path.join(repoRoot, "public", "assets");

const buildId =
  process.env.GITHUB_SHA?.slice(0, 7) ||
  process.env.BUILD_ID ||
  `local-${Date.now()}`;

function markdownMirrorStaticPaths(): string[] {
  const out: string[] = [];
  for (const p of INDEXABLE_SITE_PAGE_PATHS) {
    const md = p === "/" ? "/markdown" : `/markdown${p}`;
    out.push(md);
    for (const loc of NON_DEFAULT_LOCALES) {
      out.push(localizePath(md, loc));
    }
  }
  return out;
}

const LOCALE_TO_GOOGLE_CODE: Record<SupportedLocale, string> = {
  en: "en",
  es: "es",
  ca: "ca",
  zh: "zh-CN",
  hi: "hi",
  ar: "ar",
  fr: "fr",
  pt: "pt",
  ru: "ru",
  bn: "bn",
  ur: "ur",
  id: "id",
  de: "de",
};

/** Read Vite build output and convert to relative asset paths for the root. */
function readPublicHtml(): string {
  if (!fs.existsSync(publicIndex)) {
    throw new Error("Missing public/index.html (run 'npm run build:ui' first).");
  }
  const html = fs.readFileSync(publicIndex, "utf-8");
  let out = html
    .replaceAll('src="/assets/', 'src="assets/')
    .replaceAll('href="/assets/', 'href="assets/');
  const buildComment = `\n    <!-- build: ${buildId} -->`;
  if (out.includes("</head>")) {
    out = out.replace("</head>", `${buildComment}\n  </head>`);
  }
  return out;
}

/**
 * Build HTML for a specific route. Subpages live in site_pages/{slug}/index.html
 * so asset paths must go up one directory level (../assets/).
 */
function buildHtmlForRoute(rootHtml: string, routePath: string): string {
  let html = injectRouteMetaIntoHtml(rootHtml, routePath);
  if (routePath !== "/") {
    const depth = routePath.replace(/^\//, "").split("/").filter(Boolean).length;
    const relativePrefix = "../".repeat(depth);
    html = html
      .replaceAll('src="assets/', `src="${relativePrefix}assets/`)
      .replaceAll('href="assets/', `href="${relativePrefix}assets/`);
  }
  return html;
}

function getOutputPathForRoute(routePath: string): string {
  if (routePath === "/") return outputFile;
  return path.join(outputDir, routePath.replace(/^\//, ""), "index.html");
}

function getContentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (filePath.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function startStaticServer(rootDir: string): Promise<{ origin: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://localhost");
      const rawPath = decodeURIComponent(url.pathname);
      const cleanPath = rawPath.replace(/^\/+/, "");
      const candidates = [
        path.join(rootDir, cleanPath),
        path.join(rootDir, cleanPath, "index.html"),
      ];
      if (rawPath === "/") {
        candidates.unshift(path.join(rootDir, "index.html"));
      }

      let filePath = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      let statusCode = 200;

      if (!filePath) {
        filePath = path.join(rootDir, "404.html");
        statusCode = 404;
      }

      try {
        const content = fs.readFileSync(filePath);
        res.statusCode = statusCode;
        res.setHeader("Content-Type", getContentType(filePath));
        res.end(content);
      } catch {
        res.statusCode = 500;
        res.end("Internal server error");
      }
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to start prerender HTTP server."));
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((done, fail) => server.close((err) => (err ? fail(err) : done()))),
      });
    });
  });
}

async function prerenderHtmlRoutes(routePaths: readonly string[]): Promise<void> {
  const { chromium } = await import("playwright");
  const server = await startStaticServer(outputDir);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  try {
    for (const routePath of routePaths) {
      const targetUrl = `${server.origin}${routePath}`;
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await translatePageForRoute(page, routePath);
      const renderedHtml = await page.content();
      fs.writeFileSync(getOutputPathForRoute(routePath), `<!DOCTYPE html>\n${renderedHtml}\n`, "utf-8");
    }

    await page.goto(`${server.origin}/404`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(250);
    const notFoundHtml = await page.content();
    fs.writeFileSync(notFoundFile, `<!DOCTYPE html>\n${notFoundHtml}\n`, "utf-8");
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
}

async function translatePageForRoute(
  page: import("playwright").Page,
  routePath: string,
): Promise<void> {
  const locale = getLocaleFromPath(routePath) ?? DEFAULT_LOCALE;
  if (locale === DEFAULT_LOCALE) {
    await page.waitForTimeout(50);
    return;
  }
  if (stripLocaleFromPath(routePath) !== "/") {
    await page.waitForTimeout(50);
    return;
  }
  const target = LOCALE_TO_GOOGLE_CODE[locale];
  const translationScript = `
    (async () => {
      const target = ${JSON.stringify(target)};
      const locale = ${JSON.stringify(locale)};
      const hasLetters = (value) => /[A-Za-z]/.test(value);
      const shouldTranslateText = (value) => {
        const trimmed = value.trim();
        if (!trimmed || trimmed.length < 2) return false;
        if (!hasLetters(trimmed)) return false;
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/") || trimmed.startsWith("#")) {
          return false;
        }
        return true;
      };
      const isNoTranslate = (el) => {
        let cur = el;
        while (cur) {
          if (cur.getAttribute("translate") === "no") return true;
          cur = cur.parentElement;
        }
        return false;
      };
      const getCoreWithPadding = (raw) => {
        const core = raw.trim();
        if (!shouldTranslateText(core)) return null;
        const start = raw.indexOf(core);
        const end = start + core.length;
        return { core, prefix: raw.slice(0, start), suffix: raw.slice(end) };
      };
      const collectTextNodes = () => {
        const nodes = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const textNode = node;
          const parent = textNode.parentElement;
          if (parent && !["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE"].includes(parent.tagName) && !isNoTranslate(parent)) {
            const raw = textNode.textContent || "";
            if (getCoreWithPadding(raw)) nodes.push(textNode);
          }
          node = walker.nextNode();
        }
        return nodes;
      };
      const collectAttributeTargets = () => {
        const attrs = ["title", "aria-label", "placeholder"];
        const targets = [];
        for (const attr of attrs) {
          document.querySelectorAll("[" + attr + "]").forEach((element) => {
            if (isNoTranslate(element)) return;
            const value = element.getAttribute(attr);
            if (value && shouldTranslateText(value)) targets.push({ element, attr });
          });
        }
        return targets;
      };
      const collectMetaTargets = () =>
        Array.from(document.querySelectorAll("meta[name='description'],meta[property='og:title'],meta[property='og:description'],meta[name='twitter:title'],meta[name='twitter:description']"));
      const phraseSet = new Set();
      const textNodes = collectTextNodes();
      const attributeTargets = collectAttributeTargets();
      const metaTargets = collectMetaTargets();
      for (const textNode of textNodes) {
        const raw = textNode.textContent || "";
        const parsed = getCoreWithPadding(raw);
        if (parsed) phraseSet.add(parsed.core);
      }
      for (const targetSpec of attributeTargets) {
        const value = targetSpec.element.getAttribute(targetSpec.attr);
        if (value && shouldTranslateText(value)) phraseSet.add(value.trim());
      }
      for (const meta of metaTargets) {
        const content = meta.getAttribute("content");
        if (content && shouldTranslateText(content)) phraseSet.add(content.trim());
      }
      const titleText = document.title;
      if (titleText && shouldTranslateText(titleText)) phraseSet.add(titleText.trim());
      if (!window.__ntBuildTranslateCache) window.__ntBuildTranslateCache = {};
      const byLocale = window.__ntBuildTranslateCache;
      const cache = byLocale[locale] || {};
      byLocale[locale] = cache;
      const translateText = async (text) => {
        if (cache[text]) return cache[text];
        const query = new URLSearchParams({ client: "gtx", sl: "en", tl: target, dt: "t", q: text });
        const response = await fetch("https://translate.googleapis.com/translate_a/single?" + query.toString());
        if (!response.ok) return text;
        const payload = await response.json();
        const top = Array.isArray(payload) ? payload[0] : null;
        if (!Array.isArray(top)) return text;
        const translated = top.map((segment) => (Array.isArray(segment) && typeof segment[0] === "string" ? segment[0] : "")).join("");
        return translated || text;
      };
      const missing = Array.from(phraseSet).slice(0, 250).filter((phrase) => !cache[phrase]);
      const queue = missing.slice();
      const workers = Array.from({ length: 8 }, async () => {
        while (queue.length) {
          const phrase = queue.shift();
          if (!phrase) return;
          try {
            cache[phrase] = await translateText(phrase);
          } catch {
            cache[phrase] = phrase;
          }
        }
      });
      await Promise.all(workers);
      for (const textNode of textNodes) {
        const raw = textNode.textContent || "";
        const parsed = getCoreWithPadding(raw);
        if (!parsed) continue;
        textNode.textContent = parsed.prefix + (cache[parsed.core] || parsed.core) + parsed.suffix;
      }
      for (const targetSpec of attributeTargets) {
        const value = targetSpec.element.getAttribute(targetSpec.attr);
        if (!value) continue;
        const trimmed = value.trim();
        if (!shouldTranslateText(trimmed)) continue;
        targetSpec.element.setAttribute(targetSpec.attr, cache[trimmed] || trimmed);
      }
      for (const meta of metaTargets) {
        const content = meta.getAttribute("content");
        if (!content) continue;
        const trimmed = content.trim();
        if (!shouldTranslateText(trimmed)) continue;
        meta.setAttribute("content", cache[trimmed] || trimmed);
      }
      if (titleText && shouldTranslateText(titleText)) {
        const trimmed = titleText.trim();
        document.title = cache[trimmed] || trimmed;
      }
      document.documentElement.lang = locale;
    })();
  `;
  await page.evaluate(translationScript);
  await page.waitForTimeout(50);
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const legacyCssFile = path.join(outputDir, "site.css");
  if (fs.existsSync(legacyCssFile)) {
    fs.rmSync(legacyCssFile);
  }
  if (!fs.existsSync(publicAssetsDir)) {
    throw new Error("Missing public/assets (run 'npm run build:ui' first).");
  }
  const outputAssetsDir = path.join(outputDir, "assets");
  fs.cpSync(publicAssetsDir, outputAssetsDir, { recursive: true });

  const rootHtml = readPublicHtml();

  // Seed static route files with route-specific metadata.
  fs.writeFileSync(outputFile, buildHtmlForRoute(rootHtml, "/"), "utf-8");

  // Pre-render per-route HTML so bots see correct meta tags without executing JS
  for (const locale of SUPPORTED_LOCALES) {
    const localizedRoot = localizePath("/", locale);
    if (!SITEMAP_PATHS.includes(localizedRoot)) {
      throw new Error(`SITEMAP_PATHS missing localized root route: ${localizedRoot}`);
    }
  }

  const allStaticRoutePaths = [...new Set([...SITEMAP_PATHS, ...markdownMirrorStaticPaths()])];

  let routeCount = 0;
  for (const routePath of allStaticRoutePaths) {
    if (routePath === "/") continue;
    const slug = routePath.replace(/^\//, "");
    const routeDir = path.join(outputDir, slug);
    fs.mkdirSync(routeDir, { recursive: true });
    fs.writeFileSync(
      path.join(routeDir, "index.html"),
      buildHtmlForRoute(rootHtml, routePath),
      "utf-8",
    );
    routeCount++;
  }

  fs.writeFileSync(notFoundFile, buildHtmlForRoute(rootHtml, "/404"), "utf-8");

  fs.writeFileSync(noJekyllFile, "", "utf-8");
  fs.writeFileSync(faviconFile, FAVICON_SVG.trim(), "utf-8");
  if (fs.existsSync(heroImageSrc)) {
    fs.copyFileSync(heroImageSrc, heroImageDest);
    console.log(`Copied hero image: ${path.relative(repoRoot, heroImageDest)}`);
  }
  if (fs.existsSync(ogImageSrc)) {
    fs.copyFileSync(ogImageSrc, ogImageDest);
    console.log(`Copied OG image: ${path.relative(repoRoot, ogImageDest)}`);
  }
  fs.writeFileSync(robotsFile, buildRobotsTxt(), "utf-8");
  fs.writeFileSync(sitemapFile, buildSitemapXml(), "utf-8");
  if (fs.existsSync(llmsTxtSrc)) {
    fs.copyFileSync(llmsTxtSrc, llmsTxtDest);
    console.log(`Copied llms.txt: ${path.relative(repoRoot, llmsTxtDest)}`);
  }
  await prerenderHtmlRoutes(allStaticRoutePaths);

  console.log(`Built site page: ${path.relative(repoRoot, outputFile)}`);
  console.log(`Built ${routeCount} route pages (fully pre-rendered HTML)`);
  console.log(`Built 404.html (pre-rendered fallback)`);
  console.log(`Copied assets: ${path.relative(repoRoot, outputAssetsDir)}`);
  console.log(`Built favicon: ${path.relative(repoRoot, faviconFile)}`);
  console.log(`Built robots: ${path.relative(repoRoot, robotsFile)}`);
  console.log(`Built sitemap: ${path.relative(repoRoot, sitemapFile)}`);
}

void main();
