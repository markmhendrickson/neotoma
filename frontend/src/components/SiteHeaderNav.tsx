import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FlaskConical, Menu, Monitor, Moon, PanelRightClose, Search, Sun } from "lucide-react";
import { SiGithub, SiNpm } from "react-icons/si";
import { useTheme } from "@/hooks/useTheme";
import { useLocale } from "@/i18n/LocaleContext";
import { type SupportedLocale } from "@/i18n/config";
import { localizeHashHref, localizePath, stripLocaleFromPath } from "@/i18n/routing";
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
import { DOC_NAV_CATEGORIES } from "@/site/site_data";
import { sendOutboundClick, sendDocsNavClick } from "@/utils/analytics";

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

/** Dropdown category order: prioritize Integrations after Getting started. */
const DOC_DROPDOWN_CATEGORY_ORDER = [
  "Getting started",
  "Integrations",
  "Reference",
  "Use cases",
  "External",
];

function isModifiedClick(event: React.MouseEvent<HTMLElement>) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
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
  const { pathname } = useLocation();
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
            const isHomePath = stripLocaleFromPath(pathname) === "/";
            if (isHomePath && target) {
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

function ThemeToggleNavButton({
  mobile = false,
  onToggle,
}: {
  mobile?: boolean;
  onToggle?: () => void;
} = {}) {
  const { theme, cycleTheme } = useTheme();
  const { dict } = useLocale();
  const label =
    theme === "system" ? dict.themeSystem : theme === "dark" ? dict.themeDark : dict.themeLight;
  const Icon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;
  return mobile ? (
    <button
      type="button"
      onClick={() => {
        cycleTheme();
        onToggle?.();
      }}
      aria-label={label}
      title={label}
      className="inline-flex w-full items-center gap-2 rounded-md px-3 py-2 text-[14px] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span>{label}</span>
    </button>
  ) : (
    <NavigationMenuLink
      asChild
      className={`${navigationMenuTriggerStyle()} ${sidebarNavItemClass}`}
    >
      <button
        type="button"
        onClick={cycleTheme}
        aria-label={label}
        title={label}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md"
      >
        <Icon className="h-4 w-4" aria-hidden />
      </button>
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
  "/install",
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
}: {
  locale: SupportedLocale;
  searchLabel: string;
  className?: string;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const pages = useMemo(() => {
    const byHref = new Map<string, SearchablePageItem>();
    for (const category of DOC_NAV_CATEGORIES) {
      for (const item of category.items) {
        if (!item.href.startsWith("/") || byHref.has(item.href)) continue;
        byHref.set(item.href, { label: item.label, href: item.href, category: category.title });
      }
    }
    return [...byHref.values()];
  }, []);

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

  const displayItems = query.trim().length > 0 ? results : topPages;
  const isShowingTopPages = query.trim().length === 0;

  const collapse = useCallback(() => {
    setExpanded(false);
    setQuery("");
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [expanded]);

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

  return (
    <div ref={rootRef} className="relative flex h-9 items-center">
      <div
        className={`relative flex h-9 items-center overflow-hidden transition-[width] duration-200 ease-out ${
          expanded ? className ?? "" : "w-9 shrink-0"
        }`}
      >
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={searchLabel}
          className={`absolute left-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-foreground transition-opacity duration-200 hover:bg-sidebar-accent focus:bg-sidebar-accent focus:outline-none focus:ring-2 focus:ring-sidebar-accent focus:ring-offset-0 ${
            expanded ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <Search className="h-4 w-4" aria-hidden />
        </button>
        <Search
          className={`pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sidebar-foreground/60 transition-opacity duration-200 ${
            expanded ? "opacity-100" : "opacity-0"
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
          className={`absolute top-1/2 h-8 -translate-y-1/2 border-sidebar-border bg-sidebar/70 pl-8 text-[13px] text-sidebar-foreground placeholder:text-sidebar-foreground/60 transition-[width,opacity] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-accent focus-visible:ring-inset focus-visible:border-sidebar-border ${
            expanded
              ? "left-0 w-full opacity-100"
              : "left-9 w-0 overflow-hidden opacity-0 pointer-events-none"
          }`}
        />
      </div>
      {open && (
        <div className="absolute right-0 top-full z-[70] mt-1 max-h-[min(60vh,320px)] w-full min-w-[260px] overflow-y-auto rounded-md border border-sidebar-border bg-sidebar shadow-md">
          {isShowingTopPages && (
            <div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
              Top pages
            </div>
          )}
          {displayItems.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-sidebar-foreground/70">
              {query.trim().length > 0 ? "No pages found" : "No suggestions"}
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
  const { locale, dict } = useLocale();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const translateCategoryTitle = (title: string) => {
    if (title === "Getting started") return dict.categoryGettingStarted;
    if (title === "Reference") return dict.categoryReference;
    if (title === "Agent behavior") return dict.categoryAgentBehavior;
    if (title === "Use cases") return dict.categoryUseCases;
    if (title === "Integration guides" || title === "Integrations")
      return dict.categoryIntegrationGuides;
    if (title === "External") return dict.categoryExternal;
    return title;
  };

  /** True when the current page shows the docs sidebar (any non-home route). */
  const isDocsPage = stripLocaleFromPath(pathname) !== "/";
  const featuredByCategory = new Map(
    DOC_NAV_CATEGORIES.map((category) => [
      category.title,
      {
        ...category,
        items: category.items.filter((item) => DOC_DROPDOWN_FEATURED_HREFS.has(item.href)),
      },
    ])
  );
  const featuredDocCategories = DOC_DROPDOWN_CATEGORY_ORDER.map((title) =>
    featuredByCategory.get(title)
  ).filter((cat): cat is NonNullable<typeof cat> => !!cat && cat.items.length > 0);

  return (
    <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between h-12 pl-2 pr-4 md:pr-6 bg-sidebar/90 text-sidebar-foreground backdrop-blur-sm shadow-[inset_0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-3">
        {showSidebarTrigger && <SidebarTrigger className="shrink-0" aria-label="Toggle sidebar" />}
        <Link
          to={localizePath("/", locale)}
          className={`text-[15px] font-semibold text-sidebar-foreground no-underline hover:text-sidebar-accent-foreground transition-colors ${!showSidebarTrigger ? "pl-3" : ""}`}
          aria-label="Neotoma home"
          onClick={(e) => {
            if (
              !isProductBasePath() &&
              stripLocaleFromPath(pathname) === "/" &&
              !isModifiedClick(e)
            ) {
              e.preventDefault();
              document.getElementById("intro")?.scrollIntoView({ behavior: "smooth" });
            }
          }}
        >
          Neotoma
        </Link>
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
      </div>

      <NavigationMenu className="hidden md:block">
        <NavigationMenuList>
          <NavigationMenuItem>
            {stripLocaleFromPath(pathname) === "/" ? (
              <NavLink href="#install" locale={locale}>
                {dict.install}
              </NavLink>
            ) : (
              <NavigationMenuLink asChild>
                <Link
                  to={localizePath("/install", locale)}
                  className={`${navigationMenuTriggerStyle()} ${sidebarNavItemClass}`}
                >
                  {dict.install}
                </Link>
              </NavigationMenuLink>
            )}
          </NavigationMenuItem>
          <NavigationMenuItem className="hidden md:flex">
            {stripLocaleFromPath(pathname) === "/" ? (
              <NavLink href="#architecture" locale={locale}>
                {dict.architecture}
              </NavLink>
            ) : (
              <NavigationMenuLink asChild>
                <Link
                  to={localizePath("/architecture", locale)}
                  className={`${navigationMenuTriggerStyle()} ${sidebarNavItemClass}`}
                >
                  {dict.architecture}
                </Link>
              </NavigationMenuLink>
            )}
          </NavigationMenuItem>
          {!isDocsPage && (
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
                        {translateCategoryTitle(cat.title)}
                      </div>
                      <ul className="list-none p-0">
                        {cat.items.map((item) => (
                          <li key={item.href}>
                            <NavigationMenuLink asChild>
                              <Link
                                to={
                                  item.href.startsWith("/")
                                    ? localizePath(item.href, locale)
                                    : item.href
                                }
                                className="block select-none rounded-sm px-3 py-2 text-[14px] leading-none text-sidebar-foreground no-underline outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:bg-sidebar-accent focus:text-sidebar-accent-foreground"
                                onClick={() => sendDocsNavClick(item.href, "header_nav")}
                              >
                                {item.label}
                              </Link>
                            </NavigationMenuLink>
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
          )}
          <NavigationMenuItem className="hidden lg:flex px-1">
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
          <NavigationMenuItem>
            <ThemeToggleNavButton />
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
              className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] z-[60] md:hidden flex h-12 w-12 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-lg hover:bg-sidebar-accent focus:outline-none focus:ring-2 focus:ring-sidebar-accent focus:ring-offset-2"
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
              <Link
                to={localizePath("/", locale)}
                className="text-[15px] font-semibold text-sidebar-foreground no-underline hover:text-sidebar-accent-foreground transition-colors"
                onClick={(e) => {
                  setMobileMenuOpen(false);
                  if (
                    !isProductBasePath() &&
                    stripLocaleFromPath(pathname) === "/" &&
                    !isModifiedClick(e)
                  ) {
                    e.preventDefault();
                    document.getElementById("intro")?.scrollIntoView({ behavior: "smooth" });
                  }
                }}
              >
                Neotoma
              </Link>
            </div>
            <div
              className="mt-auto border-t border-sidebar-border p-2 flex flex-col gap-1"
              style={{ paddingBottom: "max(5.75rem, 1.5rem, env(safe-area-inset-bottom, 0px))" }}
            >
              <SiteNavSearch
                locale={locale}
                searchLabel={dict.search}
                className="w-full px-1 pb-1"
                onNavigate={() => setMobileMenuOpen(false)}
              />
              <nav className="flex flex-col gap-1">
                {stripLocaleFromPath(pathname) === "/" ? (
                  <>
                    <a
                      href={localizeHashHref("#install", locale)}
                      className="rounded-md px-3 py-2 text-[14px] text-sidebar-foreground no-underline hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      onClick={(e) => {
                        if (isModifiedClick(e)) return;
                        e.preventDefault();
                        setMobileMenuOpen(false);
                        const target = document.getElementById("install");
                        if (target) target.scrollIntoView({ behavior: "smooth" });
                        else navigate(localizeHashHref("#install", locale));
                      }}
                    >
                      {dict.install}
                    </a>
                    <a
                      href={localizeHashHref("#architecture", locale)}
                      className="rounded-md px-3 py-2 text-[14px] text-sidebar-foreground no-underline hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      onClick={(e) => {
                        if (isModifiedClick(e)) return;
                        e.preventDefault();
                        setMobileMenuOpen(false);
                        const target = document.getElementById("architecture");
                        if (target) target.scrollIntoView({ behavior: "smooth" });
                        else navigate(localizeHashHref("#architecture", locale));
                      }}
                    >
                      {dict.architecture}
                    </a>
                  </>
                ) : (
                  <>
                    <Link
                      to={localizePath("/install", locale)}
                      className="rounded-md px-3 py-2 text-[14px] text-sidebar-foreground no-underline hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {dict.install}
                    </Link>
                    <Link
                      to={localizePath("/architecture", locale)}
                      className="rounded-md px-3 py-2 text-[14px] text-sidebar-foreground no-underline hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {dict.architecture}
                    </Link>
                  </>
                )}
                {!isDocsPage && (
                  <Link
                    to={localizePath("/docs", locale)}
                    className="rounded-md px-3 py-2 text-[14px] text-sidebar-foreground no-underline hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {dict.docs}
                  </Link>
                )}
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
                <ThemeToggleNavButton mobile />
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
