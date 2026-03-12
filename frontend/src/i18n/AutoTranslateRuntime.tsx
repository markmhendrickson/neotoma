import { useEffect } from "react";
import { DEFAULT_LOCALE, type SupportedLocale } from "@/i18n/config";

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

const TRANSLATION_CACHE_PREFIX = "neotoma-translations-v2";
const TEXT_NODE_ORIGINAL = "__ntOriginalText";

type TranslatableAttribute = "title" | "aria-label" | "placeholder";
const TRANSLATABLE_ATTRIBUTES: readonly TranslatableAttribute[] = [
  "title",
  "aria-label",
  "placeholder",
];

function hasLetters(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

function shouldTranslateText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length < 2) return false;
  if (!hasLetters(trimmed)) return false;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return false;
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return false;
  return true;
}

async function translateText(text: string, locale: SupportedLocale): Promise<string> {
  const target = LOCALE_TO_GOOGLE_CODE[locale];
  const query = new URLSearchParams({
    client: "gtx",
    sl: "en",
    tl: target,
    dt: "t",
    q: text,
  });
  const response = await fetch(`https://translate.googleapis.com/translate_a/single?${query.toString()}`);
  if (!response.ok) return text;
  const payload = (await response.json()) as unknown;
  const top = Array.isArray(payload) ? payload[0] : null;
  if (!Array.isArray(top)) return text;
  const translated = top
    .map((segment) => (Array.isArray(segment) && typeof segment[0] === "string" ? segment[0] : ""))
    .join("");
  return translated || text;
}

function readCache(locale: SupportedLocale): Record<string, string> {
  try {
    const raw = localStorage.getItem(`${TRANSLATION_CACHE_PREFIX}:${locale}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeCache(locale: SupportedLocale, cache: Record<string, string>) {
  try {
    localStorage.setItem(`${TRANSLATION_CACHE_PREFIX}:${locale}`, JSON.stringify(cache));
  } catch {
    // Ignore storage failures.
  }
}

async function ensureTranslations(phrases: string[], locale: SupportedLocale, cache: Record<string, string>) {
  const missing = phrases.filter((phrase) => !cache[phrase]);
  if (!missing.length) return;
  const queue = [...missing];
  const concurrency = 6;

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const phrase = queue.shift();
      if (!phrase) return;
      try {
        cache[phrase] = await translateText(phrase, locale);
      } catch {
        cache[phrase] = phrase;
      }
    }
  });

  await Promise.all(workers);
  writeCache(locale, cache);
}

function getCoreWithPadding(raw: string): { core: string; prefix: string; suffix: string } | null {
  const core = raw.trim();
  if (!shouldTranslateText(core)) return null;
  const start = raw.indexOf(core);
  const end = start + core.length;
  return { core, prefix: raw.slice(0, start), suffix: raw.slice(end) };
}

function isNoTranslate(el: Element | null): boolean {
  let cur = el;
  while (cur) {
    if (cur.getAttribute("translate") === "no") return true;
    cur = cur.parentElement;
  }
  return false;
}

function collectTextNodes(root: ParentNode): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const parent = textNode.parentElement;
    if (!parent) {
      node = walker.nextNode();
      continue;
    }
    if (["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE"].includes(parent.tagName)) {
      node = walker.nextNode();
      continue;
    }
    if (isNoTranslate(parent)) {
      node = walker.nextNode();
      continue;
    }
    const raw = textNode.textContent || "";
    const parsed = getCoreWithPadding(raw);
    if (parsed) {
      if (!(textNode as unknown as Record<string, unknown>)[TEXT_NODE_ORIGINAL]) {
        (textNode as unknown as Record<string, unknown>)[TEXT_NODE_ORIGINAL] = raw;
      }
      nodes.push(textNode);
    }
    node = walker.nextNode();
  }
  return nodes;
}

function collectAttributeTargets(root: ParentNode): Array<{ element: Element; attr: TranslatableAttribute }> {
  const targets: Array<{ element: Element; attr: TranslatableAttribute }> = [];
  for (const attr of TRANSLATABLE_ATTRIBUTES) {
    root.querySelectorAll(`[${attr}]`).forEach((element) => {
      if (isNoTranslate(element as Element)) return;
      const value = element.getAttribute(attr);
      if (value && shouldTranslateText(value)) {
        targets.push({ element, attr });
      }
    });
  }
  return targets;
}

function restoreEnglish(root: ParentNode) {
  for (const textNode of collectTextNodes(root)) {
    const original = (textNode as unknown as Record<string, unknown>)[TEXT_NODE_ORIGINAL];
    if (typeof original === "string") {
      textNode.textContent = original;
    }
  }
  for (const { element, attr } of collectAttributeTargets(root)) {
    const originalAttr = element.getAttribute(`data-nt-original-${attr}`);
    if (originalAttr) {
      element.setAttribute(attr, originalAttr);
    }
  }
}

async function translateDom(root: ParentNode, locale: SupportedLocale) {
  const cache = readCache(locale);
  const textNodes = collectTextNodes(root);
  const attrTargets = collectAttributeTargets(root);

  const phraseSet = new Set<string>();
  for (const textNode of textNodes) {
    const raw = ((textNode as unknown as Record<string, unknown>)[TEXT_NODE_ORIGINAL] as string) ?? textNode.textContent ?? "";
    const parsed = getCoreWithPadding(raw);
    if (parsed) phraseSet.add(parsed.core);
  }
  for (const { element, attr } of attrTargets) {
    const value = element.getAttribute(attr);
    if (value && shouldTranslateText(value)) phraseSet.add(value.trim());
  }

  await ensureTranslations([...phraseSet], locale, cache);

  for (const textNode of textNodes) {
    const original = ((textNode as unknown as Record<string, unknown>)[TEXT_NODE_ORIGINAL] as string) ?? textNode.textContent ?? "";
    const parsed = getCoreWithPadding(original);
    if (!parsed) continue;
    const translated = cache[parsed.core] ?? parsed.core;
    textNode.textContent = `${parsed.prefix}${translated}${parsed.suffix}`;
  }

  for (const { element, attr } of attrTargets) {
    const value = element.getAttribute(attr);
    if (!value) continue;
    const trimmed = value.trim();
    if (!shouldTranslateText(trimmed)) continue;
    if (!element.getAttribute(`data-nt-original-${attr}`)) {
      element.setAttribute(`data-nt-original-${attr}`, value);
    }
    const translated = cache[trimmed] ?? trimmed;
    element.setAttribute(attr, translated);
  }
}

export function AutoTranslateRuntime({ locale, routeKey }: { locale: SupportedLocale; routeKey: string }) {
  useEffect(() => {
    let cancelled = false;
    const root = document.body;

    const run = async () => {
      if (cancelled) return;
      if (locale === DEFAULT_LOCALE) {
        restoreEnglish(root);
        return;
      }
      await translateDom(root, locale);
    };

    const debounced = () => {
      window.clearTimeout((debounced as unknown as { id?: number }).id);
      (debounced as unknown as { id?: number }).id = window.setTimeout(() => {
        void run();
      }, 50);
    };

    const observer = new MutationObserver(() => debounced());
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    });

    void run();

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [locale, routeKey]);

  return null;
}
