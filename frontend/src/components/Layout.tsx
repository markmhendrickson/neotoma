import React from "react";
import "@/components/onepager/onepager.css";
import { SiteFooter, SiteHeader, SiteSkipLink } from "@/components/onepager/SiteChrome";
import { SeoDevMetaFooter } from "@/components/SeoDevMetaFooter";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SiteAppNavProvider } from "@/context/SiteAppNavContext";
import { normalizeToDefaultRoute } from "@/i18n/routing";
import { useEffectiveRoutePath } from "@/hooks/useEffectiveRoutePath";
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

export function Layout({ children }: LayoutProps) {
  const stripped = normalizeToDefaultRoute(useEffectiveRoutePath());
  const isRawMarkdownRoute = stripped === "/raw";
  const isMarkdownMirrorRoute = stripped === "/markdown" || stripped.startsWith("/markdown/");
  const isRouteHome = stripped === "/";
  /** These pages render SiteHeader and SiteFooter in their own editorial composition. */
  const ownsSiteChrome =
    (isRouteHome && !isProductBasePath()) || stripped === "/install" || stripped === "/compare";

  if (isRawMarkdownRoute || isMarkdownMirrorRoute) {
    return <>{children}</>;
  }

  if (ownsSiteChrome) {
    return (
      <SiteAppNavProvider>
        <SidebarProvider defaultOpen={false} className="flex-col">
          <div data-site-markdown-root className="contents">
            {children}
          </div>
        </SidebarProvider>
      </SiteAppNavProvider>
    );
  }

  return (
    <div className="plan plan-reader-page">
      <SiteSkipLink />
      <div className="plan-sheet plan-hero">
        <SiteHeader />
      </div>
      <main
        data-site-markdown-root
        className={
          isMarketingFullPageRoute(stripped) ? "plan-reader-main" : "plan-reader-main post-prose"
        }
        id="main"
        tabIndex={-1}
      >
        {children}
      </main>
      <SiteFooter />
      <SeoDevMetaFooter />
    </div>
  );
}
