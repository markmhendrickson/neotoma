import { Link, useLocation } from "react-router-dom";
import {
  BookOpen,
  Bot,
  Building2,
  Code,
  Container,
  Cpu,
  Github,
  Globe,
  MessageSquare,
  Package,
  Rocket,
  SatelliteDish,
  Server,
  Terminal,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { DOC_NAV_CATEGORIES } from "@/site/site_data";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";

const DOC_NAV_ICONS: Record<string, LucideIcon> = {
  BookOpen,
  Bot,
  Building2,
  Code,
  Container,
  Cpu,
  Github,
  Globe,
  MessageSquare,
  Package,
  Rocket,
  SatelliteDish,
  Server,
  Terminal,
  Users,
  Zap,
};

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
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const { locale, dict } = useLocale();
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

  const navContent = (
    <>
      {DOC_NAV_CATEGORIES.map((cat) => (
        <SidebarGroup key={cat.title}>
          <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            {translateCategoryTitle(cat.title)}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {cat.items.map((item) => {
                const localizedHref = item.href.startsWith("/") ? localizePath(item.href, locale) : item.href;
                const isActive = pathname === localizedHref;
                const Icon = item.icon ? DOC_NAV_ICONS[item.icon] : null;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                      className={linkClass(isActive)}
                    >
                      <Link to={localizedHref} onClick={closeMobileOnClick}>
                        {Icon ? <Icon aria-hidden /> : null}
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
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
