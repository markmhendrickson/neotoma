import { type SupportedLocale } from "@/i18n/config";
import { getStaticLocalePack } from "@/i18n/locales/static_packs";

export function loadLocalePack(locale: SupportedLocale) {
  return getStaticLocalePack(locale);
}

