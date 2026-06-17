import { Fragment, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { PinnedPrimitivesSidebar } from "./pinned_primitives_sidebar";
import { SidebarExternalLinks } from "./sidebar_external_links";
import { SidebarUserFooter } from "./sidebar_user_footer";
import {
  allSidebarNavTargets,
  buildCorrectNavItem,
  isNavTargetActive,
  SIDEBAR_ANALYTICS_NAV_ITEMS,
  SIDEBAR_DESIGN_SYSTEM_NAV_ITEM,
  SIDEBAR_DOCUMENTATION_NAV_ITEMS,
  SIDEBAR_MORE_NAV_ITEMS,
  SIDEBAR_NAV_GROUPS,
  SIDEBAR_SETTINGS_NAV_ITEMS,
  type SidebarNavItem,
} from "./sidebar_nav_data";

function MobileNavLink({
  item,
  active,
  onSelect,
}: {
  item: SidebarNavItem;
  active: boolean;
  onSelect: () => void;
}) {
  const { icon: Icon, label, to } = item;
  return (
    <Link
      to={to}
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  );
}

export function MobileNavDrawer() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [moreExpanded, setMoreExpanded] = useState(false);

  const allTargets = allSidebarNavTargets();
  const { item: correctNavItem, isActive: correctNavActive } = buildCorrectNavItem(
    location.pathname,
  );

  const moreSectionHasActiveRoute =
    correctNavActive ||
    isNavTargetActive(SIDEBAR_DESIGN_SYSTEM_NAV_ITEM.to, location.pathname, allTargets) ||
    SIDEBAR_MORE_NAV_ITEMS.some((item) =>
      isNavTargetActive(item.to, location.pathname, allTargets),
    );

  // Auto-expand "More" when navigating into an entry it owns, and reset
  // the open state on each navigation so the sheet closes on link clicks
  // even when Link doesn't trigger React Router's loader callbacks.
  useEffect(() => {
    if (moreSectionHasActiveRoute) {
      setMoreExpanded(true);
    }
  }, [moreSectionHasActiveRoute]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  function isActive(to: string) {
    return isNavTargetActive(to, location.pathname, allTargets);
  }

  const handleSelect = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          aria-expanded={open}
          className="h-10 w-10 shrink-0 md:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="flex w-[min(20rem,calc(100vw-3rem))] flex-col gap-0 bg-sidebar p-0 text-sidebar-foreground sm:max-w-sm"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <nav
          aria-label="Primary"
          className="flex-1 overflow-y-auto px-3 py-4"
        >
          {SIDEBAR_NAV_GROUPS.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <Separator className="my-2" />}
              {group.items.map((item) => (
                <Fragment key={item.to}>
                  <MobileNavLink
                    item={item}
                    active={isActive(item.to)}
                    onSelect={handleSelect}
                  />
                </Fragment>
              ))}
              {gi === 0 ? <PinnedPrimitivesSidebar collapsed={false} /> : null}
            </div>
          ))}
          <Separator className="my-2" />
          {SIDEBAR_DOCUMENTATION_NAV_ITEMS.map((item) => (
            <MobileNavLink
              key={item.to}
              item={item}
              active={isActive(item.to)}
              onSelect={handleSelect}
            />
          ))}
          {SIDEBAR_ANALYTICS_NAV_ITEMS.map((item) => (
            <MobileNavLink
              key={item.to}
              item={item}
              active={isActive(item.to)}
              onSelect={handleSelect}
            />
          ))}
          {SIDEBAR_SETTINGS_NAV_ITEMS.map((item) => (
            <MobileNavLink
              key={item.to}
              item={item}
              active={isActive(item.to)}
              onSelect={handleSelect}
            />
          ))}
          <Separator className="my-2" />
          <button
            type="button"
            onClick={() => setMoreExpanded((expanded) => !expanded)}
            className="flex w-full items-center gap-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/50 hover:text-sidebar-foreground"
            aria-expanded={moreExpanded}
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-transform",
                moreExpanded && "rotate-90",
              )}
              aria-hidden
            />
            More
          </button>
          {moreExpanded ? (
            <>
              <MobileNavLink
                item={correctNavItem}
                active={correctNavActive}
                onSelect={handleSelect}
              />
              <MobileNavLink
                item={SIDEBAR_DESIGN_SYSTEM_NAV_ITEM}
                active={isActive(SIDEBAR_DESIGN_SYSTEM_NAV_ITEM.to)}
                onSelect={handleSelect}
              />
              {SIDEBAR_MORE_NAV_ITEMS.map((item) => (
                <MobileNavLink
                  key={item.to}
                  item={item}
                  active={isActive(item.to)}
                  onSelect={handleSelect}
                />
              ))}
            </>
          ) : null}
        </nav>
        <div className="border-t border-sidebar-border">
          <SidebarExternalLinks collapsed={false} />
          <div className="px-3 pb-3 pt-1">
            <SidebarUserFooter collapsed={false} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
