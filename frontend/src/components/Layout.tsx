import React from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppNavigationSidebar } from "@/components/AppNavigationSidebar";
import { cn } from "@/lib/utils";

/**
 * Fixed menu button at bottom-right on mobile only. Opens sidebar (sheet) from the right.
 * Bottom inset matches right (1.5rem) for equal corner spacing; respects safe-area when set.
 */
function MobileMenuFab() {
  const { isMobile } = useSidebar();
  if (!isMobile) return null;
  return (
    <div
      className="fixed right-6 z-50 md:hidden"
      style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))" }}
    >
      <SidebarTrigger
        className="flex h-14 w-14 items-center justify-center rounded-full bg-black text-white shadow-lg hover:!bg-black hover:!text-white active:!bg-black active:!text-white focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Open menu"
      />
    </div>
  );
}

interface LayoutProps {
  children: React.ReactNode;
  siteName?: string;
}

/**
 * Main layout component with sidebar, breadcrumbs, and scroll restoration
 *
 * Features:
 * - Sidebar navigation with auto-close on mobile
 * - Dynamic breadcrumb generation from pathname
 * - Scroll position restoration across navigation
 * - Sticky header with breadcrumbs and user actions (sidebar trigger lives in sidebar)
 * - Overflow handling to prevent horizontal scroll
 *
 * @param props.children - Page content to render
 * @param props.siteName - Site name for sidebar header (default: "Neotoma")
 * @param props.menuItems - Navigation menu items for sidebar
 * @param props.routeNames - Route name mapping for breadcrumbs
 * @param props.getBreadcrumbLabel - Optional function to get custom breadcrumb labels for dynamic routes
 * @param props.headerActions - User actions to display in header (email, settings, sign out, etc.)
 */
export function Layout({
  children,
  siteName = "Neotoma",
}: LayoutProps) {
  return (
    <SidebarProvider defaultOpen={true}>
      <AppNavigationSidebar siteName={siteName} />
      <MobileMenuFab />
      <SidebarInset className="min-w-0 max-w-full overflow-x-hidden">
        <main
          className={cn(
            "min-h-screen px-2 pt-6 pb-4 md:px-4 md:pt-8 md:pb-6 min-w-0 max-w-full overflow-x-hidden"
          )}
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
