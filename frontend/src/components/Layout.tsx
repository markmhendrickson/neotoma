import React, { useState, useEffect, useRef } from "react";
import { useLocation, Link, useParams } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { formatEntityType } from "@/utils/entityTypeFormatter";
import { getEntityDisplayName } from "@/utils/entityDisplay";
import { SidebarProvider, SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppNavigationSidebar } from "@/components/AppNavigationSidebar";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { RealtimeStatusIndicator } from "@/components/RealtimeStatusIndicator";

interface MenuItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

// Design system sub-pages for dropdown breadcrumb
const DESIGN_SYSTEM_SECTIONS = [
  { id: "colors", label: "Colors" },
  { id: "typography", label: "Typography" },
  { id: "style-guide", label: "Style Guide" },
  { id: "page-formats", label: "Page formats" },
  { id: "spacing", label: "Spacing" },
  { id: "buttons", label: "Buttons" },
  { id: "inputs", label: "Inputs" },
  { id: "tables", label: "Tables" },
  { id: "cards", label: "Cards" },
  { id: "badges", label: "Badges" },
  { id: "tabs", label: "Tabs" },
  { id: "progress", label: "Progress" },
  { id: "skeleton", label: "Skeleton" },
  { id: "switch", label: "Switch" },
  { id: "tooltip", label: "Tooltip" },
  { id: "collapsible", label: "Collapsible" },
];

const PAGE_FADE_DELAY_MS = 200;
const PAGE_FADE_DURATION_MS = 400;
const TITLE_SEPARATOR = " | ";

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function formatPathTitle(segment: string): string {
  return segment
    .split("-")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ""))
    .join(" ");
}

function buildDocumentTitle({
  pathname,
  siteName,
  routeNames,
  dynamicEntityName,
  dynamicEntityType,
}: {
  pathname: string;
  siteName: string;
  routeNames: Record<string, string>;
  dynamicEntityName: string | null;
  dynamicEntityType: string | null;
}): string {
  const segments = pathname.split("/").filter(Boolean);
  const routeKey = segments.join("/");

  if (routeKey === "") {
    return `Dashboard${TITLE_SEPARATOR}${siteName}`;
  }

  if (routeNames[routeKey]) {
    return `${routeNames[routeKey]}${TITLE_SEPARATOR}${siteName}`;
  }

  const [root, child] = segments;

  if (root === "entity" && child) {
    const entityLabel = dynamicEntityName && dynamicEntityName !== "…" ? dynamicEntityName : "Entity details";
    return `${entityLabel}${TITLE_SEPARATOR}${siteName}`;
  }

  if (root === "entities" && child) {
    const entityType = formatEntityType(decodePathSegment(child));
    return `${entityType}${TITLE_SEPARATOR}${siteName}`;
  }

  if (root === "schemas" && child) {
    const entityType = formatEntityType(decodePathSegment(child));
    return `Schema: ${entityType}${TITLE_SEPARATOR}${siteName}`;
  }

  if (root === "sources" && child) {
    return `Source details${TITLE_SEPARATOR}${siteName}`;
  }

  if (root === "relationships" && child) {
    return `Relationship details${TITLE_SEPARATOR}${siteName}`;
  }

  if (root === "design-system") {
    if (!child) {
      return `Design system${TITLE_SEPARATOR}${siteName}`;
    }
    const section = DESIGN_SYSTEM_SECTIONS.find((item) => item.id === child);
    const label = section?.label ?? "Design system";
    return `Design system: ${label}${TITLE_SEPARATOR}${siteName}`;
  }

  if (root === "mcp" && child) {
    return `MCP ${formatPathTitle(child)}${TITLE_SEPARATOR}${siteName}`;
  }

  if (root === "docs") {
    return `Documentation${TITLE_SEPARATOR}${siteName}`;
  }

  if (root === "oauth" && child === "consent") {
    return `OAuth consent${TITLE_SEPARATOR}${siteName}`;
  }

  if (root === "auth" && child === "callback") {
    return `Auth callback${TITLE_SEPARATOR}${siteName}`;
  }

  if (routeNames[root]) {
    return `${routeNames[root]}${TITLE_SEPARATOR}${siteName}`;
  }

  return `${formatPathTitle(root)}${TITLE_SEPARATOR}${siteName}`;
}

