import React from "react";
import { useLocation } from "react-router-dom";
import { SiteHeaderNav } from "@/components/SiteHeaderNav";
import { DocsSidebar } from "@/components/DocsSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { stripLocaleFromPath } from "@/i18n/routing";

interface LayoutProps {
  children: React.ReactNode;
  siteName?: string;
}

const DEFAULT_SITE_NAME = "Neotoma";

export function Layout({ children, siteName = DEFAULT_SITE_NAME }: LayoutProps) {
  const { pathname } = useLocation();
  const isHome = stripLocaleFromPath(pathname) === "/";

  return (
    <SidebarProvider defaultOpen={true}>
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
