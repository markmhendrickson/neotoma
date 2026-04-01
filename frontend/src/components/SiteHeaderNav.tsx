import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bookmark,
  BookOpen,
  Bot,
  Boxes,
  Briefcase,
  Building2,
  Bug,
  ClipboardCheck,
  HelpCircle,
  Code,
  Container,
  Cpu,
  Database,
  DollarSign,
  Download,
  FileText,
  Fingerprint,
  FlaskConical,
  Gavel,
  GitCompare,
  Github,
  Globe,
  Headphones,
  Heart,
  History,
  Home,
  Landmark,
  Layers,
  LayoutGrid,
  Menu,
  MessageCircle,
  MessageSquare,
  Monitor,
  Package,
  PanelRight,
  PanelRightClose,
  Play,
  SatelliteDish,
  Scale,
  Search,
  Server,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  TrendingUp,
  Truck,
  Users,
  Waypoints,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SiClaude, SiGithub, SiNpm, SiOpenai } from "react-icons/si";
import { useLocale } from "@/i18n/LocaleContext";
import type { SupportedLocale } from "@/i18n/config";
import {
  localizeHashHref,
  localizePath,
  normalizeToDefaultRoute,
  stripLocaleFromPath,
} from "@/i18n/routing";
import { useEffectiveRoutePath } from "@/hooks/useEffectiveRoutePath";
import { isMarketingFullPageRoute } from "@/site/full_page_paths";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { CodexIcon } from "@/components/icons/CodexIcon";
import { CursorIcon } from "@/components/icons/CursorIcon";
import { OpenClawIcon } from "@/components/icons/OpenClawIcon";
import { getLocalizedDocNavCategories } from "@/site/site_data_localized";
import { VERTICAL_LANDING_PATHS } from "@/site/site_data";
import { sendCtaClick, sendOutboundClick, sendDocsNavClick } from "@/utils/analytics";
import {
  useSiteAppNavBarVisibleSetter,
  useSiteHomeEvaluateScrollBannerVisible,
} from "@/context/SiteAppNavContext";

const sidebarNavItemClass =
  "!bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:bg-sidebar-accent focus:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground";

const DOC_DROPDOWN_FEATURED_HREFS = new Set([
  "/neotoma-with-claude-code",
  "/neotoma-with-claude",
  "/neotoma-with-chatgpt",
  "/neotoma-with-codex",
  "/neotoma-with-cursor",
  "/neotoma-with-openclaw",
  "/api",
  "/mcp",
  "/cli",
  "/memory-guarantees",
  "/schema-management",
]);

const INTEGRATION_BRAND_ICONS: Record<
  string,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean; size?: number }>
> = {
  "/neotoma-with-claude-code": SiClaude,
  "/neotoma-with-claude": SiClaude,
  "/neotoma-with-claude-connect-desktop": SiClaude,
  "/neotoma-with-claude-connect-remote-mcp": SiClaude,
  "/neotoma-with-chatgpt": SiOpenai,
  "/neotoma-with-chatgpt-connect-remote-mcp": SiOpenai,
  "/neotoma-with-chatgpt-connect-custom-gpt": SiOpenai,
  "/neotoma-with-codex": CodexIcon,
  "/neotoma-with-codex-connect-local-stdio": CodexIcon,
  "/neotoma-with-codex-connect-remote-http-oauth": CodexIcon,
  "/neotoma-with-cursor": CursorIcon,
  "/neotoma-with-openclaw": OpenClawIcon,
  "/neotoma-with-openclaw-connect-local-stdio": OpenClawIcon,
  "/neotoma-with-openclaw-connect-remote-http": OpenClawIcon,
};

const DOC_NAV_ICONS: Record<string, LucideIcon> = {
  Bookmark,
  BookOpen,
  Bot,
  Boxes,
  Briefcase,
  Building2,
  Bug,
  ClipboardCheck,
  HelpCircle,
  Code,
  Container,
  Cpu,
  Database,
  DollarSign,
  Download,
  FileText,
  Fingerprint,
  Github,
  Globe,
  Headphones,
  Heart,
  History,
  Home,
  Landmark,
  Layers,
  LayoutGrid,
  MessageCircle,
  MessageSquare,
  Monitor,
  Package,
  PanelRight,
  Play,
  SatelliteDish,
  Scale,
  Search,
  Server,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  TrendingUp,
  Truck,
  Users,
  Waypoints,
  Zap,
  Gavel,
  GitCompare,
};