function PageContentFade({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [contentVisible, setContentVisible] = useState(false);

  useEffect(() => {
    setContentVisible(false);
    const t = setTimeout(() => setContentVisible(true), PAGE_FADE_DELAY_MS);
    return () => clearTimeout(t);
  }, [location.pathname]);

  return (
    <div
      className={`transition-opacity ease-in ${contentVisible ? "opacity-100" : "opacity-0"}`}
      style={{ transitionDuration: `${PAGE_FADE_DURATION_MS}ms` }}
    >
      {children}
    </div>
  );
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
  const [dynamicEntityType, setDynamicEntityType] = useState<string | null>(null);
  const [dynamicEntityName, setDynamicEntityName] = useState<string | null>(null);

  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { sessionToken } = useAuth();
  const bearerToken = sessionToken || keysBearerToken || settings.bearerToken;
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
    } else if (location.pathname.startsWith("/entity/")) {
      const entityId = location.pathname.split("/")[2];
      if (!entityId) {
        setDynamicLabel(null);
        setDynamicEntityType(null);
        setDynamicEntityName(null);
        return;
      }
      // Fetch entity type for entity detail pages (label + link to entities list by type)
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

          const entityResponse = await fetch(`/api/entities/${entityId}`, { headers });
          if (entityResponse.ok) {
            const entityData = await entityResponse.json();
            if (entityData.entity_type) {
              setDynamicLabel(formatEntityType(entityData.entity_type));
              setDynamicEntityType(entityData.entity_type);
            }
            const displayName = getEntityDisplayName({
              entity_type: entityData.entity_type ?? "",
              canonical_name: entityData.canonical_name ?? "",
              snapshot: entityData.snapshot,
              entity_id: entityData.entity_id ?? entityData.id,
            });
            setDynamicEntityName(displayName);
          }
        } catch (error) {
          console.error("Failed to fetch entity for breadcrumb:", error);
        }
      }
      fetchEntityType();
    } else {
      setDynamicLabel(null);
      setDynamicEntityType(null);
      setDynamicEntityName(null);
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

  useEffect(() => {
    document.title = buildDocumentTitle({
      pathname: location.pathname,
      siteName,
      routeNames,
      dynamicEntityName,
      dynamicEntityType,
    });
  }, [location.pathname, siteName, routeNames, dynamicEntityName, dynamicEntityType]);

  // Generate breadcrumb items from pathname
  const getBreadcrumbs = () => {
    const pathnames = location.pathname.split("/").filter((x) => x);
    const breadcrumbs: Array<{ 
      label: string; 
      href: string; 
      isLast?: boolean;
      hasDropdown?: boolean;
      dropdownItems?: Array<{ label: string; href: string }>;
    }> = [];

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

    // Segment looks like entity type (e.g. task, invoice) not entity id (ent_..., uuid)
    const isEntityTypeSegment = (seg: string) =>
      !seg.startsWith("ent_") &&
      seg.length < 50 &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg);

    const isEntityIdSegment = (seg: string) =>
      seg.startsWith("ent_") || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg);

    // Build breadcrumbs from path segments
    let currentPath = "";
    pathnames.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const isLast = index === pathnames.length - 1;
      const prevSegment = index > 0 ? pathnames[index - 1] : null;
      const nextSegment = index + 1 < pathnames.length ? pathnames[index + 1] : null;

      // /entities/:type shows "Home > Tasks" (no "Entities" segment)
      if (segment === "entities" && nextSegment && isEntityTypeSegment(nextSegment)) {
        return;
      }
      if (prevSegment === "entities" && isEntityTypeSegment(segment)) {
        breadcrumbs.push({
          label: formatEntityType(segment),
          href: currentPath,
          isLast,
        });
        return;
      }

      // /entity/:id shows "Home > Tasks > My task" (plural type + entity name; never show raw id)
      if (segment === "entity" && nextSegment && isEntityIdSegment(nextSegment)) {
        const typeLabel = dynamicLabel || (dynamicEntityType ? formatEntityType(dynamicEntityType) : null) || "Entity";
        const typeHref = dynamicEntityType ? `/entities/${encodeURIComponent(dynamicEntityType)}` : currentPath;
        breadcrumbs.push({
          label: typeLabel,
          href: typeHref,
          isLast: false,
        });
        breadcrumbs.push({
          label: dynamicEntityName || "…",
          href: currentPath,
          isLast: true,
        });
        return;
      }
      if (prevSegment === "entity" && isEntityIdSegment(segment)) {
        return;
      }

      // Check if current segment is a design system sub-page
      const isDesignSystemSubPageSegment = DESIGN_SYSTEM_SECTIONS.some(s => s.id === segment);
      const isOnDesignSystemSubPage = isDesignSystemSubPageSegment && prevSegment === "design-system";

      // Use custom label function if provided
      let label: string;
      if (routeNames[segment]) {
        label = routeNames[segment];
      } else if (isDesignSystemSubPageSegment) {
        const section = DESIGN_SYSTEM_SECTIONS.find(s => s.id === segment);
        label = section ? section.label : segment;
      } else {
        if (segment.startsWith("ent_") && segment.length > 20) {
          label = `${segment.substring(0, 20)}...`;
        } else {
          label = segment
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
        }
      }

      const entityListHref =
        segment === "entity" && dynamicEntityType
          ? `/entities/${encodeURIComponent(dynamicEntityType)}`
          : currentPath;

      if (isOnDesignSystemSubPage) {
        breadcrumbs.push({
          label,
          href: currentPath,
          isLast,
          hasDropdown: true,
          dropdownItems: DESIGN_SYSTEM_SECTIONS.map(section => ({
            label: section.label,
            href: `/design-system/${section.id}`,
          })),
        });
      } else {
        breadcrumbs.push({
          label,
          href: entityListHref,
          isLast,
        });
      }
    });

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();
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
        <PageContentFade>
          <PageHeader breadcrumbs={breadcrumbs} />
          <main
            className={cn(
              "min-h-screen px-4 pt-6 pb-4 md:px-6 md:pt-8 md:pb-6 min-w-0 max-w-full overflow-x-hidden"
            )}
          >
            {children}
          </main>
        </PageContentFade>
      </SidebarInset>
    </SidebarProvider>
  );
}

