import { useEffect, useMemo, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { SITE_SECTIONS } from "@/site/site_data";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Bot,
  BookText,
  Bug,
  Container,
  ExternalLink,
  GraduationCap,
  MessageSquare,
  Monitor,
  Moon,
  Package,
  Rocket,
  SatelliteDish,
  Server,
  Sun,
  Terminal,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

interface AppNavigationSidebarProps {
  siteName: string;
}

/** Bottom inset so nav clears browser chrome; safe-area-aware. */
const MOBILE_NAV_BOTTOM = "max(5.75rem, 1.5rem, env(safe-area-inset-bottom, 0px))";

const SIDEBAR_ICONS: Record<string, LucideIcon> = {
  BookOpen,
  Bot,
  BookText,
  Bug,
  Container,
  ExternalLink,
  GraduationCap,
  MessageSquare,
  Package,
  Rocket,
  SatelliteDish,
  Server,
  Terminal,
  Users,
};

const sectionLinkClass = (active: boolean) =>
  cn(
    "h-8 text-[14px]",
    active ? "bg-sidebar-accent text-sidebar-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
  );

/**
 * Site-only app navigation sidebar.
 * On mobile, section links are in a bar at the bottom of the sheet (thumb-friendly); sheet slides from the right.
 */
type ThemeOption = "light" | "dark" | "system";

const THEME_ORDER: ThemeOption[] = ["light", "dark", "system"];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const cycleTheme = () => {
    const idx = THEME_ORDER.indexOf(theme as ThemeOption);
    setTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
  };
  const label =
    theme === "system"
      ? "Theme: System (follows device)"
      : theme === "dark"
        ? "Theme: Dark"
        : "Theme: Light";
  const shortLabel = theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light";
  const Icon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;
  return (
    <button
      type="button"
      onClick={cycleTheme}
      aria-label={label}
      title={label}
      className="flex h-8 w-full items-center justify-center gap-2 rounded-md px-2 text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0"
    >
      <Icon aria-hidden />
      <span className="truncate text-[13px] group-data-[collapsible=icon]:hidden">{shortLabel}</span>
    </button>
  );
}

export function AppNavigationSidebar({ siteName }: AppNavigationSidebarProps) {
  const { isMobile, setOpenMobile, state } = useSidebar();
  const [activeSection, setActiveSection] = useState<string>(SITE_SECTIONS[0]?.id ?? "install");

  const sectionIds = useMemo(() => SITE_SECTIONS.map((section) => section.id), []);

  useEffect(() => {
    const updateFromHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash && sectionIds.includes(hash)) {
        setActiveSection(hash);
      }
    };

    updateFromHash();
    window.addEventListener("hashchange", updateFromHash);
    return () => window.removeEventListener("hashchange", updateFromHash);
  }, [sectionIds]);

  useEffect(() => {
    const headingElements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (headingElements.length === 0) {
      return;
    }

    const scrollMargin = 120;
    const updateActiveFromScroll = () => {
      const viewportTop = window.scrollY + scrollMargin;
      let best: { id: string; top: number } | null = null;
      for (const el of headingElements) {
        const top = el.getBoundingClientRect().top + window.scrollY;
        if (top <= viewportTop && (!best || top > best.top)) {
          best = { id: el.id, top };
        }
      }
      if (best) {
        setActiveSection(best.id);
      } else {
        setActiveSection(headingElements[0].id);
      }
    };

    let rafId: number;
    const scrollListener = () => {
      rafId = requestAnimationFrame(updateActiveFromScroll);
    };
    window.addEventListener("scroll", scrollListener, { passive: true });
    updateActiveFromScroll();

    return () => {
      window.removeEventListener("scroll", scrollListener);
      cancelAnimationFrame(rafId);
    };
  }, [sectionIds]);

  const onSectionClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const menuContent = (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {SITE_SECTIONS.map((section) => {
            const Icon = SIDEBAR_ICONS[section.icon];
            return (
              <SidebarMenuItem key={section.id}>
                <SidebarMenuButton
                  asChild
                  isActive={activeSection === section.id}
                  className={sectionLinkClass(activeSection === section.id)}
                >
                  <a href={`#${section.id}`} onClick={onSectionClick}>
                    {Icon && (
                      <span className="flex shrink-0 text-current [&>svg]:size-5 [&>svg]:fill-none [&>svg]:stroke-current md:[&>svg]:size-4">
                        <Icon aria-hidden />
                      </span>
                    )}
                    <span>{section.shortLabel}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon" side={isMobile ? "right" : "left"}>
      <SidebarHeader className="flex-row items-center gap-2 py-2 px-3 h-16 border-b border-sidebar-border">
        {state !== "collapsed" ? (
          <>
            <SidebarTrigger className="shrink-0" />
            <a
              href="#"
              onClick={onSectionClick}
              className="text-base font-semibold truncate min-w-0 hover:text-sidebar-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {siteName}
            </a>
          </>
        ) : (
          <SidebarTrigger className="shrink-0" />
        )}
      </SidebarHeader>
      <SidebarContent className="bg-sidebar md:pb-4">
        {isMobile ? (
          <div className="flex-1 min-h-0" aria-hidden="true" />
        ) : (
          menuContent
        )}
      </SidebarContent>
      <SidebarSeparator className="mx-2" />
      <SidebarFooter className="mt-auto border-t border-sidebar-border pt-2">
        <ThemeToggle />
      </SidebarFooter>
      {isMobile && (
        <div
          className="absolute inset-x-0 flex flex-col gap-2 border-t border-sidebar-border bg-sidebar px-2 pt-4 pb-6 text-sidebar-foreground md:hidden"
          style={{ bottom: MOBILE_NAV_BOTTOM }}
        >
          {menuContent}
        </div>
      )}
    </Sidebar>
  );
}
