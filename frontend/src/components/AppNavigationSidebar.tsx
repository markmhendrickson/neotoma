import { useEffect, useMemo, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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
  ExternalLink,
  GraduationCap,
  MessageSquare,
  Package,
  SatelliteDish,
  Server,
  Terminal,
  type LucideIcon,
} from "lucide-react";

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
  ExternalLink,
  GraduationCap,
  MessageSquare,
  Package,
  SatelliteDish,
  Server,
  Terminal,
};

const sectionLinkClass = (active: boolean) =>
  cn(
    "h-8 text-[14px]",
    active ? "bg-neutral-200 text-neutral-950" : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950"
  );

/**
 * Site-only app navigation sidebar.
 * On mobile, section links are in a bar at the bottom of the sheet (thumb-friendly); sheet slides from the right.
 */
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

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      {
        rootMargin: "-20% 0px -65% 0px",
        threshold: [0.1, 0.4, 0.7],
      }
    );

    headingElements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
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
      <SidebarHeader className="flex-row items-center gap-2 py-2 px-3 h-16 border-b border-neutral-200">
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
      <SidebarContent className="bg-neutral-50 md:pb-4">
        {isMobile ? (
          <div className="flex-1 min-h-0" aria-hidden="true" />
        ) : (
          menuContent
        )}
      </SidebarContent>
      {isMobile && (
        <div
          className="absolute inset-x-0 flex flex-col gap-2 border-t border-neutral-200 bg-neutral-50 px-2 pt-4 pb-6 text-neutral-800 md:hidden"
          style={{ bottom: MOBILE_NAV_BOTTOM }}
        >
          {menuContent}
        </div>
      )}
    </Sidebar>
  );
}
