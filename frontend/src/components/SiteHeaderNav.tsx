import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FlaskConical, Languages, Menu, Monitor, Moon, PanelRightClose, Sun } from "lucide-react";
import { SiGithub, SiNpm } from "react-icons/si";
import { useTheme } from "@/hooks/useTheme";
import { useLocale } from "@/i18n/LocaleContext";
import { LOCALE_LANGUAGE_NAME, SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n/config";
import { getLocaleFromPath, localizeHashHref, localizePath, saveLocale, stripLocaleFromPath } from "@/i18n/routing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { DOC_NAV_CATEGORIES } from "@/site/site_data";
import { sendOutboundClick, sendDocsNavClick } from "@/utils/analytics";

const sidebarNavItemClass =
  "!bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:bg-sidebar-accent focus:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground";

function isModifiedClick(event: React.MouseEvent<HTMLElement>) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
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
    theme === "system"
      ? dict.themeSystem
      : theme === "dark"
        ? dict.themeDark
        : dict.themeLight;
  const Icon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;
  return (
    mobile ? (
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
    )
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
    if (title === "Integration guides" || title === "Integrations") return dict.categoryIntegrationGuides;
    if (title === "External") return dict.categoryExternal;
    return title;
  };

  const handleLocaleChange = (nextLocale: SupportedLocale) => {
    saveLocale(nextLocale);
    const basePath = stripLocaleFromPath(pathname);
    navigate(localizePath(basePath, nextLocale));
    setMobileMenuOpen(false);
  };

  return (
    <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between h-12 pl-2 pr-4 md:pr-6 bg-sidebar/90 text-sidebar-foreground backdrop-blur-sm shadow-[inset_0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-3">
        {showSidebarTrigger && (
          <SidebarTrigger className="shrink-0" aria-label="Toggle sidebar" />
        )}
        <Link
          to={localizePath("/", locale)}
          className="text-[15px] font-semibold text-sidebar-foreground no-underline hover:text-sidebar-accent-foreground transition-colors"
          onClick={(e) => {
            if (stripLocaleFromPath(pathname) === "/" && !isModifiedClick(e)) {
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
            onClick={() => sendOutboundClick("https://markmhendrickson.com/posts/neotoma-developer-release", dict.developerPreview)}
          >
            {dict.developerPreview}
          </a>
        </span>
      </div>

      <NavigationMenu className="hidden md:block">
        <NavigationMenuList>
          <NavigationMenuItem>
            {stripLocaleFromPath(pathname) === "/" ? (
              <NavLink href="#quick-start" locale={locale}>{dict.quickStart}</NavLink>
            ) : (
              <NavigationMenuLink asChild>
                <Link to={localizePath("/docs", locale)} className={`${navigationMenuTriggerStyle()} ${sidebarNavItemClass}`}>
                  {dict.quickStart}
                </Link>
              </NavigationMenuLink>
            )}
          </NavigationMenuItem>
          <NavigationMenuItem className="hidden md:flex">
            {stripLocaleFromPath(pathname) === "/" ? (
              <NavLink href="#architecture" locale={locale}>{dict.architecture}</NavLink>
            ) : (
              <NavigationMenuLink asChild>
                <Link to={localizePath("/architecture", locale)} className={`${navigationMenuTriggerStyle()} ${sidebarNavItemClass}`}>
                  {dict.architecture}
                </Link>
              </NavigationMenuLink>
            )}
          </NavigationMenuItem>
          <NavigationMenuItem className="hidden md:flex">
            <NavigationMenuTrigger
              className={`text-[14px] ${sidebarNavItemClass}`}
              onClick={() => navigate(localizePath("/docs", locale))}
            >
              {dict.docs}
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul className="grid w-[260px] gap-0.5 p-2 border border-sidebar-border bg-sidebar text-sidebar-foreground rounded-md shadow-sm">
                {DOC_NAV_CATEGORIES.map((cat) => (
                  <li key={cat.title}>
                    <div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
                      {translateCategoryTitle(cat.title)}
                    </div>
                    <ul className="list-none p-0">
                      {cat.items.map((item) => (
                        <li key={item.href}>
                          <NavigationMenuLink asChild>
                            <Link
                              to={item.href.startsWith("/") ? localizePath(item.href, locale) : item.href}
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
                      {dict.allDocumentation} →
                    </Link>
                  </NavigationMenuLink>
                </li>
              </ul>
            </NavigationMenuContent>
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
          <NavigationMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Language"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border-0 bg-transparent hover:bg-sidebar-accent focus:bg-sidebar-accent focus:outline-none focus:ring-2 focus:ring-sidebar-accent focus:ring-offset-0"
              >
                <Languages className="h-4 w-4 text-sidebar-foreground" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[10rem] border-sidebar-border bg-sidebar text-sidebar-foreground">
                <DropdownMenuRadioGroup value={locale} onValueChange={(value) => handleLocaleChange(value as SupportedLocale)}>
                  {SUPPORTED_LOCALES.map((supportedLocale) => (
                    <DropdownMenuRadioItem key={supportedLocale} value={supportedLocale} className="text-[13px]">
                      {LOCALE_LANGUAGE_NAME[supportedLocale]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
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
                  if (stripLocaleFromPath(pathname) === "/" && !isModifiedClick(e)) {
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
              <nav className="flex flex-col gap-1">
                {stripLocaleFromPath(pathname) === "/" ? (
                  <>
                    <a
                      href={localizeHashHref("#quick-start", locale)}
                      className="rounded-md px-3 py-2 text-[14px] text-sidebar-foreground no-underline hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      onClick={(e) => {
                        if (isModifiedClick(e)) return;
                        e.preventDefault();
                        setMobileMenuOpen(false);
                        const target = document.getElementById("quick-start");
                        if (target) target.scrollIntoView({ behavior: "smooth" });
                        else navigate(localizeHashHref("#quick-start", locale));
                      }}
                    >
                      {dict.quickStart}
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
                      to={localizePath("/docs", locale)}
                      className="rounded-md px-3 py-2 text-[14px] text-sidebar-foreground no-underline hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {dict.quickStart}
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
                <Link
                  to={localizePath("/docs", locale)}
                  className="rounded-md px-3 py-2 text-[14px] text-sidebar-foreground no-underline hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {dict.docs}
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
                <ThemeToggleNavButton mobile />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label="Language"
                    className="inline-flex w-full items-center gap-2 rounded-md px-3 py-2 text-[14px] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:bg-sidebar-accent focus:outline-none focus:ring-2 focus:ring-sidebar-accent focus:ring-offset-0 border-0 bg-transparent text-left"
                  >
                    <Languages className="h-4 w-4 shrink-0" aria-hidden />
                    <span>{LOCALE_LANGUAGE_NAME[locale]}</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[10rem] border-sidebar-border bg-sidebar text-sidebar-foreground">
                    <DropdownMenuRadioGroup value={locale} onValueChange={(value) => handleLocaleChange(value as SupportedLocale)}>
                      {SUPPORTED_LOCALES.map((supportedLocale) => (
                        <DropdownMenuRadioItem key={supportedLocale} value={supportedLocale} className="text-[13px]">
                          {LOCALE_LANGUAGE_NAME[supportedLocale]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
