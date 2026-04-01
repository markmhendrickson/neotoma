import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type SiteAppNavContextValue = {
  /** False while the fixed app bar is translated off-screen (scroll-hide). */
  appNavBarVisible: boolean;
  setAppNavBarVisible: (visible: boolean) => void;
};

const SiteAppNavContext = createContext<SiteAppNavContextValue | null>(null);

export function SiteAppNavProvider({ children }: { children: ReactNode }) {
  const [appNavBarVisible, setAppNavBarVisible] = useState(true);
  const value = useMemo(
    () => ({ appNavBarVisible, setAppNavBarVisible }),
    [appNavBarVisible],
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
