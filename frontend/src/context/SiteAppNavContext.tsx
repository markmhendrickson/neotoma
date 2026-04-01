import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type SiteAppNavContextValue = {
  /** False while the fixed app bar is translated off-screen (scroll-hide). */
  appNavBarVisible: boolean;
  setAppNavBarVisible: (visible: boolean) => void;
  /** True while the marketing home fixed "Ask your agent to evaluate" bar is shown (mobile). */
  homeEvaluateScrollBannerVisible: boolean;
  setHomeEvaluateScrollBannerVisible: (visible: boolean) => void;
};

const SiteAppNavContext = createContext<SiteAppNavContextValue | null>(null);

export function SiteAppNavProvider({ children }: { children: ReactNode }) {
  const [appNavBarVisible, setAppNavBarVisible] = useState(true);
  const [homeEvaluateScrollBannerVisible, setHomeEvaluateScrollBannerVisible] = useState(false);
  const value = useMemo(
    () => ({
      appNavBarVisible,
      setAppNavBarVisible,
      homeEvaluateScrollBannerVisible,
      setHomeEvaluateScrollBannerVisible,
    }),
    [appNavBarVisible, homeEvaluateScrollBannerVisible],
  );
  return <SiteAppNavContext.Provider value={value}>{children}</SiteAppNavContext.Provider>;
}

export function useSiteAppNavBarVisible() {
  const ctx = useContext(SiteAppNavContext);
  return ctx?.appNavBarVisible ?? true;
}

export function useSiteAppNavBarVisibleSetter() {
  const ctx = useContext(SiteAppNavContext);
  if (!ctx) {
    return () => {
      /* no-op outside provider */
    };
  }
  return ctx.setAppNavBarVisible;
}

export function useSiteHomeEvaluateScrollBannerVisible() {
  const ctx = useContext(SiteAppNavContext);
  return ctx?.homeEvaluateScrollBannerVisible ?? false;
}

export function useSiteHomeEvaluateScrollBannerVisibleSetter() {
  const ctx = useContext(SiteAppNavContext);
  if (!ctx) {
    return () => {
      /* no-op outside provider */
    };
  }
  return ctx.setHomeEvaluateScrollBannerVisible;
}
