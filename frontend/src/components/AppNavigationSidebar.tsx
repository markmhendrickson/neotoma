import { useEffect, useMemo, useRef, useState } from "react";
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
  AlertTriangle,
  BookOpen,
  Bot,
  BookText,
  Bug,
  Container,
  ExternalLink,
  GraduationCap,
  Layers,
  MessageSquare,
  Monitor,
  Moon,
  Package,
  Rocket,
  SatelliteDish,
  Server,
  ShieldCheck,
  Sun,
  Terminal,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useLocale } from "@/i18n/LocaleContext";

interface AppNavigationSidebarProps {
  siteName: string;
}

/** Bottom inset so nav clears browser chrome; safe-area-aware. */
const MOBILE_NAV_BOTTOM = "max(5.75rem, 1.5rem, env(safe-area-inset-bottom, 0px))";

const SIDEBAR_ICONS: Record<string, LucideIcon> = {
  AlertTriangle,
  BookOpen,
  Bot,
  BookText,
  Bug,
  Container,
  ExternalLink,
  GraduationCap,
  Layers,
  MessageSquare,
  Package,
  Rocket,
  SatelliteDish,
  Server,
  ShieldCheck,
  Terminal,
  Users,
  Zap,
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
function ThemeToggle() {
  const { theme, cycleTheme } = useTheme();
  const label =
    theme === "system"
      ? "System"
      : theme === "dark"
        ? "Dark"
        : "Light";
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
  const { isMobile, setOpen, setOpenMobile, state } = useSidebar();
  const { direction } = useLocale();
  const [activeSection, setActiveSection] = useState<string>(SITE_SECTIONS[0]?.id ?? "install");
  const hasManualSidebarToggleRef = useRef(false);
  const autoSidebarStateRef = useRef<boolean | null>(null);

  const sectionIds = useMemo(() => SITE_SECTIONS.map((section) => section.id), []);

  useEffect(() => {
    const scrollToSection = (id: string) => {
      const el = document.getElementById(id);
      if (el) {
        requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        return true;
      }
      return false;
    };

    const updateFromHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash && sectionIds.includes(hash)) {
        setActiveSection(hash);
        if (!scrollToSection(hash)) {
          // On initial load the section may not be in the DOM yet; retry after layout
          const retryId = window.setTimeout(() => {
            scrollToSection(hash);
          }, 100);
          return () => window.clearTimeout(retryId);
        }
      }
    };

    const cleanup = updateFromHash();
    window.addEventListener("hashchange", updateFromHash);
    return () => {
      window.removeEventListener("hashchange", updateFromHash);
      if (typeof cleanup === "function") cleanup();
    };
  }, [sectionIds]);

  useEffect(() => {
    if (isMobile) return;

    // Desktop behavior for site home: auto-collapse while in install section,
    // auto-expand below it, unless user has manually toggled.
    const installSection = document.getElementById("install");
    if (!installSection) return;

    const syncSidebarToScroll = () => {
      if (hasManualSidebarToggleRef.current) return;
      const threshold = installSection.getBoundingClientRect().bottom + window.scrollY - 120;
      const shouldBeOpen = window.scrollY >= threshold;
      if (autoSidebarStateRef.current !== shouldBeOpen) {
        setOpen(shouldBeOpen);
        autoSidebarStateRef.current = shouldBeOpen;
      }
    };

    let rafId = 0;
    const onScroll = () => {
      rafId = window.requestAnimationFrame(syncSidebarToScroll);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    syncSidebarToScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(rafId);
    };
  }, [isMobile, setOpen]);

  useEffect(() => {
    if (isMobile) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        hasManualSidebarToggleRef.current = true;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobile]);

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

  const onSidebarTriggerClick = () => {
    hasManualSidebarToggleRef.current = true;
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
                  tooltip={section.shortLabel}
                  className={sectionLinkClass(activeSection === section.id)}
                >
                  <a href={`/#${section.id}`} onClick={onSectionClick}>
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
    <Sidebar
      collapsible="icon"
      side={isMobile ? "right" : direction === "rtl" ? "right" : "left"}
    >
      <SidebarHeader className="flex-row items-center gap-2 py-2 px-3 h-16 border-b border-sidebar-border">
        {state !== "collapsed" ? (
          <>
            <SidebarTrigger className="shrink-0" onClick={onSidebarTriggerClick} />
            <a
              href="#"
              onClick={onSectionClick}
              className="text-base font-semibold truncate min-w-0 hover:text-sidebar-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {siteName}
            </a>
          </>
        ) : (
          <SidebarTrigger className="shrink-0" onClick={onSidebarTriggerClick} />
        )}
      </SidebarHeader>
      <SidebarContent className="bg-sidebar md:pb-4 flex flex-col min-h-0">
        {isMobile ? (
          <>
            <div className="flex-1 min-h-0" aria-hidden="true" />
            <div
              className="flex flex-col gap-1 border-t border-sidebar-border px-2 pt-4 pb-2 text-sidebar-foreground md:hidden"
              style={{ paddingBottom: MOBILE_NAV_BOTTOM }}
            >
              <nav className="flex flex-col gap-1 p-0">
                {menuContent}
              </nav>
              <div className="mt-auto border-t border-sidebar-border p-2 flex flex-col gap-1">
                <ThemeToggle />
              </div>
            </div>
          </>
        ) : (
          menuContent
        )}
      </SidebarContent>
      {!isMobile && (
        <>
          <SidebarSeparator className="mx-2" />
          <SidebarFooter className="mt-auto border-t border-sidebar-border pt-2">
            <ThemeToggle />
          </SidebarFooter>
        </>
      )}
    </Sidebar>
  );
}