function isModifiedClick(event: React.MouseEvent<HTMLElement>) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

const SITE_HEADER_SCROLL_ROOT_SELECTOR = "[data-site-header-scroll-root]";
/** ~h-12; show bar whenever scroll position is in this band from the top */
const SITE_HEADER_TOP_REVEAL_PX = 56;
const SITE_HEADER_SCROLL_DELTA_PX = 8;
const MOBILE_NAV_FAB_SCROLL_DELTA_PX = 8;

/** Prefer the designated scroll root when it actually overflows; otherwise use window (e.g. docs shell inset not constrained). */
function getEffectiveScrollY(root: HTMLElement | null): number {
  if (root && root.scrollHeight > root.clientHeight + 1) return root.scrollTop;
  return window.scrollY;
}

function useSiteHeaderScrollVisibility(pathname: string, forceVisible: boolean) {
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    setHeaderVisible(true);
  }, [pathname]);

  useLayoutEffect(() => {
    if (forceVisible) {
      setHeaderVisible(true);
      return;
    }

    const root = document.querySelector<HTMLElement>(SITE_HEADER_SCROLL_ROOT_SELECTOR);

    lastScrollYRef.current = getEffectiveScrollY(root);

    const onScroll = () => {
      const current = getEffectiveScrollY(root);
      const delta = current - lastScrollYRef.current;
      lastScrollYRef.current = current;

      if (current < SITE_HEADER_TOP_REVEAL_PX) {
        setHeaderVisible(true);
        return;
      }
      if (delta > SITE_HEADER_SCROLL_DELTA_PX) {
        setHeaderVisible(false);
      } else if (delta < -SITE_HEADER_SCROLL_DELTA_PX) {
        setHeaderVisible(true);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    root?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      root?.removeEventListener("scroll", onScroll);
    };
  }, [pathname, forceVisible]);

  return headerVisible;
}

/**
 * Mobile menu FAB: hide while #intro or #evaluate intersect the marketing-home scroll root;
 * hide on scroll-up, show on scroll-down (inverse of the top header). Always visible when forceVisible (sheet open).
 */
function useMobileNavFabVisibility(
  pathname: string,
  forceVisible: boolean,
  marketingHomeChrome: boolean,
) {
  const [fabShownByScroll, setFabShownByScroll] = useState(true);
  const [introInView, setIntroInView] = useState(marketingHomeChrome);
  const [evaluateInView, setEvaluateInView] = useState(false);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    setFabShownByScroll(true);
    setIntroInView(marketingHomeChrome);
    setEvaluateInView(false);
  }, [pathname, marketingHomeChrome]);

  useLayoutEffect(() => {
    if (forceVisible) return;

    const root = document.querySelector<HTMLElement>(SITE_HEADER_SCROLL_ROOT_SELECTOR);
    lastScrollYRef.current = getEffectiveScrollY(root);

    const onScroll = () => {
      const current = getEffectiveScrollY(root);
      const delta = current - lastScrollYRef.current;
      lastScrollYRef.current = current;

      if (delta > MOBILE_NAV_FAB_SCROLL_DELTA_PX) {
        setFabShownByScroll(true);
      } else if (delta < -MOBILE_NAV_FAB_SCROLL_DELTA_PX) {
        setFabShownByScroll(false);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    root?.addEventListener("scroll", onScroll, { passive: true });

    const intro = document.getElementById("intro");
    const evaluate = document.getElementById("evaluate");

    let sectionObserver: IntersectionObserver | null = null;
    if (root && (intro || evaluate)) {
      sectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.target.id === "intro") setIntroInView(entry.isIntersecting);
            if (entry.target.id === "evaluate") setEvaluateInView(entry.isIntersecting);
          }
        },
        { root, threshold: 0, rootMargin: "0px" },
      );
      if (intro) sectionObserver.observe(intro);
      if (evaluate) sectionObserver.observe(evaluate);
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      root?.removeEventListener("scroll", onScroll);
      sectionObserver?.disconnect();
    };
  }, [pathname, forceVisible]);

  if (forceVisible) return true;

  const blockedByHomeSection = introInView || evaluateInView;
  return fabShownByScroll && !blockedByHomeSection;
}

