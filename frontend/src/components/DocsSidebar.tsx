import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useEffectiveRoutePath } from "@/hooks/useEffectiveRoutePath";
import { ChevronRight } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { DOC_NAV_ICONS, INTEGRATION_BRAND_ICONS } from "@/site/doc_icons";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/LocaleContext";
import type { SupportedLocale } from "@/i18n/config";
import { localizePath, normalizeToDefaultRoute, stripLocaleFromPath } from "@/i18n/routing";
import { getLocalizedDocNavCategories } from "@/site/site_data_localized";
import { useSiteAppNavBarVisible } from "@/context/SiteAppNavContext";

/** Categories with more items show a "Show more" control after this many links (Reference, Compare, …). */
const DOC_SIDEBAR_ITEMS_BEFORE_MORE = 6;

function navKeyForHref(href: string, locale: SupportedLocale): string {
  const [pathPart, frag] = href.split("#");
  if (!pathPart.startsWith("/")) return href;
  const localized = localizePath(pathPart, locale);
  const base = normalizeToDefaultRoute(stripLocaleFromPath(localized));
  return frag ? `${base}#${frag}` : base;
}

const linkClass = (active: boolean) =>
  cn(
    "h-8 text-[13px]",
    active
      ? "bg-sidebar-accent text-sidebar-foreground font-medium"
      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
  );

interface DocsSidebarProps {
  siteName: string;
  /** When true, sidebar starts below the app header (e.g. SiteHeaderNav). */
  belowHeader?: boolean;
}

