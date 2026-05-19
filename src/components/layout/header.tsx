import { ChevronRight } from "lucide-react";
import { Link, matchPath, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";
import { HeaderSearch } from "./header_search";
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
  { path: "/timeline", title: "Timeline" },
  { path: "/timeline/:id", title: "Timeline Event" },
  { path: "/interpretations", title: "Interpretations" },
  { path: "/agents", title: "Agents" },
  { path: "/agents/grants", title: "Agent Grants" },
  { path: "/agents/grants/:id", title: "Agent Grant" },
  { path: "/agents/:key", title: "Agent" },
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
    )?.title ?? "Inspector"
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

export function Header() {
  const location = useLocation();
  const pageTitle = useCurrentPageTitle();
  const headerMeta = useCurrentHeaderMeta();
  const headerActions = useCurrentHeaderActions();
  const headerSearch = useCurrentHeaderSearch();
  const breadcrumbs = buildBreadcrumbs(location.pathname, pageTitle);

  return (
    <header className="flex h-14 min-h-14 shrink-0 items-center justify-between border-b bg-background px-6">
      <nav
        aria-label="Breadcrumb"
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1 text-sm",
          breadcrumbs.length === 0 && "min-h-5",
        )}
      >
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
      </nav>
      <div className="ml-4 flex shrink-0 items-center gap-3">
        <HeaderSearch pageSearch={headerSearch} />
        {headerMeta || headerActions ? (
          <>
            {headerMeta ? (
              <span className="text-sm tabular-nums text-muted-foreground">{headerMeta}</span>
            ) : null}
            {headerActions ? <div className="flex items-center gap-2">{headerActions}</div> : null}
          </>
        ) : null}
      </div>
    </header>
  );
}
