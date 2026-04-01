import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { normalizeToDefaultRoute } from "@/i18n/routing";
import { appPathFromBrowserPathname } from "@/site/spa_path";

/**
 * Canonical app path for layout, nav active state, and doc icons. When the SPA is
 * mounted at a product basename (e.g. /neotoma-with-chatgpt), router pathname is "/"
 * but the effective page is that product route — this hook resolves that mismatch.
 */
export function useEffectiveRoutePath(): string {
  const { pathname } = useLocation();
  return useMemo(() => {
    if (typeof window === "undefined") return normalizeToDefaultRoute(pathname);
    return appPathFromBrowserPathname(window.location.pathname);
  }, [pathname]);
}
