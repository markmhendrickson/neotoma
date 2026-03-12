import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  LOCALE_STORAGE_KEY,
  type SupportedLocale,
} from "@/i18n/config";

function stripQueryAndHash(pathname: string): string {
  const [withoutQuery] = pathname.split("?");
  const [withoutHash] = withoutQuery.split("#");
  return withoutHash || "/";
}

function splitPath(pathname: string): string[] {
  return stripQueryAndHash(pathname).split("/").filter(Boolean);
}

export function getLocaleFromPath(pathname: string): SupportedLocale | null {
  const [candidate] = splitPath(pathname);
  if (isSupportedLocale(candidate)) return candidate;
  return null;
}

export function stripLocaleFromPath(pathname: string): string {
  const locale = getLocaleFromPath(pathname);
  if (!locale) return stripQueryAndHash(pathname) || "/";
  const parts = splitPath(pathname);
  const withoutLocale = parts.slice(1).join("/");
  return withoutLocale ? `/${withoutLocale}` : "/";
}

export function localizePath(pathname: string, locale: SupportedLocale): string {
  const hashIndex = pathname.indexOf("#");
  const hash = hashIndex >= 0 ? pathname.slice(hashIndex) : "";
  const basePath = stripLocaleFromPath(pathname);
  if (locale === DEFAULT_LOCALE) return `${basePath}${hash}`;
  const localized = basePath === "/" ? `/${locale}` : `/${locale}${basePath}`;
  return `${localized}${hash}`;
}

export function localizeHashHref(hashHref: string, locale: SupportedLocale): string {
  if (!hashHref.startsWith("#")) return hashHref;
  const prefixedRoot = localizePath("/", locale);
  return `${prefixedRoot}${hashHref}`;
}

export function normalizeToDefaultRoute(pathname: string): string {
  const stripped = stripLocaleFromPath(pathname);
  if (!stripped) return "/";
  return stripped !== "/" && stripped.endsWith("/") ? stripped.slice(0, -1) : stripped;
}

export function readSavedLocale(): SupportedLocale | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return isSupportedLocale(value) ? value : null;
}

export function saveLocale(locale: SupportedLocale): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

export function resolvePreferredLocale(): SupportedLocale {
  const saved = readSavedLocale();
  if (saved) return saved;
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const preferred = [...(window.navigator.languages || []), window.navigator.language]
    .filter(Boolean)
    .map((entry) => entry.toLowerCase().split("-")[0]);
  for (const candidate of preferred) {
    if (isSupportedLocale(candidate)) {
      return candidate;
    }
  }
  return DEFAULT_LOCALE;
}
