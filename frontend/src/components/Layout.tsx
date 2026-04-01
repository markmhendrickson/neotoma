import React, { useLayoutEffect } from "react";
import { SiteHeaderNav } from "@/components/SiteHeaderNav";
import { SiteTailpiece } from "@/components/SiteTailpiece";
import { SeoDevMetaFooter } from "@/components/SeoDevMetaFooter";
import { DocsSidebar } from "@/components/DocsSidebar";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { SiteAppNavProvider, useSiteAppNavBarVisible } from "@/context/SiteAppNavContext";
import { cn } from "@/lib/utils";
import { normalizeToDefaultRoute } from "@/i18n/routing";
import { useEffectiveRoutePath } from "@/hooks/useEffectiveRoutePath";
import { isPathUnderDocsSidebarNav } from "@/site/docs_sidebar_nav";
import { isMarketingFullPageRoute } from "@/site/full_page_paths";

/** Desktop sidebar starts collapsed on these routes (full-width content). */
function shouldCollapseDocsSidebarForRoute(normalizedPath: string): boolean {
  return (
    normalizedPath === "/evaluate" ||
    normalizedPath === "/install" ||
    normalizedPath.startsWith("/install/")
  );
}

function CollapseSidebarOnEvaluateInstallRoutes() {
  const effectivePath = useEffectiveRoutePath();
  const { setOpen, setOpenMobile } = useSidebar();
  const stripped = normalizeToDefaultRoute(effectivePath);

  useLayoutEffect(() => {
    if (!shouldCollapseDocsSidebarForRoute(stripped)) return;
    setOpen(false);
    setOpenMobile(false);
  }, [stripped, setOpen, setOpenMobile]);

  return null;
}

/** True when the app is served under a product path (e.g. /neotoma-with-claude-code). */
function isProductBasePath(): boolean {
  if (typeof window === "undefined") return false;
  const segment = window.location.pathname.replace(/^\//, "").split("/")[0] ?? "";
  return segment.toLowerCase().startsWith("neotoma-with-");
}

interface LayoutProps {
  children: React.ReactNode;
  siteName?: string;
}

const DEFAULT_SITE_NAME = "Neotoma";

export function Layout({ children, siteName = DEFAULT_SITE_NAME }: LayoutProps) {
  const effectivePath = useEffectiveRoutePath();
  /** Normalize trailing slashes (e.g. static hosting /compliance/) so full-page routes match. */
  const stripped = normalizeToDefaultRoute(effectivePath);
  const isRawMarkdownRoute = stripped === "/raw";
  const isMarkdownMirrorRoute = stripped === "/markdown" || stripped.startsWith("/markdown/");
  const isRouteHome = stripped === "/";
  const isFullPageLanding = isMarketingFullPageRoute(stripped);
  /** Full-bleed shell: home, marketing vertical landings, product-at-root basenames. */
  const isHomeShell = (isRouteHome && !isProductBasePath()) || isFullPageLanding;
  const showDocsSidebar = !isHomeShell && isPathUnderDocsSidebarNav(stripped);
  /** Collapsed by default; cookie `sidebar_state` overrides after first toggle. */
  const docsSidebarDefaultOpen = false;

  if (isRawMarkdownRoute || isMarkdownMirrorRoute) {
    return <>{children}</>;
  }

  return (
    <SiteAppNavProvider>
      <LayoutShell
        siteName={siteName}
        isHomeShell={isHomeShell}
        showDocsSidebar={showDocsSidebar}
        docsSidebarDefaultOpen={docsSidebarDefaultOpen}
      >
        {children}
      </LayoutShell>
    </SiteAppNavProvider>
  );
}

function LayoutShell({
  children,
  siteName,
  isHomeShell,
  showDocsSidebar,
  docsSidebarDefaultOpen,
}: {
  children: React.ReactNode;
  siteName: string;
  isHomeShell: boolean;
  showDocsSidebar: boolean;
  docsSidebarDefaultOpen: boolean;
}) {
  const appNavBarVisible = useSiteAppNavBarVisible();

  return (
    <SidebarProvider defaultOpen={docsSidebarDefaultOpen} className="flex-col">
      <CollapseSidebarOnEvaluateInstallRoutes />
      <SiteHeaderNav showSidebarTrigger={showDocsSidebar} />
      <div
        className={
          isHomeShell
            ? undefined
            : cn(
                "flex flex-1 min-h-0 min-w-0 overflow-hidden transition-[padding-top] duration-300 ease-out",
                appNavBarVisible ? "pt-12" : "pt-0",
              )
        }
      >
        {isHomeShell ? (
          <>
            <div data-site-markdown-root className="contents">
              {children}
            </div>
            <SeoDevMetaFooter />
          </>
        ) : (
          <>
            {showDocsSidebar && <DocsSidebar siteName={siteName} belowHeader />}
            <SidebarInset
              data-site-header-scroll-root
              className="min-h-0 min-w-0 flex-1 overflow-y-auto"
            >
              <div data-site-markdown-root className="contents min-w-0">
                {children}
              </div>
              <SiteTailpiece />
              <SeoDevMetaFooter />
            </SidebarInset>
          </>
        )}
      </div>
    </SidebarProvider>
  );
}
