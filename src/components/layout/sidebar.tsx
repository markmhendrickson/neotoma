import { Fragment, useEffect, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Home,
  BarChart3,
  Box,
  Eye,
  FileText,
  GitBranch,
  Network,
  Database,
  Clock,
  Activity,
  Repeat,
  MessageSquare,
  MessageSquareText,
  Cpu,
  ShieldCheck,
  Shield,
  Bell,
  RefreshCw,
  KeyRound,
  Settings,
  Loader2,
  Search,
  PanelLeft,
  PanelLeftClose,
  ChevronRight,
  Layers,
  BookOpen,
  PenLine,
  type LucideIcon,
} from "lucide-react";
import neotomaWordmarkUrl from "@/assets/neotoma_wordmark.svg?url";
import { SidebarExternalLinks } from "@/components/layout/sidebar_external_links";
import { SidebarUserFooter } from "@/components/layout/sidebar_user_footer";
import { PinnedPrimitivesSidebar } from "@/components/layout/pinned_primitives_sidebar";
import { useResizableWidth } from "@/hooks/use_resizable_width";
import { buildSearchLocation, isSearchPath } from "@/lib/search_route";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "inspector_sidebar_collapsed";
const SIDEBAR_MORE_EXPANDED_STORAGE_KEY = "inspector_sidebar_more_expanded";
const SIDEBAR_WIDTH_STORAGE_KEY = "inspector_sidebar_width";
const SIDEBAR_COLLAPSED_WIDTH_PX = 64;
const SIDEBAR_DEFAULT_WIDTH_PX = 256;
const SIDEBAR_MIN_WIDTH_PX = 200;
const SIDEBAR_MAX_WIDTH_PX = 480;

type NavItem = { to: string; label: string; icon: LucideIcon };

const navGroups: Array<{ items: NavItem[] }> = [
  {
    items: [
      { to: "/", label: "Home", icon: Home },
      { to: "/conversations", label: "Conversations", icon: MessageSquareText },
      { to: "/activity", label: "Activity", icon: Activity },
      { to: "/issues", label: "Issues", icon: MessageSquare },
    ],
  },
  {
    items: [
      { to: "/entities", label: "Entities", icon: Box },
      { to: "/entity-types", label: "Entity types", icon: Layers },
      { to: "/observations", label: "Observations", icon: Eye },
      { to: "/sources", label: "Sources", icon: FileText },
      { to: "/relationships", label: "Relationships", icon: GitBranch },
      { to: "/graph", label: "Graph Explorer", icon: Network },
      { to: "/timeline", label: "Timeline", icon: Clock },
    ],
  },
];

const moreNavItems: NavItem[] = [
  { to: "/turns", label: "Turns", icon: Repeat },
  { to: "/compliance", label: "Compliance", icon: ShieldCheck },
  { to: "/schemas", label: "Schemas", icon: Database },
  { to: "/interpretations", label: "Interpretations", icon: Cpu },
  { to: "/subscriptions", label: "Subscriptions", icon: Bell },
  { to: "/peers", label: "Peers", icon: RefreshCw },
  { to: "/agents", label: "Agents", icon: ShieldCheck },
  { to: "/agents/grants", label: "Agent grants", icon: KeyRound },
  { to: "/access-policies", label: "Access Policies", icon: Shield },
];

const documentationNavItems: NavItem[] = [{ to: "/docs", label: "Documentation", icon: BookOpen }];

const analyticsNavItems: NavItem[] = [{ to: "/analytics", label: "Analytics", icon: BarChart3 }];

const settingsNavItems: NavItem[] = [{ to: "/settings", label: "Settings", icon: Settings }];

function entityIdFromInspectorPath(pathname: string): string | null {
  const match = pathname.match(/^\/entities\/([^/]+)(?:\/|$)/);
  if (!match) return null;
  const encodedId = match[1];
  if (!encodedId) return null;
  const id = decodeURIComponent(encodedId);
  if (id === "correct") return null;
  return id;
}