/** True when the app is served under a product path (e.g. /neotoma-with-claude-code). */
function isProductBasePath(): boolean {
  if (typeof window === "undefined") return false;
  const segment = window.location.pathname.replace(/^\//, "").split("/")[0] ?? "";
  return segment.toLowerCase().startsWith("neotoma-with-");
}

function NavLink({
  href,
  children,
  locale,
  external,
}: {
  href: string;
  children: React.ReactNode;
  locale: SupportedLocale;
  external?: boolean;
}) {
  const navigate = useNavigate();
  const effectivePath = useEffectiveRoutePath();
  const isMarketingHomeForHash =
    effectivePath === "/" && !isProductBasePath();
  const localizedHref = href.startsWith("#")
    ? localizeHashHref(href, locale)
    : href.startsWith("/")
      ? localizePath(href, locale)
      : href;

  if (external) {
    return (
      <NavigationMenuLink
        asChild
        className={`${navigationMenuTriggerStyle()} ${sidebarNavItemClass}`}
      >
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => sendOutboundClick(href)}
        >
          {children}
        </a>
      </NavigationMenuLink>
    );
  }
  if (href.startsWith("#")) {
    return (
      <NavigationMenuLink
        asChild
        className={`${navigationMenuTriggerStyle()} ${sidebarNavItemClass}`}
      >
        <a
          href={localizedHref}
          onClick={(e) => {
            if (isModifiedClick(e)) return;
            e.preventDefault();
            const targetId = href.slice(1);
            const target = document.getElementById(targetId);
            if (isMarketingHomeForHash && target) {
              target.scrollIntoView({ behavior: "smooth" });
              return;
            }
            navigate(localizedHref);
          }}
        >
          {children}
        </a>
      </NavigationMenuLink>
    );
  }
  return (
    <NavigationMenuLink
      asChild
      className={`${navigationMenuTriggerStyle()} ${sidebarNavItemClass}`}
    >
      <Link to={localizedHref}>{children}</Link>
    </NavigationMenuLink>
  );
}

interface SearchablePageItem {
  label: string;
  href: string;
  category: string;
}

const SITE_SEARCH_TOP_PAGE_HREFS = [
  "/docs",
  "/evaluate",
  "/install",
  "/faq",
  "/memory-guarantees",
  "/neotoma-with-cursor",
  "/api",
  "/mcp",
];