/**
 * Page header component that conditionally shows sidebar trigger
 */
interface PageHeaderProps {
  breadcrumbs: Array<{ 
    label: string; 
    href: string; 
    isLast?: boolean;
    hasDropdown?: boolean;
    dropdownItems?: Array<{ label: string; href: string }>;
  }>;
}

function PageHeader({ breadcrumbs }: PageHeaderProps) {
  const { isMobile } = useSidebar();
  const location = useLocation();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 min-w-0 max-w-full overflow-x-hidden">
      {isMobile && <SidebarTrigger className="md:hidden" />}
      <Breadcrumb className="min-w-0 flex-1 overflow-hidden max-w-full">
        <BreadcrumbList className="flex-nowrap min-w-0 max-w-full">
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={`${crumb.href}-${index}`}>
              <BreadcrumbItem
                className={cn(
                  "min-w-0",
                  index === breadcrumbs.length - 1 ? "flex-1 min-w-0" : "shrink-0"
                )}
              >
                {crumb.hasDropdown && crumb.dropdownItems ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <BreadcrumbLink asChild>
                        <Link 
                          to={crumb.href} 
                          className="truncate whitespace-nowrap flex items-center gap-1"
                        >
                          {crumb.label}
                          <ChevronDown className="h-3 w-3" />
                        </Link>
                      </BreadcrumbLink>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {crumb.dropdownItems.map((item) => (
                        <DropdownMenuItem key={item.href} asChild>
                          <Link 
                            to={item.href}
                            className={cn(
                              "w-full cursor-pointer",
                              location.pathname === item.href && "bg-accent"
                            )}
                          >
                            {item.label}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : crumb.isLast ? (
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
      <RealtimeStatusIndicator />
    </header>
  );
}