function LoadingIndicator({ active, label }: { active: boolean; label: string }) {
  if (!active) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70"
          aria-label={label}
          aria-live="polite"
          role="status"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({ routeLoading = false }: { routeLoading?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const activeFetchCount = useIsFetching();
  const [sidebar_collapsed, set_sidebar_collapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  });
  const [more_section_expanded, set_more_section_expanded] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = window.localStorage.getItem(SIDEBAR_MORE_EXPANDED_STORAGE_KEY);
    if (stored !== null) return stored === "true";
    return false;
  });

  const {
    width: sidebar_width_px,
    isResizing: sidebar_is_resizing,
    onResizePointerDown: on_sidebar_resize_pointer_down,
    setWidth: set_sidebar_width_px,
  } = useResizableWidth({
    storageKey: SIDEBAR_WIDTH_STORAGE_KEY,
    defaultWidth: SIDEBAR_DEFAULT_WIDTH_PX,
    minWidth: SIDEBAR_MIN_WIDTH_PX,
    maxWidth: SIDEBAR_MAX_WIDTH_PX,
    disabled: sidebar_collapsed,
  });

  useEffect(() => {
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      sidebar_collapsed ? "true" : "false"
    );
  }, [sidebar_collapsed]);

  useEffect(() => {
    window.localStorage.setItem(
      SIDEBAR_MORE_EXPANDED_STORAGE_KEY,
      more_section_expanded ? "true" : "false"
    );
  }, [more_section_expanded]);

  // Longest-prefix match across all nav items so nested entries (e.g.
  // `/agents/grants` under `/agents`) don't double-highlight their parent.
  const allNavTargets = [
    ...navGroups.flatMap((g) => g.items.map((i) => i.to)),
    ...moreNavItems.map((i) => i.to),
    ...documentationNavItems.map((i) => i.to),
    ...analyticsNavItems.map((i) => i.to),
    ...settingsNavItems.map((i) => i.to),
  ];

  const correctEntityId = entityIdFromInspectorPath(location.pathname);
  const correctNavTo = correctEntityId
    ? `/entities/${encodeURIComponent(correctEntityId)}/correct`
    : "/entities";
  const correctNavItem: NavItem = { to: correctNavTo, label: "Correct", icon: PenLine };
  const correctNavActive = Boolean(
    correctEntityId &&
    location.pathname === `/entities/${encodeURIComponent(correctEntityId)}/correct`
  );

  function isActive(to: string) {
    if (to === "/") return location.pathname === "/";
    if (to === "/entity-types") return location.pathname === "/entity-types";
    if (!location.pathname.startsWith(to)) return false;
    const longerMatch = allNavTargets.find(
      (other) => other !== to && other.startsWith(to) && location.pathname.startsWith(other)
    );
    return !longerMatch;
  }

  const moreSectionHasActiveRoute =
    correctNavActive || moreNavItems.some((item) => isActive(item.to));

  useEffect(() => {
    if (moreSectionHasActiveRoute) {
      set_more_section_expanded(true);
    }
  }, [moreSectionHasActiveRoute, location.pathname]);

  const show_more_nav_items = sidebar_collapsed || more_section_expanded;

  function navigateToSearchResults(query: string) {
    const { pathname, search } = buildSearchLocation({
      query,
      searchParams: new URLSearchParams(location.search),
    });
    navigate({ pathname, search });
  }

  function renderNavItem(item: NavItem, activeOverride?: boolean) {
    const Icon = item.icon;
    const active = activeOverride ?? isActive(item.to);
    const link = (
      <Link
        to={item.to}
        className={cn(
          "flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors",
          sidebar_collapsed ? "justify-center px-0" : "px-3",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!sidebar_collapsed ? item.label : null}
      </Link>
    );
    if (sidebar_collapsed) {
      return (
        <Tooltip key={item.to}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      );
    }
    return <Fragment key={item.to}>{link}</Fragment>;
  }

  const sidebar_width_style = sidebar_collapsed ? SIDEBAR_COLLAPSED_WIDTH_PX : sidebar_width_px;
  const isPageLoading = routeLoading || activeFetchCount > 0;
  const pageLoadingLabel = routeLoading
    ? "Loading page"
    : activeFetchCount === 1
      ? "Loading 1 request"
      : `Loading ${activeFetchCount} requests`;

  return (
    <aside
      style={{ width: sidebar_width_style }}
      className={cn(
        "relative hidden shrink-0 flex-col overflow-hidden border-r bg-sidebar md:flex",
        sidebar_is_resizing ? "" : "transition-[width] duration-200 ease-linear"
      )}
    >
      <div className="flex h-14 min-h-14 w-full min-w-0 shrink-0 overflow-hidden border-b">
        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            style={{
              width: sidebar_collapsed ? SIDEBAR_DEFAULT_WIDTH_PX : sidebar_width_px,
            }}
            className="flex h-full items-center pl-6"
          >
            <Link
              to="/"
              aria-hidden={sidebar_collapsed}
              tabIndex={sidebar_collapsed ? -1 : undefined}
              className={cn(
                "flex min-w-0 items-center overflow-hidden",
                sidebar_collapsed && "pointer-events-none"
              )}
            >
              <img
                src={neotomaWordmarkUrl}
                alt="Neotoma"
                className="h-5 w-auto max-w-none shrink-0 object-contain object-left dark:invert"
              />
            </Link>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 self-center pr-3">
          <LoadingIndicator active={isPageLoading} label={pageLoadingLabel} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-sidebar-foreground"
            onClick={() => set_sidebar_collapsed((collapsed) => !collapsed)}
            aria-label={sidebar_collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebar_collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebar_collapsed ? (
              <PanelLeft className="size-4 shrink-0" aria-hidden />
            ) : (
              <PanelLeftClose className="size-4 shrink-0" aria-hidden />
            )}
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <nav className="flex min-w-0 w-full max-w-full flex-col gap-1 p-3">
          {sidebar_collapsed ? (
            <div className="mb-2 flex justify-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-9 w-9 text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      isSearchPath(location.pathname) &&
                        "bg-sidebar-accent text-sidebar-accent-foreground"
                    )}
                    onClick={() => navigateToSearchResults("")}
                    aria-label="Search Neotoma"
                  >
                    <Search className="h-4 w-4 shrink-0" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Search</TooltipContent>
              </Tooltip>
            </div>
          ) : null}
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <Separator className="my-2" />}
              {group.items.map((item) => (
                <Fragment key={item.to}>{renderNavItem(item)}</Fragment>
              ))}
              {gi === 0 ? <PinnedPrimitivesSidebar collapsed={sidebar_collapsed} /> : null}
            </div>
          ))}
          <Separator className="my-2" />
          {documentationNavItems.map((item) => renderNavItem(item))}
          {analyticsNavItems.map((item) => renderNavItem(item))}
          {settingsNavItems.map((item) => renderNavItem(item))}
          <Separator className="my-2" />
          <div>
            {!sidebar_collapsed ? (
              <button
                type="button"
                onClick={() => set_more_section_expanded((expanded) => !expanded)}
                className="flex w-full items-center gap-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/50 hover:text-sidebar-foreground"
                aria-expanded={more_section_expanded}
              >
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform",
                    more_section_expanded && "rotate-90"
                  )}
                  aria-hidden
                />
                More
              </button>
            ) : null}
            {show_more_nav_items ? (
              <>
                {renderNavItem(correctNavItem, correctNavActive)}
                {moreNavItems.map((item) => renderNavItem(item))}
              </>
            ) : null}
          </div>
        </nav>
      </ScrollArea>
      <SidebarExternalLinks collapsed={sidebar_collapsed} />
      <SidebarUserFooter collapsed={sidebar_collapsed} />
      {!sidebar_collapsed ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={SIDEBAR_MIN_WIDTH_PX}
          aria-valuemax={SIDEBAR_MAX_WIDTH_PX}
          aria-valuenow={sidebar_width_px}
          tabIndex={0}
          onPointerDown={on_sidebar_resize_pointer_down}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const delta = event.key === "ArrowLeft" ? -16 : 16;
            set_sidebar_width_px(sidebar_width_px + delta);
          }}
          className={cn(
            "absolute inset-y-0 right-0 z-10 w-1 cursor-col-resize touch-none",
            "after:absolute after:inset-y-0 after:-right-1 after:w-2",
            "hover:bg-sidebar-border/80 focus-visible:bg-sidebar-border focus-visible:outline-none",
            sidebar_is_resizing && "bg-sidebar-border"
          )}
        />
      ) : null}
    </aside>
  );
}
