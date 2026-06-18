import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

export type HeaderSearchSuggestion = {
  id: string;
  label: string;
  to: string;
  meta?: ReactNode;
};

export type HeaderSearchContextValue = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  contextLabel?: string;
  suggestions?: HeaderSearchSuggestion[];
  isLoading?: boolean;
  onSubmit?: (value: string) => void;
};

type PageTitleContextValue = {
  pageTitle: string | null;
  setPageTitle: (title: string | null) => void;
  headerMeta: ReactNode | null;
  setHeaderMeta: (meta: ReactNode | null) => void;
  headerActions: ReactNode | null;
  setHeaderActions: (actions: ReactNode | null) => void;
  headerSearch: HeaderSearchContextValue | null;
  setHeaderSearch: (search: HeaderSearchContextValue | null) => void;
};

const PageTitleContext = createContext<PageTitleContextValue | null>(null);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [headerMeta, setHeaderMeta] = useState<ReactNode | null>(null);
  const [headerActions, setHeaderActions] = useState<ReactNode | null>(null);
  const [headerSearch, setHeaderSearch] = useState<HeaderSearchContextValue | null>(null);

  // Drop the previous page's header chrome as soon as the URL changes so navigation
  // feels immediate while the next route's queries and lazy chunk load.
  useEffect(() => {
    setPageTitle(null);
    setHeaderMeta(null);
    setHeaderActions(null);
    setHeaderSearch(null);
  }, [location.pathname, location.search, location.hash]);

  const value = useMemo(
    () => ({
      pageTitle,
      setPageTitle,
      headerMeta,
      setHeaderMeta,
      headerActions,
      setHeaderActions,
      headerSearch,
      setHeaderSearch,
    }),
    [pageTitle, headerMeta, headerActions, headerSearch],
  );

  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>;
}

export function useCurrentPageTitle() {
  return useContext(PageTitleContext)?.pageTitle ?? null;
}

export function usePageShellTitle(title: string | undefined) {
  const setPageTitle = useContext(PageTitleContext)?.setPageTitle;

  useEffect(() => {
    setPageTitle?.(title ?? null);
    return () => setPageTitle?.(null);
  }, [setPageTitle, title]);
}

export function useCurrentHeaderMeta() {
  return useContext(PageTitleContext)?.headerMeta ?? null;
}

export function useCurrentHeaderActions() {
  return useContext(PageTitleContext)?.headerActions ?? null;
}

export function useCurrentHeaderSearch() {
  return useContext(PageTitleContext)?.headerSearch ?? null;
}

export function usePageShellHeaderMeta(meta: ReactNode | undefined) {
  const setHeaderMeta = useContext(PageTitleContext)?.setHeaderMeta;

  useEffect(() => {
    setHeaderMeta?.(meta ?? null);
    return () => setHeaderMeta?.(null);
  }, [setHeaderMeta, meta]);
}

export function usePageShellHeaderActions(actions: ReactNode | undefined) {
  const setHeaderActions = useContext(PageTitleContext)?.setHeaderActions;

  useEffect(() => {
    setHeaderActions?.(actions ?? null);
    return () => setHeaderActions?.(null);
  }, [setHeaderActions, actions]);
}

export function usePageShellHeaderSearch(search: HeaderSearchContextValue | undefined) {
  const setHeaderSearch = useContext(PageTitleContext)?.setHeaderSearch;

  useEffect(() => {
    setHeaderSearch?.(search ?? null);
    return () => setHeaderSearch?.(null);
  }, [setHeaderSearch, search]);
}
