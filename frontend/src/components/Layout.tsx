import React from "react";
import { useLocation } from "react-router-dom";
import { SiteHeaderNav } from "@/components/SiteHeaderNav";
import { SeoDevMetaFooter } from "@/components/SeoDevMetaFooter";
import { DocsSidebar } from "@/components/DocsSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { normalizeToDefaultRoute } from "@/i18n/routing";
import { isPathUnderDocsSidebarNav } from "@/site/docs_sidebar_nav";
import { isMarketingFullPageRoute } from "@/site/full_page_paths";

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
  const { pathname } = useLocation();
  /** Normalize trailing slashes (e.g. static hosting /compliance/) so full-page routes match. */
  const stripped = normalizeToDefaultRoute(pathname);
  const isRawMarkdownRoute = stripped === "/raw";
  const isRouteHome = stripped === "/";
  const isFullPageLanding = isMarketingFullPageRoute(stripped);
  /** Full-bleed shell: home, marketing vertical landings, product-at-root basenames. */
  const isHomeShell = (isRouteHome && !isProductBasePath()) || isFullPageLanding;
  const showDocsSidebar = !isHomeShell && isPathUnderDocsSidebarNav(stripped);

  if (isRawMarkdownRoute) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider defaultOpen={true} className="flex-col">
      <SiteHeaderNav showSidebarTrigger={showDocsSidebar} />
      <div className={isHomeShell ? undefined : "flex flex-1 min-h-0 pt-12"}>
        {isHomeShell ? (
          children
        ) : (
          <>
            {showDocsSidebar && <DocsSidebar siteName={siteName} belowHeader />}
            <SidebarInset>{children}</SidebarInset>
          </>
        )}
      </div>
      <SeoDevMetaFooter />
    </SidebarProvider>
  );
}
