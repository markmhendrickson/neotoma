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
  Layers,
  BookOpen,
  PenLine,
  Palette,
  type LucideIcon,
} from "lucide-react";

/** Single navigation entry shared between the desktop sidebar and the mobile nav drawer. */
export type SidebarNavItem = { to: string; label: string; icon: LucideIcon };

/** Primary nav groups rendered at the top of the sidebar (in order). */
export const SIDEBAR_NAV_GROUPS: Array<{ items: SidebarNavItem[] }> = [
  {
    items: [
      { to: "/", label: "Home", icon: Home },
      { to: "/conversations", label: "Conversations", icon: MessageSquareText },
      { to: "/activity", label: "Activity", icon: Activity },
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

/** Items grouped under the "More" collapse section. */
export const SIDEBAR_MORE_NAV_ITEMS: SidebarNavItem[] = [
  { to: "/issues", label: "Issues", icon: MessageSquare },
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

export const SIDEBAR_DOCUMENTATION_NAV_ITEMS: SidebarNavItem[] = [
  { to: "/docs", label: "Documentation", icon: BookOpen },
];

export const SIDEBAR_ANALYTICS_NAV_ITEMS: SidebarNavItem[] = [
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

export const SIDEBAR_SETTINGS_NAV_ITEMS: SidebarNavItem[] = [
  { to: "/settings", label: "Settings", icon: Settings },
];

export const SIDEBAR_DESIGN_SYSTEM_NAV_ITEM: SidebarNavItem = {
  to: "/design",
  label: "Design system",
  icon: Palette,
};

/** Resolves the entity id implied by the current location pathname (for the "Correct" shortcut). */
export function entityIdFromInspectorPath(pathname: string): string | null {
  const match = pathname.match(/^\/entities\/([^/]+)(?:\/|$)/);
  if (!match) return null;
  const encodedId = match[1];
  if (!encodedId) return null;
  const id = decodeURIComponent(encodedId);
  if (id === "correct") return null;
  return id;
}

/** Builds the "Correct" nav item for the currently selected entity, when applicable. */
export function buildCorrectNavItem(pathname: string): {
  item: SidebarNavItem;
  isActive: boolean;
  entityId: string | null;
} {
  const correctEntityId = entityIdFromInspectorPath(pathname);
  const correctNavTo = correctEntityId
    ? `/entities/${encodeURIComponent(correctEntityId)}/correct`
    : "/entities";
  return {
    item: { to: correctNavTo, label: "Correct", icon: PenLine },
    isActive: Boolean(
      correctEntityId &&
        pathname === `/entities/${encodeURIComponent(correctEntityId)}/correct`,
    ),
    entityId: correctEntityId,
  };
}

/** All static nav targets (used for longest-prefix active-route matching). */
export function allSidebarNavTargets(): string[] {
  return [
    ...SIDEBAR_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.to)),
    ...SIDEBAR_MORE_NAV_ITEMS.map((i) => i.to),
    ...SIDEBAR_DOCUMENTATION_NAV_ITEMS.map((i) => i.to),
    ...SIDEBAR_ANALYTICS_NAV_ITEMS.map((i) => i.to),
    ...SIDEBAR_SETTINGS_NAV_ITEMS.map((i) => i.to),
    SIDEBAR_DESIGN_SYSTEM_NAV_ITEM.to,
  ];
}

/**
 * Active-route matching that mirrors the sidebar's longest-prefix logic so
 * nested entries (e.g. `/agents/grants` under `/agents`) don't double-highlight.
 */
export function isNavTargetActive(
  to: string,
  pathname: string,
  allTargets: string[] = allSidebarNavTargets(),
): boolean {
  if (to === "/") return pathname === "/";
  if (to === "/entity-types") return pathname === "/entity-types";
  if (!pathname.startsWith(to)) return false;
  const longerMatch = allTargets.find(
    (other) => other !== to && other.startsWith(to) && pathname.startsWith(other),
  );
  return !longerMatch;
}
