import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bookmark,
  BookOpen,
  Bot,
  Boxes,
  Briefcase,
  Building2,
  Bug,
  Code,
  Container,
  Cpu,
  Database,
  Github,
  Globe,
  History,
  Home,
  Layers,
  MessageCircle,
  MessageSquare,
  Monitor,
  Package,
  PanelRight,
  Rocket,
  SatelliteDish,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Zap,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SiClaude, SiOpenai } from "react-icons/si";
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
import { CursorIcon } from "@/components/icons/CursorIcon";
import { OpenClawIcon } from "@/components/icons/OpenClawIcon";
import { DOC_NAV_CATEGORIES } from "@/site/site_data";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";

/** Branded icons for Integrations nav items (by canonical href). */
const INTEGRATION_BRAND_ICONS: Record<string, React.ComponentType<{ className?: string; "aria-hidden"?: boolean; size?: number }>> = {
  "/neotoma-with-claude-code": SiClaude,
  "/neotoma-with-claude": SiClaude,
  "/neotoma-with-chatgpt": SiOpenai,
  "/neotoma-with-codex": SiOpenai,
  "/neotoma-with-cursor": CursorIcon,
  "/neotoma-with-openclaw": OpenClawIcon,
};

const DOC_NAV_ICONS: Record<string, LucideIcon> = {
  Bookmark,
  BookOpen,
  Bot,
  Boxes,
  Briefcase,
  Building2,
  Bug,
  Code,
  Container,
  Cpu,
  Database,
  Github,
  Globe,
  History,
  Home,
  Layers,
  MessageCircle,
  MessageSquare,
  Monitor,
  Package,
  PanelRight,
  Rocket,
  SatelliteDish,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Zap,
};

const SECTION_PREVIEW_COUNT = 3;
const INTEGRATIONS_COLLAPSED_HREFS = new Set([
  "/neotoma-with-claude-code",
  "/neotoma-with-codex",
  "/neotoma-with-cursor",
]);

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
  const { pathname, hash } = useLocation();
  const { isMobile, setOpenMobile, state: sidebarState } = useSidebar();
  const { locale, dict } = useLocale();
  const isItemActive = (href: string) => {
    const localizedHref = href.startsWith("/") ? localizePath(href, locale) : href;
    const currentFullPath = `${pathname}${hash}`;
    return (
      localizedHref === currentFullPath || (!localizedHref.includes("#") && pathname === localizedHref)
    );
  };

  const defaultOpenCategories = useMemo(() => {
    const open = new Set<string>(DOC_NAV_CATEGORIES.map((category) => category.title));
    DOC_NAV_CATEGORIES.forEach((category) => {
      if (category.items.some((item) => item.href.startsWith("/") && isItemActive(item.href))) {
        open.add(category.title);
      }
    });
    return open;
  }, [pathname, hash, locale]);

  const [openCategories, setOpenCategories] = useState<Set<string>>(defaultOpenCategories);
  const defaultExpandedCategoryItems = useMemo(() => {
    const expanded = new Set<string>();
    DOC_NAV_CATEGORIES.forEach((category) => {
      const activeIndex = category.items.findIndex(
        (item) => item.href.startsWith("/") && isItemActive(item.href),
      );
      if (activeIndex >= SECTION_PREVIEW_COUNT) expanded.add(category.title);
    });
    return expanded;
  }, [pathname, hash, locale]);
  const [expandedCategoryItems, setExpandedCategoryItems] = useState<Set<string>>(
    defaultExpandedCategoryItems,
  );

  useEffect(() => {
    setOpenCategories((current) => {
      const next = new Set(current);
      defaultOpenCategories.forEach((title) => next.add(title));
      return next;
    });
  }, [defaultOpenCategories]);
  useEffect(() => {
    setExpandedCategoryItems((current) => {
      const next = new Set(current);
      defaultExpandedCategoryItems.forEach((title) => next.add(title));
      return next;
    });
  }, [defaultExpandedCategoryItems]);

  const translateCategoryTitle = (title: string) => {
    if (title === "Getting started") return dict.categoryGettingStarted;
    if (title === "Reference") return dict.categoryReference;
    if (title === "Agent behavior") return dict.categoryAgentBehavior;
    if (title === "Use cases") return dict.categoryUseCases;
    if (title === "Integration guides" || title === "Integrations") return dict.categoryIntegrationGuides;
    if (title === "External") return dict.categoryExternal;
    return title;
  };

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
  const toggleCategoryItems = (title: string) => {
    setExpandedCategoryItems((current) => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const navContent = (
    <>
      {DOC_NAV_CATEGORIES.map((cat) => (
        <SidebarGroup key={cat.title}>
          {(() => {
            const isCategoryOpen = openCategories.has(cat.title);
            const isPreviewExpanded = expandedCategoryItems.has(cat.title);
            const visibleItems = isPreviewExpanded
              ? cat.items
              : cat.title === "Integrations"
                ? cat.items.filter((item) => INTEGRATIONS_COLLAPSED_HREFS.has(item.href))
                : cat.items.slice(0, SECTION_PREVIEW_COUNT);
            const isShowingAllItems = visibleItems.length >= cat.items.length;
            return (
              <>
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
              {translateCategoryTitle(cat.title)}
            </button>
          </SidebarGroupLabel>
          <SidebarGroupContent className={cn(!isCategoryOpen && "hidden")}>
            <SidebarMenu>
              {visibleItems.map((item) => {
                const localizedHref = item.href.startsWith("/")
                  ? localizePath(item.href, locale)
                  : item.href;
                const isActive = isItemActive(item.href);
                const isIntegrations = cat.title === "Integrations";
                const BrandIcon =
                  isIntegrations && item.href.startsWith("/") ? INTEGRATION_BRAND_ICONS[item.href] : null;
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
              {cat.items.length > SECTION_PREVIEW_COUNT && sidebarState === "expanded" && (
                <SidebarMenuItem>
                  <button
                    type="button"
                    onClick={() => toggleCategoryItems(cat.title)}
                    aria-expanded={isShowingAllItems}
                    className="h-8 w-full rounded-md px-2 text-left text-[12px] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
                  >
                    {isShowingAllItems ? "Show less" : "Show more"}
                  </button>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
              </>
            );
          })()}
        </SidebarGroup>
      ))}
    </>
  );

  return (
    <Sidebar collapsible="icon" side={isMobile ? "right" : "left"} belowHeader={belowHeader}>
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
