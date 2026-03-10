export const SUPPORTED_LOCALES = [
  "en",
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

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";
export const NON_DEFAULT_LOCALES: readonly SupportedLocale[] = SUPPORTED_LOCALES.filter(
  (locale) => locale !== DEFAULT_LOCALE,
);

export const LOCALE_STORAGE_KEY = "preferred_locale";

export const LOCALE_LANGUAGE_NAME: Record<SupportedLocale, string> = {
  en: "English",
  es: "Español",
  ca: "Català",
  zh: "中文",
  hi: "हिंदी",
  ar: "العربية",
  fr: "Français",
  pt: "Português",
  ru: "Русский",
  bn: "বাংলা",
  ur: "اردو",
  id: "Bahasa Indonesia",
  de: "Deutsch",
};

export const LOCALE_TO_OG: Record<SupportedLocale, string> = {
  en: "en_US",
  es: "es_ES",
  ca: "ca_ES",
  zh: "zh_CN",
  hi: "hi_IN",
  ar: "ar_SA",
  fr: "fr_FR",
  pt: "pt_PT",
  ru: "ru_RU",
  bn: "bn_BD",
  ur: "ur_PK",
  id: "id_ID",
  de: "de_DE",
};

export const RTL_LOCALES = new Set<SupportedLocale>(["ar", "ur"]);

export function isSupportedLocale(value: string | undefined | null): value is SupportedLocale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function getLocaleDirection(locale: SupportedLocale): "ltr" | "rtl" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}
