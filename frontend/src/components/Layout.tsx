import React, { useState, useEffect, useRef } from "react";
import { useLocation, Link, useParams } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { formatEntityType } from "@/utils/entityTypeFormatter";
import { SidebarProvider, SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { AppNavigationSidebar } from "@/components/AppNavigationSidebar";
import { cn } from "@/lib/utils";

interface MenuItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

interface LayoutProps {
  children: React.ReactNode;
  siteName?: string;
  menuItems?: MenuItem[];
  routeNames?: Record<string, string>;
  getBreadcrumbLabel?: (
    pathname: string,
    params: Record<string, string | undefined>
  ) => string | null;
  headerActions?: React.ReactNode;
  sidebarFooterActions?: React.ReactNode;
  accountEmail?: string;
  onSearch?: (query: string) => void;
  onSignOut?: () => void;
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
  menuItems = [],
  routeNames = {},
  getBreadcrumbLabel = null,
  headerActions = null,
  sidebarFooterActions = null,
  accountEmail = undefined,
  onSearch = null,
  onSignOut = undefined,
}: LayoutProps) {
  const location = useLocation();
  const params = useParams();
  const [dynamicLabel, setDynamicLabel] = useState<string | null>(null);

  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { sessionToken } = useAuth();
  const bearerToken = keysBearerToken || sessionToken || settings.bearerToken;
  const scrollPositions = useRef(new Map<string, number>());
  const previousPathname = useRef(location.pathname);
  const isRestoringRef = useRef(false);
  const hasRestoredRef = useRef(false);
  const userScrolledRef = useRef(false);

  // Save scroll position when leaving a page (runs before pathname changes)
  useEffect(() => {
    // Save current page's scroll position before navigation
    if (previousPathname.current !== location.pathname) {
      const scrollY = window.scrollY;
      scrollPositions.current.set(previousPathname.current, scrollY);

      // Update previous pathname after saving
      previousPathname.current = location.pathname;
    }
  }, [location.pathname]);

  // Save scroll position as user scrolls (debounced)
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      // Don't save scroll position if we're in the middle of restoring
      if (isRestoringRef.current) {
        // Update lastScrollY to detect when restoration is done
        lastScrollY = window.scrollY;
        return;
      }

      // Only save if user actually scrolled (not programmatic scroll)
      const currentScrollY = window.scrollY;
      if (Math.abs(currentScrollY - lastScrollY) < 1) {
        return;
      }
      lastScrollY = currentScrollY;

      // Mark that user has scrolled (prevents restoration from interfering)
      if (!isRestoringRef.current) {
        userScrolledRef.current = true;
      }

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        scrollPositions.current.set(location.pathname, window.scrollY);
      }, 150);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [location.pathname]);

  // Restore scroll position or scroll to top on route change
  useEffect(() => {
    // Reset flags for new route
    hasRestoredRef.current = false;
    userScrolledRef.current = false;

    const savedPosition = scrollPositions.current.get(location.pathname);

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      // Only restore once per route change
      if (hasRestoredRef.current) return;
      hasRestoredRef.current = true;

      if (savedPosition !== undefined && savedPosition > 0) {
        // Restore saved scroll position for previously visited pages
        isRestoringRef.current = true;

        // Wait for content to render - use multiple strategies for reliability
        let attempts = 0;
        const maxAttempts = 10;

        const tryRestore = () => {
          // Don't restore if user has already scrolled
          if (userScrolledRef.current) {
            isRestoringRef.current = false;
            return;
          }

          attempts++;

          // Check if page has content (not just empty)
          const hasContent = document.body.scrollHeight > window.innerHeight;

          if (hasContent || attempts >= maxAttempts) {
            const actualPosition = Math.min(
              savedPosition,
              document.body.scrollHeight - window.innerHeight
            );
            window.scrollTo({
              top: actualPosition,
              behavior: "auto",
            });

            // Allow scroll tracking after a brief delay
            setTimeout(() => {
              isRestoringRef.current = false;
            }, 100);
          } else {
            // Retry after a short delay
            setTimeout(tryRestore, 50);
          }
        };

        // Start restoration process after a small delay
        setTimeout(tryRestore, 0);
      } else {
        // Scroll to top for new pages
        isRestoringRef.current = true;
        window.scrollTo({ top: 0, behavior: "auto" });

        setTimeout(() => {
          isRestoringRef.current = false;
        }, 100);
      }
    });
  }, [location.pathname]);

  // Load dynamic label if getBreadcrumbLabel function is provided
  useEffect(() => {
    if (getBreadcrumbLabel) {
      const label = getBreadcrumbLabel(location.pathname, params);
      if (label) {
        setDynamicLabel(label);
      } else {
        setDynamicLabel(null);
      }
    } else if (location.pathname.startsWith("/entities/") && params.id) {
      // Fetch entity type for entity detail pages
      if (keysLoading && !sessionToken && !settings.bearerToken) {
        return;
      }

      async function fetchEntityType() {
        try {
          const headers: HeadersInit = {
            "Content-Type": "application/json",
          };

          if (bearerToken) {
            headers["Authorization"] = `Bearer ${bearerToken}`;
          }

          const entityResponse = await fetch(`/api/entities/${params.id}`, { headers });
          if (entityResponse.ok) {
            const entityData = await entityResponse.json();
            if (entityData.entity_type) {
              setDynamicLabel(formatEntityType(entityData.entity_type));
            }
          }
        } catch (error) {
          console.error("Failed to fetch entity for breadcrumb:", error);
        }
      }
      fetchEntityType();
    } else {
      setDynamicLabel(null);
    }
  }, [
    location.pathname,
    params,
    getBreadcrumbLabel,
    bearerToken,
    keysLoading,
    sessionToken,
    settings.bearerToken,
  ]);

  // Generate breadcrumb items from pathname
  const getBreadcrumbs = () => {
    const pathnames = location.pathname.split("/").filter((x) => x);
    const breadcrumbs: Array<{ label: string; href: string; isLast?: boolean }> = [];

    // Always include Home
    if (pathnames.length === 0) {
      breadcrumbs.push({
        label: "Home",
        href: "/",
        isLast: true,
      });
      return breadcrumbs;
    }

    breadcrumbs.push({ label: "Home", href: "/", isLast: false });

    // Build breadcrumbs from path segments
    let currentPath = "";
    pathnames.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const isLast = index === pathnames.length - 1;

      // Use custom label function if provided
      let label: string;
      // Check for "entities" segment first (before checking isLast)
      // This ensures the "entities" segment shows the formatted entity type
      if (segment === "entities" && dynamicLabel) {
        // For /entities/:id routes, show formatted entity type instead of "Entities"
        label = dynamicLabel;
      } else if (routeNames[segment]) {
        label = routeNames[segment];
      } else {
        // Format label (capitalize, replace hyphens with spaces)
        // For entity IDs, just show the segment as-is (or truncated)
        if (segment.startsWith("ent_") && segment.length > 20) {
          label = `${segment.substring(0, 20)}...`;
        } else {
          label = segment
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
        }
      }

      breadcrumbs.push({
        label,
        href: currentPath,
        isLast,
      });
    });

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  // Hide sidebar on OAuth approval pages
  const isOAuthApprovalPage = location.pathname.startsWith("/oauth/consent");

  // For OAuth approval pages, render children directly without sidebar/header
  if (isOAuthApprovalPage) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <AppNavigationSidebar
        siteName={siteName}
        menuItems={menuItems}
        accountEmail={accountEmail}
        footerActions={sidebarFooterActions}
        onSearch={onSearch}
        onSignOut={onSignOut}
      />
      <SidebarInset className="min-w-0 max-w-full overflow-x-hidden">
        <PageHeader breadcrumbs={breadcrumbs} />
        <main className="min-h-screen px-4 pb-4 md:px-6 md:pb-6 min-w-0 max-w-full overflow-x-hidden">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

/**
 * Page header component that conditionally shows sidebar trigger
 */
interface PageHeaderProps {
  breadcrumbs: Array<{ label: string; href: string; isLast?: boolean }>;
}

function PageHeader({ breadcrumbs }: PageHeaderProps) {
  const { open } = useSidebar();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 min-w-0 max-w-full overflow-x-hidden">
      {!open && <SidebarTrigger className="-ml-1 shrink-0" />}
      <Breadcrumb className="min-w-0 flex-1 overflow-hidden max-w-full">
        <BreadcrumbList className="flex-nowrap min-w-0 max-w-full">
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.href}>
              <BreadcrumbItem
                className={cn(
                  "min-w-0",
                  index === breadcrumbs.length - 1 ? "flex-1 min-w-0" : "shrink-0"
                )}
              >
                {crumb.isLast ? (
                  <BreadcrumbPage className="truncate block w-full">{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.href} className="truncate whitespace-nowrap">
                      {crumb.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {index < breadcrumbs.length - 1 && <BreadcrumbSeparator className="shrink-0" />}
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}
