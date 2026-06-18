import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, MoreVertical, Search, X } from "lucide-react";
import { Link, matchPath, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import neotomaWordmarkUrl from "@/assets/neotoma_wordmark.svg?url";
import { HeaderSearch } from "./header_search";
import { MobileNavDrawer } from "./mobile_nav_drawer";
import {
  useCurrentHeaderActions,
  useCurrentHeaderMeta,
  useCurrentHeaderSearch,
  useCurrentPageTitle,
} from "./page_title_context";

type BreadcrumbRoute = {
  path: string;
  title: string;
};

const breadcrumbRoutes: BreadcrumbRoute[] = [
  { path: "/", title: "Home" },
  { path: "/docs", title: "Documentation" },
  { path: "/docs/*", title: "Documentation" },
  { path: "/analytics", title: "Analytics" },
  { path: "/search", title: "Search" },
  { path: "/entity-types", title: "Entity types" },
  { path: "/entities", title: "Entities" },
  { path: "/entities/:id", title: "Entity" },
  { path: "/observations", title: "Observations" },
  { path: "/sources", title: "Sources" },
  { path: "/sources/:id", title: "Source" },
  { path: "/relationships", title: "Relationships" },
  { path: "/relationships/:key", title: "Relationship" },
  { path: "/graph", title: "Graph Explorer" },
  { path: "/schemas", title: "Schemas" },
  { path: "/schemas/:entityType", title: "Schema" },
  { path: "/activity", title: "Activity" },
  { path: "/issues", title: "Issues" },
  { path: "/issues/:number", title: "Issue" },
  { path: "/conversations", title: "Conversations" },
  { path: "/conversations/:conversationId", title: "Conversation" },
  { path: "/turns", title: "Turns" },
  { path: "/turns/:turnKey", title: "Turn" },
  { path: "/entities/:segment/history", title: "Entity history" },
  { path: "/timeline", title: "Timeline" },
  { path: "/timeline/:id", title: "Timeline event" },
  { path: "/interpretations", title: "Interpretations" },
  { path: "/agents", title: "Agents" },
  { path: "/agents/grants", title: "Agent Grants" },
  { path: "/agents/grants/:id", title: "Agent Grant" },
  { path: "/agents/:key", title: "Agent" },
  { path: "/design", title: "Design" },
  { path: "/settings", title: "Settings" },
  { path: "/sandbox", title: "Sandbox" },
  { path: "/access-policies", title: "Access Policies" },
  { path: "/subscriptions", title: "Subscriptions" },
  { path: "/peers", title: "Peers" },
  { path: "/peers/:peerId", title: "Peer" },
  { path: "/compliance", title: "Compliance" },
];

type BreadcrumbItem = {
  href: string;
  title: string;
};

function routeTitleForPath(pathname: string): string {
  if (pathname === "/search" || pathname.startsWith("/search/")) {
    return "Search";
  }
  return (
    breadcrumbRoutes.find((route) =>
      matchPath({ path: route.path, end: true }, pathname),
    )?.title ?? "Neotoma"
  );
}

function buildBreadcrumbs(pathname: string, pageTitle: string | null): BreadcrumbItem[] {
  if (pathname === "/") {
    if (!pageTitle) {
      return [];
    }
    return [{ href: "/", title: pageTitle }];
  }

  const segments = pathname.split("/").filter(Boolean);
  const crumbs: BreadcrumbItem[] = [{ href: "/", title: routeTitleForPath("/") }];

  for (let i = 0; i < segments.length; i += 1) {
    const href = `/${segments.slice(0, i + 1).join("/")}`;
    crumbs.push({ href, title: routeTitleForPath(href) });
  }

  if (pageTitle) {
    const currentCrumb = crumbs[crumbs.length - 1];
    if (currentCrumb) {
      crumbs[crumbs.length - 1] = {
        ...currentCrumb,
        title: pageTitle,
      };
    }
  }

  return crumbs;
}

function MobileBreadcrumbMenu({ breadcrumbs }: { breadcrumbs: BreadcrumbItem[] }) {
  const currentCrumb = breadcrumbs[breadcrumbs.length - 1];

  if (!currentCrumb) {
    return <span className="min-h-10" aria-hidden="true" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-10 min-w-0 max-w-full justify-start gap-1 px-2 text-left"
          aria-label={`Open breadcrumb menu, current page: ${currentCrumb.title}`}
        >
          <span className="truncate text-sm font-medium text-foreground">{currentCrumb.title}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(18rem,calc(100vw-2rem))]">
        {breadcrumbs.map((crumb, index) => {
          const isCurrent = index === breadcrumbs.length - 1;

          if (isCurrent) {
            return (
              <DropdownMenuItem
                key={crumb.href}
                disabled
                aria-current="page"
                className="bg-accent font-medium text-accent-foreground opacity-100"
              >
                <span className="truncate">{crumb.title}</span>
              </DropdownMenuItem>
            );
          }

          return (
            <DropdownMenuItem key={crumb.href} asChild>
              <Link to={crumb.href} className="min-w-0">
                <span className="truncate">{crumb.title}</span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header() {
  const location = useLocation();
  const pageTitle = useCurrentPageTitle();
  const headerMeta = useCurrentHeaderMeta();
  const headerActions = useCurrentHeaderActions();
  const headerSearch = useCurrentHeaderSearch();
  const breadcrumbs = buildBreadcrumbs(location.pathname, pageTitle);
  const currentCrumb = breadcrumbs[breadcrumbs.length - 1];
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Close the mobile search overlay whenever the route changes so a tap
  // on a suggestion doesn't leave a stale overlay covering the new page.
  useEffect(() => {
    setMobileSearchOpen(false);
  }, [location.pathname, location.search]);

  return (
    <header className="relative flex h-14 min-h-14 shrink-0 items-center justify-between border-b bg-background px-4 md:px-6">
      <MobileNavDrawer />
      <Link
        to="/"
        aria-label="Neotoma home"
        className="ml-1 mr-3 flex shrink-0 items-center md:hidden"
      >
        <img
          src={neotomaWordmarkUrl}
          alt="Neotoma"
          className="h-5 w-auto max-w-none shrink-0 object-contain object-left dark:brightness-0 dark:invert"
        />
      </Link>
      <nav
        aria-label="Breadcrumb"
        className={cn(
          "flex min-w-0 flex-1 items-center text-sm",
          breadcrumbs.length === 0 && "min-h-5",
        )}
      >
        {currentCrumb ? <h1 className="sr-only md:hidden">{currentCrumb.title}</h1> : null}
        <div className="flex min-w-0 md:hidden">
          <MobileBreadcrumbMenu breadcrumbs={breadcrumbs} />
        </div>
        <div className="hidden min-w-0 items-center gap-1 md:flex">
          {breadcrumbs.map((crumb, index) => {
            const isCurrent = index === breadcrumbs.length - 1;

            return (
              <div key={crumb.href} className="flex min-w-0 items-center gap-1">
                {index > 0 ? (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                ) : null}
                {isCurrent ? (
                  <h1 className="truncate text-sm font-medium text-foreground" aria-current="page">
                    {crumb.title}
                  </h1>
                ) : (
                  <Link
                    to={crumb.href}
                    className={cn(
                      "truncate text-muted-foreground transition-colors hover:text-foreground",
                      index === 0 && "shrink-0",
                    )}
                  >
                    {crumb.title}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </nav>
      <div className="ml-2 flex shrink-0 items-center gap-2 md:ml-4 md:gap-3">
        {/* Desktop: always-visible expanding search */}
        <div className="hidden md:block">
          <HeaderSearch pageSearch={headerSearch} />
        </div>
        {/* Mobile: icon-trigger that reveals a full-width search row below the header */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 md:hidden"
          aria-label={mobileSearchOpen ? "Close search" : "Open search"}
          aria-expanded={mobileSearchOpen}
          onClick={() => setMobileSearchOpen((open) => !open)}
        >
          {mobileSearchOpen ? (
            <X className="h-5 w-5" aria-hidden />
          ) : (
            <Search className="h-5 w-5" aria-hidden />
          )}
        </Button>
        {headerMeta ? (
          <span className="hidden text-sm tabular-nums text-muted-foreground md:inline">
            {headerMeta}
          </span>
        ) : null}
        {headerActions ? (
          <>
            <div className="hidden items-center gap-2 md:flex">{headerActions}</div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="More actions"
                  className="h-10 w-10 md:hidden"
                >
                  <MoreVertical className="h-5 w-5" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="flex w-[min(18rem,calc(100vw-2rem))] flex-col gap-2 p-3"
              >
                {headerMeta ? (
                  <span className="text-xs tabular-nums text-muted-foreground">{headerMeta}</span>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">{headerActions}</div>
              </PopoverContent>
            </Popover>
          </>
        ) : null}
      </div>
      {mobileSearchOpen ? (
        <div className="absolute inset-x-0 top-full z-40 flex items-center gap-2 border-b bg-background px-4 py-2 shadow-sm md:hidden">
          <div className="flex-1">
            <HeaderSearch
              pageSearch={headerSearch}
              fullWidth
              autoFocus
              onSubmitComplete={() => setMobileSearchOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </header>
  );
}