export function DocsSidebar({ siteName: _siteName, belowHeader }: DocsSidebarProps) {
  const appNavBarVisible = useSiteAppNavBarVisible();
  const { hash } = useLocation();
  const effectivePath = useEffectiveRoutePath();
  const { isMobile, setOpenMobile, state: sidebarState } = useSidebar();
  /** Icon/collapsed desktop rail: show every link (tooltips); omit show-more row (no room for label). */
  const sidebarShowsLabels = isMobile || sidebarState === "expanded";
  const { locale, dict, direction } = useLocale();
  const orderedCategories = useMemo(() => {
    const categories = [...getLocalizedDocNavCategories(dict)];
    const referenceIndex = categories.findIndex((category) =>
      category.items.some((item) => item.href === "/api")
    );
    const useCasesIndex = categories.findIndex((category) =>
      category.items.some((item) => item.href === "/debugging-infrastructure")
    );
    if (
      referenceIndex >= 0 &&
      useCasesIndex >= 0 &&
      useCasesIndex > referenceIndex
    ) {
      const [useCasesCategory] = categories.splice(useCasesIndex, 1);
      categories.splice(referenceIndex, 0, useCasesCategory);
    }
    return categories;
  }, [dict]);

  const isItemActive = useCallback(
    (href: string) => {
      if (!href.startsWith("/")) return false;
      const currentKey = hash ? `${effectivePath}${hash}` : effectivePath;
      return navKeyForHref(href, locale) === currentKey;
    },
    [effectivePath, hash, locale],
  );

  const defaultOpenCategories = useMemo(() => {
    const open = new Set<string>(orderedCategories.map((category) => category.title));
    orderedCategories.forEach((category) => {
      if (category.items.some((item) => item.href.startsWith("/") && isItemActive(item.href))) {
        open.add(category.title);
      }
    });
    return open;
  }, [orderedCategories, isItemActive]);

  const [openCategories, setOpenCategories] = useState<Set<string>>(defaultOpenCategories);

  useEffect(() => {
    setOpenCategories((current) => {
      const next = new Set(current);
      defaultOpenCategories.forEach((title) => next.add(title));
      return next;
    });
  }, [defaultOpenCategories]);

  const [navExpandedByCategory, setNavExpandedByCategory] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setNavExpandedByCategory((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const cat of orderedCategories) {
        if (cat.items.length <= DOC_SIDEBAR_ITEMS_BEFORE_MORE) continue;
        const overflow = cat.items.slice(DOC_SIDEBAR_ITEMS_BEFORE_MORE);
        if (overflow.some((item) => item.href.startsWith("/") && isItemActive(item.href))) {
          if (!next[cat.title]) {
            next[cat.title] = true;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [orderedCategories, isItemActive]);

  const closeMobileOnClick = () => {
    if (isMobile) setOpenMobile(false);
  };
  const toggleCategory = (title: string) => {
    setOpenCategories((current) => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };
  const navContent = (
    <>
      {orderedCategories.map((cat) => {
        const groupLabel = cat.sidebarTitle ?? cat.title;
        const isCategoryOpen = openCategories.has(cat.title);
        const needsMoreToggle = cat.items.length > DOC_SIDEBAR_ITEMS_BEFORE_MORE;
        const isNavExpanded = navExpandedByCategory[cat.title] ?? false;
        const displayItems =
          sidebarShowsLabels && needsMoreToggle && !isNavExpanded
            ? cat.items.slice(0, DOC_SIDEBAR_ITEMS_BEFORE_MORE)
            : cat.items;
        const isIntegrationsCategory = cat.items.some((candidate) =>
          candidate.href.startsWith("/neotoma-with-"),
        );
        return (
          <SidebarGroup key={cat.title}>
            <SidebarGroupLabel className="px-0">
              <button
                type="button"
                onClick={() => toggleCategory(cat.title)}
                className="flex w-full items-center gap-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground"
                aria-expanded={isCategoryOpen}
              >
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform",
                    isCategoryOpen && "rotate-90",
                  )}
                  aria-hidden
                />
                {groupLabel}
              </button>
            </SidebarGroupLabel>
            <SidebarGroupContent className={cn(!isCategoryOpen && "hidden")}>
              <SidebarMenu>
                {displayItems.map((item) => {
                  const localizedHref = item.href.startsWith("/")
                    ? localizePath(item.href, locale)
                    : item.href;
                  const isActive = isItemActive(item.href);
                  const BrandIcon =
                    isIntegrationsCategory && item.href.startsWith("/")
                      ? INTEGRATION_BRAND_ICONS[item.href]
                      : null;
                  const Icon = BrandIcon ?? DOC_NAV_ICONS[item.icon ?? "BookOpen"];
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                        className={linkClass(isActive)}
                      >
                        <Link to={localizedHref} onClick={closeMobileOnClick}>
                          {BrandIcon ? (
                            <BrandIcon className="size-4 shrink-0" aria-hidden />
                          ) : Icon ? (
                            <Icon aria-hidden />
                          ) : null}
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
                {needsMoreToggle && sidebarShowsLabels ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      type="button"
                      onClick={() =>
                        setNavExpandedByCategory((s) => ({
                          ...s,
                          [cat.title]: !isNavExpanded,
                        }))
                      }
                      className={cn(
                        "h-8 text-[12px] font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground",
                      )}
                      aria-expanded={isNavExpanded}
                    >
                      {isNavExpanded ? dict.showLess : dict.showMore}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })}
    </>
  );

  return (
    <Sidebar
      collapsible="icon"
      side={isMobile ? "right" : direction === "rtl" ? "right" : "left"}
      belowHeader={belowHeader}
      appNavBarVisible={appNavBarVisible}
    >
      <SidebarContent className="md:pb-4">
        {isMobile ? (
          <div className="flex-1 min-h-0" aria-hidden="true" />
        ) : (
          navContent
        )}
      </SidebarContent>
      {isMobile && (
        <div
          className="absolute inset-x-0 flex flex-col gap-2 border-t border-sidebar-border bg-sidebar px-2 pt-4 pb-6 text-sidebar-foreground md:hidden"
          style={{ bottom: "max(5.75rem, 1.5rem, env(safe-area-inset-bottom, 0px))" }}
        >
          {navContent}
        </div>
      )}
    </Sidebar>
  );
}
