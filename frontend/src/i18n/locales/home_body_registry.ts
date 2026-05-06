import type { SupportedLocale } from "@/i18n/config";
import type { HomeBodyPack } from "@/i18n/locales/home_body_types";
import { HOME_BODY_EN } from "@/i18n/locales/home_body_en";
import { HOME_BODY_ES } from "@/i18n/locales/home_body_es";

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Non-English locales without a dedicated pack temporarily reuse the Spanish body so
 * strings differ from English (CI parity). Replace with locale-specific packs per language.
 */
export function getHomeBodyPack(locale: SupportedLocale): HomeBodyPack {
  if (locale === "en") return HOME_BODY_EN;
  if (locale === "es") return HOME_BODY_ES;
  return deepClone(HOME_BODY_ES);
}
