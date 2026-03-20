import { createContext, useContext, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { getDictionary } from "@/i18n/dictionaries";
import { getStaticLocalePack, type StaticLocalePack } from "@/i18n/locales/static_packs";
import {
  DEFAULT_LOCALE,
  getLocaleDirection,
  isSupportedLocale,
  LOCALE_LANGUAGE_NAME,
  type SupportedLocale,
} from "@/i18n/config";
import { getLocaleFromPath } from "@/i18n/routing";

interface LocaleContextValue {
  locale: SupportedLocale;
  languageName: string;
  direction: "ltr" | "rtl";
  dict: ReturnType<typeof getDictionary>;
  pack: StaticLocalePack;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const localeFromPath = getLocaleFromPath(pathname);
  const locale: SupportedLocale = isSupportedLocale(localeFromPath) ? localeFromPath : DEFAULT_LOCALE;

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      languageName: LOCALE_LANGUAGE_NAME[locale],
      direction: getLocaleDirection(locale),
      dict: getDictionary(locale),
      pack: getStaticLocalePack(locale),
    }),
    [locale],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = value.direction;
  }, [locale, value.direction]);

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("useLocale must be used inside LocaleProvider");
  }
  return value;
}
