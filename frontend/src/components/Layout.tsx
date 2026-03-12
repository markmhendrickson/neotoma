import React from "react";
import { useLocation } from "react-router-dom";
import { SiteHeaderNav } from "@/components/SiteHeaderNav";
import { DocsSidebar } from "@/components/DocsSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { stripLocaleFromPath } from "@/i18n/routing";

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
  const isRouteHome = stripLocaleFromPath(pathname) === "/";
  const isHome = isRouteHome && !isProductBasePath();

  return (
    <SidebarProvider defaultOpen={true} className="flex-col">
      <SiteHeaderNav showSidebarTrigger={!isHome} />
      <div className={isHome ? undefined : "flex flex-1 min-h-0 pt-12"}>
        {isHome ? (
          children
        ) : (
          <>
            <DocsSidebar siteName={siteName} belowHeader />
            <SidebarInset>{children}</SidebarInset>
          </>
        )}
      </div>
    </SidebarProvider>
  );
}