function SiteNavSearch({
  locale,
  searchLabel,
  className,
  onNavigate,
  alwaysShowInput = false,
}: {
  locale: SupportedLocale;
  searchLabel: string;
  className?: string;
  onNavigate?: () => void;
  /** When true, input is always visible (e.g. mobile sidebar). */
  alwaysShowInput?: boolean;
}) {
  const navigate = useNavigate();
  const { dict } = useLocale();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  /** Start collapsed so mobile sheet open does not autofocus the input (keyboard). Visibility uses alwaysShowInput. */
  const [expanded, setExpanded] = useState(false);

  const localizedDocCategories = useMemo(() => getLocalizedDocNavCategories(dict), [dict]);

  const verticalPathSet = useMemo(() => new Set(VERTICAL_LANDING_PATHS), []);

  const pages = useMemo(() => {
    const byHref = new Map<string, SearchablePageItem>();
    for (const category of localizedDocCategories) {
      for (const item of category.items) {
        if (!item.href.startsWith("/") || byHref.has(item.href)) continue;
        if (verticalPathSet.has(item.href)) continue;
        byHref.set(item.href, { label: item.label, href: item.href, category: category.title });
      }
    }
    return [...byHref.values()];
  }, [localizedDocCategories, verticalPathSet]);

  const topPages = useMemo(() => {
    const byHref = new Map(pages.map((p) => [p.href, p]));
    return SITE_SEARCH_TOP_PAGE_HREFS.map((href) => byHref.get(href)).filter(
      (item): item is SearchablePageItem => !!item
    );
  }, [pages]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return pages
      .filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.href.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [pages, query]);

  const hasQuery = query.trim().length > 0;
  const shouldShowDefaultSuggestions = !alwaysShowInput;
  const displayItems = hasQuery ? results : shouldShowDefaultSuggestions ? topPages : [];
  const isShowingTopPages = !hasQuery && shouldShowDefaultSuggestions;

  const collapse = useCallback(() => {
    setExpanded(false);
    setQuery("");
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!expanded || alwaysShowInput) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [expanded, alwaysShowInput]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const handleBlur = () => {
    setTimeout(() => {
      if (rootRef.current?.contains(document.activeElement as Node)) return;
      collapse();
    }, 150);
  };

  const handleSelect = (href: string) => {
    navigate(localizePath(href, locale));
    setQuery("");
    setOpen(false);
    setExpanded(false);
    onNavigate?.();
  };

  const showInput = expanded || alwaysShowInput;
  return (
    <div ref={rootRef} className="relative flex h-9 items-center">
      <div
        className={`relative flex h-9 items-center overflow-hidden transition-[width] duration-200 ease-out ${
          showInput ? className ?? "" : "w-9 shrink-0"
        }`}
      >
        {!alwaysShowInput && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={searchLabel}
            className={`absolute left-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-foreground transition-opacity duration-200 hover:bg-sidebar-accent focus:bg-sidebar-accent focus:outline-none focus:ring-2 focus:ring-sidebar-accent focus:ring-offset-0 ${
              showInput ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          >
            <Search className="h-4 w-4" aria-hidden />
          </button>
        )}
        <Search
          className={`pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sidebar-foreground/60 transition-opacity duration-200 ${
            showInput ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden
        />
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              collapse();
              return;
            }
            if (event.key === "Enter" && displayItems.length > 0) {
              event.preventDefault();
              handleSelect(displayItems[0].href);
            }
          }}
          placeholder={searchLabel}
          aria-label={searchLabel}
          className={`absolute top-1/2 h-8 -translate-y-1/2 border-sidebar-border bg-sidebar/70 pl-8 ${
            alwaysShowInput ? "text-base" : "text-[13px]"
          } text-sidebar-foreground placeholder:text-sidebar-foreground/60 transition-[width,opacity] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-accent focus-visible:ring-inset focus-visible:border-sidebar-border ${
            showInput
              ? "left-0 w-full opacity-100"
              : "left-9 w-0 overflow-hidden opacity-0 pointer-events-none"
          }`}
        />
      </div>
      {open && (hasQuery || shouldShowDefaultSuggestions) && (
        <div
          className={`absolute right-0 z-[70] max-h-[min(60vh,320px)] w-full min-w-[260px] overflow-y-auto rounded-md border border-sidebar-border bg-sidebar shadow-md ${
            alwaysShowInput ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {isShowingTopPages && (
            <div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
              {dict.topPages}
            </div>
          )}
          {displayItems.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-sidebar-foreground/70">
              {dict.noResults}
            </div>
          ) : (
            <ul className="list-none p-1">
              {displayItems.map((item) => (
                <li key={item.href}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item.href)}
                    className="w-full rounded-sm px-2 py-2 text-left hover:bg-sidebar-accent"
                  >
                    <div className="text-[13px] text-sidebar-foreground">{item.label}</div>
                    <div className="text-[11px] text-sidebar-foreground/70">
                      {item.category} · {item.href}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export interface SiteHeaderNavProps {
  /** When true, show sidebar collapse/expand trigger to the left of the Neotoma link (docs pages). */
  showSidebarTrigger?: boolean;
}

export function SiteHeaderNav(props: SiteHeaderNavProps) {
  const { showSidebarTrigger } = props;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const effectivePath = useEffectiveRoutePath();
  const routeBase = normalizeToDefaultRoute(effectivePath);
  const isMarketingHomeChrome =
    effectivePath === "/" && !isProductBasePath();
  const { locale, dict } = useLocale();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  /** Hide-on-scroll is for the long marketing home only; keep bar visible on 404, subpages, and docs. */
  const headerScrollVisible = useSiteHeaderScrollVisibility(
    pathname,
    mobileMenuOpen || !isMarketingHomeChrome,
  );
  const mobileNavFabBaseVisible = useMobileNavFabVisibility(
    pathname,
    mobileMenuOpen,
    isMarketingHomeChrome,
  );
  const homeEvaluateScrollBannerVisible = useSiteHomeEvaluateScrollBannerVisible();
  const mobileNavFabVisible =
    mobileMenuOpen ||
    (mobileNavFabBaseVisible && !homeEvaluateScrollBannerVisible);
  const setAppNavBarVisible = useSiteAppNavBarVisibleSetter();
  useEffect(() => {
    setAppNavBarVisible(headerScrollVisible);
  }, [headerScrollVisible, setAppNavBarVisible]);
  const localizedDocCategories = useMemo(() => getLocalizedDocNavCategories(dict), [dict]);

  const featuredDocCategories = useMemo(() => {
    const featured = localizedDocCategories
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => DOC_DROPDOWN_FEATURED_HREFS.has(item.href)),
      }))
      .filter((category) => category.items.length > 0);

    const pick = (matcher: (hrefs: string[]) => boolean) =>
      featured.find((category) => matcher(category.items.map((item) => item.href)));

    const ordered = [
      pick((hrefs) => hrefs.includes("/docs")),
      pick((hrefs) => hrefs.some((href) => href.startsWith("/neotoma-with-"))),
      pick((hrefs) => hrefs.includes("/api")),
      pick((hrefs) => hrefs.includes("/debugging-infrastructure")),
      pick((hrefs) => hrefs.some((href) => href.startsWith("https://"))),
    ].filter((category): category is NonNullable<typeof category> => !!category);

    return ordered;
  }, [localizedDocCategories]);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 flex h-12 items-center justify-between pl-2 pr-4 transition-transform duration-300 ease-out md:pr-6 ${
        headerScrollVisible ? "translate-y-0" : "-translate-y-full pointer-events-none"
      } bg-sidebar/90 text-sidebar-foreground backdrop-blur-sm shadow-[inset_0_-10px_20px_-10px_rgba(0,0,0,0.05)]`}
    >
      <div className="flex items-center gap-3">
        {showSidebarTrigger && <SidebarTrigger className="shrink-0" aria-label="Toggle sidebar" />}
        <a
          href="/"
          className={`text-[15px] font-semibold text-sidebar-foreground no-underline hover:text-sidebar-accent-foreground transition-colors ${!showSidebarTrigger ? "pl-3" : ""}`}
          aria-label="Neotoma home"
          onClick={(e) => {
            if (isMarketingHomeChrome && !isModifiedClick(e)) {
              e.preventDefault();
              document.getElementById("intro")?.scrollIntoView({ behavior: "smooth" });
            }
          }}
        >
          Neotoma
        </a>
        {!isMarketingFullPageRoute(routeBase) && (
          <span className="hidden md:inline-flex min-w-0 max-w-[140px] items-center gap-1 overflow-hidden rounded border border-sidebar-border bg-sidebar-accent/40 px-1.5 py-0.5 text-[11px] text-sidebar-foreground/80">
            <FlaskConical className="h-3 w-3 shrink-0" aria-hidden />
            <a
              href="https://markmhendrickson.com/posts/neotoma-developer-release"
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate text-sidebar-foreground/80 no-underline hover:text-sidebar-accent-foreground transition-colors"
              onClick={() =>
                sendOutboundClick(
                  "https://markmhendrickson.com/posts/neotoma-developer-release",
                  dict.developerPreview
                )
              }
            >
              {dict.developerPreview}
            </a>
          </span>
        )}
      </div>

      {/* Mobile: Evaluate + Architecture in header */}
      <nav
        className="md:hidden flex items-center gap-1"
        aria-label={`${dict.evaluate}, ${dict.install}, and ${dict.architecture}`}
      >
        <Link
          to={localizePath("/evaluate", locale)}
          className="rounded-md px-2 py-1.5 text-[13px] text-sidebar-foreground no-underline hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => sendCtaClick("header_evaluate")}
        >
          {dict.evaluate}
        </Link>
        <Link
          to={localizePath("/install", locale)}
          className="rounded-md px-2 py-1.5 text-[13px] text-sidebar-foreground no-underline hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => sendCtaClick("header_install")}
        >
          {dict.install}
        </Link>
        <Link
          to={localizePath("/architecture", locale)}
          className="rounded-md px-2 py-1.5 text-[13px] text-sidebar-foreground no-underline hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => sendCtaClick("view_architecture")}
        >
          {dict.architecture}
        </Link>
      </nav>

      <NavigationMenu className="hidden md:block">
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <Link
                to={localizePath("/evaluate", locale)}
                className={`${navigationMenuTriggerStyle()} ${sidebarNavItemClass}`}
                onClick={() => sendCtaClick("header_evaluate")}
              >
                {dict.evaluate}
              </Link>
            </NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem className="hidden md:flex">
            <NavigationMenuLink asChild>
              <Link
                to={localizePath("/install", locale)}
                className={`${navigationMenuTriggerStyle()} ${sidebarNavItemClass}`}
                onClick={() => sendCtaClick("header_install")}
              >
                {dict.install}
              </Link>
            </NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem className="hidden md:flex">
            <NavigationMenuLink asChild>
              <Link
                to={localizePath("/architecture", locale)}
                className={`${navigationMenuTriggerStyle()} ${sidebarNavItemClass}`}
                onClick={() => sendCtaClick("view_architecture")}
              >
                {dict.architecture}
              </Link>
            </NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem className="hidden md:flex">
            <NavigationMenuTrigger
              className={`text-[14px] ${sidebarNavItemClass}`}
              onClick={() => navigate(localizePath("/docs", locale))}
            >
              {dict.docs}
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul className="grid w-[260px] max-h-[min(70vh,520px)] overflow-y-auto overscroll-contain gap-0.5 p-2 border border-sidebar-border bg-sidebar text-sidebar-foreground rounded-md shadow-sm">
                {featuredDocCategories.map((cat) => (
                  <li key={cat.title}>
                    <div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
                      {cat.title}
                    </div>
                    <ul className="list-none p-0">
                      {cat.items.map((item) => (
                        <li key={item.href}>
                          {(() => {
                            const isIntegrations = cat.items.some((candidate) =>
                              candidate.href.startsWith("/neotoma-with-")
                            );
                            const BrandIcon =
                              isIntegrations && item.href.startsWith("/")
                                ? INTEGRATION_BRAND_ICONS[item.href]
                                : null;
                            const Icon = BrandIcon ?? DOC_NAV_ICONS[item.icon ?? "BookOpen"];
                            return (
                            <NavigationMenuLink asChild>
                              <Link
                                to={
                                  item.href.startsWith("/")
                                    ? localizePath(item.href, locale)
                                    : item.href
                                }
                                className="flex select-none items-center gap-2 rounded-sm px-3 py-2 text-[14px] leading-none text-sidebar-foreground no-underline outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:bg-sidebar-accent focus:text-sidebar-accent-foreground"
                                onClick={() => sendDocsNavClick(item.href, "header_nav")}
                              >
                                {BrandIcon ? (
                                  <BrandIcon className="h-4 w-4 shrink-0" aria-hidden />
                                ) : Icon ? (
                                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                                ) : null}
                                <span>{item.label}</span>
                              </Link>
                            </NavigationMenuLink>
                              );
                            })()}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
                <li className="border-t border-sidebar-border mt-1 pt-1">
                  <NavigationMenuLink asChild>
                    <Link
                      to={localizePath("/docs", locale)}
                      className="block select-none rounded-sm px-3 py-2 text-[13px] leading-none text-sidebar-foreground/70 no-underline outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:bg-sidebar-accent focus:text-sidebar-accent-foreground"
                    >
                      {dict.viewAll} →
                    </Link>
                  </NavigationMenuLink>
                </li>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem className="hidden md:flex px-1">
            <SiteNavSearch
              locale={locale}
              searchLabel={dict.search}
              className="w-[180px] xl:w-[220px]"
            />
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavLink href="https://github.com/markmhendrickson/neotoma" locale={locale} external>
              <SiGithub className="h-4 w-4" aria-hidden />
              <span className="sr-only">GitHub</span>
            </NavLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavLink href="https://www.npmjs.com/package/neotoma" locale={locale} external>
              <SiNpm className="h-4 w-4" aria-hidden />
              <span className="sr-only">npm</span>
            </NavLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        {typeof document !== "undefined" &&
          createPortal(
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              tabIndex={mobileNavFabVisible ? 0 : -1}
              className={`fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] z-[60] md:hidden flex h-12 w-12 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-lg transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none hover:bg-sidebar-accent focus:outline-none focus:ring-2 focus:ring-sidebar-accent focus:ring-offset-2 ${
                mobileNavFabVisible
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-[calc(100%+1.5rem)] opacity-0"
              }`}
            >
              {mobileMenuOpen ? (
                <PanelRightClose className="h-5 w-5" aria-hidden />
              ) : (
                <Menu className="h-5 w-5" aria-hidden />
              )}
            </button>,
            document.body
          )}
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-[290px] border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground"
        >
          <SheetTitle className="sr-only">Site navigation</SheetTitle>
          <div className="flex h-full flex-col">
            <div className="flex h-12 items-center border-b border-sidebar-border px-4">
              <a
                href="/"
                className="text-[15px] font-semibold text-sidebar-foreground no-underline hover:text-sidebar-accent-foreground transition-colors"
                onClick={(e) => {
                  setMobileMenuOpen(false);
                  if (isMarketingHomeChrome && !isModifiedClick(e)) {
                    e.preventDefault();
                    document.getElementById("intro")?.scrollIntoView({ behavior: "smooth" });
                  }
                }}
              >
                Neotoma
              </a>
            </div>
            <div
              className="mt-auto border-t border-sidebar-border p-2 flex flex-col gap-1"
              style={{ paddingBottom: "max(5.75rem, 1.5rem, env(safe-area-inset-bottom, 0px))" }}
            >
              <nav className="flex flex-col gap-1">
                <>
                  <Link
                    to={localizePath("/evaluate", locale)}
                    className="rounded-md px-3 py-2 text-[14px] text-sidebar-foreground no-underline hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    onClick={() => {
                      sendCtaClick("header_evaluate");
                      setMobileMenuOpen(false);
                    }}
                  >
                    {dict.evaluate}
                  </Link>
                  <Link
                    to={localizePath("/install", locale)}
                    className="rounded-md px-3 py-2 text-[14px] text-sidebar-foreground no-underline hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    onClick={() => {
                      sendCtaClick("header_install");
                      setMobileMenuOpen(false);
                    }}
                  >
                    {dict.install}
                  </Link>
                  <Link
                    to={localizePath("/architecture", locale)}
                    className="rounded-md px-3 py-2 text-[14px] text-sidebar-foreground no-underline hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    onClick={() => {
                      sendCtaClick("view_architecture");
                      setMobileMenuOpen(false);
                    }}
                  >
                    {dict.architecture}
                  </Link>
                </>
                <Link
                  to={localizePath("/docs", locale)}
                  className="rounded-md px-3 py-2 text-[14px] text-sidebar-foreground no-underline hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {dict.docs}
                </Link>
                <Link
                  to={localizePath("/faq", locale)}
                  className="rounded-md px-3 py-2 text-[14px] text-sidebar-foreground no-underline hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  FAQ
                </Link>
                <a
                  href="https://github.com/markmhendrickson/neotoma"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md px-3 py-2 text-[14px] text-sidebar-foreground no-underline hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  onClick={() => {
                    sendOutboundClick("https://github.com/markmhendrickson/neotoma");
                    setMobileMenuOpen(false);
                  }}
                >
                  GitHub
                </a>
                <a
                  href="https://www.npmjs.com/package/neotoma"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md px-3 py-2 text-[14px] text-sidebar-foreground no-underline hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  onClick={() => {
                    sendOutboundClick("https://www.npmjs.com/package/neotoma");
                    setMobileMenuOpen(false);
                  }}
                >
                  npm
                </a>
              </nav>
              <div className="border-t border-sidebar-border pt-2 flex flex-col gap-1">
                <SiteNavSearch
                  locale={locale}
                  searchLabel={dict.search}
                  className="w-full px-1 pb-1"
                  onNavigate={() => setMobileMenuOpen(false)}
                  alwaysShowInput
                />
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
