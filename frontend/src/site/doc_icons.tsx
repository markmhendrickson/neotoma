import React from "react";
import {
  Bookmark,
  BookOpen,
  Bot,
  Boxes,
  Briefcase,
  Building2,
  Bug,
  Code,
  Container,
  Cpu,
  Database,
  Github,
  Globe,
  History,
  Home,
  Layers,
  MessageCircle,
  MessageSquare,
  Monitor,
  Package,
  PanelRight,
  Play,
  Rocket,
  SatelliteDish,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SiClaude, SiOpenai } from "react-icons/si";
import { CursorIcon } from "@/components/icons/CursorIcon";
import { OpenClawIcon } from "@/components/icons/OpenClawIcon";
import { DOC_NAV_CATEGORIES } from "@/site/site_data";

/** Lucide icons for doc nav items by icon name (matches sidebar). */
export const DOC_NAV_ICONS: Record<string, LucideIcon> = {
  Bookmark,
  BookOpen,
  Bot,
  Boxes,
  Briefcase,
  Building2,
  Bug,
  Code,
  Container,
  Cpu,
  Database,
  Github,
  Globe,
  History,
  Home,
  Layers,
  MessageCircle,
  MessageSquare,
  Monitor,
  Package,
  PanelRight,
  Play,
  Rocket,
  SatelliteDish,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Zap,
};

/** Brand icons for integration doc pages (by canonical href). Same as sidebar. */
export const INTEGRATION_BRAND_ICONS: Record<
  string,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean; size?: number }>
> = {
  "/neotoma-with-claude-code": SiClaude,
  "/neotoma-with-claude": SiClaude,
  "/neotoma-with-chatgpt": SiOpenai,
  "/neotoma-with-codex": SiOpenai,
  "/neotoma-with-cursor": CursorIcon,
  "/neotoma-with-openclaw": OpenClawIcon,
};

export type DocPageIconProps = { className?: string; "aria-hidden"?: boolean };

/**
 * Returns the same icon component used in the docs sidebar for the given
 * canonical path (locale and hash stripped). Use for page titles.
 */
export function getDocPageIcon(
  canonicalPath: string,
): React.ComponentType<DocPageIconProps> | null {
  const pathWithoutHash = (canonicalPath.split("#")[0] || "/").replace(/\/$/, "") || "/";
  const brand = INTEGRATION_BRAND_ICONS[pathWithoutHash];
  if (brand) return brand as React.ComponentType<DocPageIconProps>;

  const norm = (p: string) => (p.replace(/\/$/, "") || "/");
  for (const cat of DOC_NAV_CATEGORIES) {
    const item = cat.items.find(
      (i) => i.href.startsWith("/") && norm(i.href) === pathWithoutHash,
    );
    if (item) {
      const iconName = item.icon ?? "BookOpen";
      return (DOC_NAV_ICONS[iconName] as React.ComponentType<DocPageIconProps>) ?? null;
    }
  }
  return null;
}
