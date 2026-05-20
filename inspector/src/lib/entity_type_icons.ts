import type { LucideIcon } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Box, File } from "lucide-react";

/** High-confidence entity_type → Lucide icon name (aligned with src/utils/lucide_icons.ts). */
const ENTITY_TYPE_ICON_MAP: Record<string, string> = {
  invoice: "FileText",
  receipt: "Receipt",
  transaction: "DollarSign",
  payment: "CreditCard",
  expense: "Wallet",
  income: "TrendingUp",
  task: "CheckSquare",
  project: "Briefcase",
  event: "Calendar",
  person: "User",
  contact: "Contact",
  company: "Building2",
  organization: "Building",
  team: "Users",
  location: "MapPin",
  place: "MapPin",
  document: "File",
  note: "FileText",
  file: "File",
  message: "MessageSquare",
  email_message: "Mail",
  issue: "Bug",
  conversation: "MessageSquare",
  conversation_message: "MessageCircle",
  plan: "ClipboardList",
};

function suggestedIconName(entityType: string): string | null {
  if (ENTITY_TYPE_ICON_MAP[entityType]) {
    return ENTITY_TYPE_ICON_MAP[entityType]!;
  }
  const type = entityType.toLowerCase();
  if (type.includes("payment") || type.includes("transaction")) return "DollarSign";
  if (type.includes("invoice") || type.includes("bill")) return "FileText";
  if (type.includes("receipt")) return "Receipt";
  if (type.includes("person") || type.includes("user") || type.includes("contact")) return "User";
  if (type.includes("company") || type.includes("organization")) return "Building2";
  if (type.includes("document") || type === "file" || /\bfile\b/.test(type)) return "File";
  if (type.includes("note")) return "FileText";
  if (type.includes("task")) return "CheckSquare";
  if (type.includes("plan")) return "ClipboardList";
  if (type.includes("event")) return "Calendar";
  return null;
}

export function lucideIconByName(iconName: string): LucideIcon | null {
  const Icon = (LucideIcons as Record<string, unknown>)[iconName];
  return Icon ? (Icon as LucideIcon) : null;
}

type SchemaIconMeta = {
  icon_type?: string;
  icon_name?: string;
};

/** Align with frontend/src/utils/schema_icons.ts for custom SVG schema icons. */
const SAFE_SVG_ICON_NAME_ALLOWLIST: Record<string, LucideIcon> = {
  custom: File,
  file: File,
};

function iconFromSchemaMetadata(metadata?: Record<string, unknown>): LucideIcon | null {
  const icon = metadata?.icon as SchemaIconMeta | undefined;
  if (!icon?.icon_name?.trim()) return null;
  if (icon.icon_type === "lucide") {
    return lucideIconByName(icon.icon_name);
  }
  if (icon.icon_type === "svg") {
    return SAFE_SVG_ICON_NAME_ALLOWLIST[icon.icon_name.toLowerCase()] ?? File;
  }
  return null;
}

/** Resolve a Lucide icon for an entity type (schema metadata wins, then heuristics). */
export function getIconForEntityType(
  entityType: string,
  schemaMetadata?: Record<string, unknown>,
): LucideIcon {
  const fromSchema = iconFromSchemaMetadata(schemaMetadata);
  if (fromSchema) return fromSchema;
  const suggested = suggestedIconName(entityType);
  if (suggested) {
    const Icon = lucideIconByName(suggested);
    if (Icon) return Icon;
  }
  return Box;
}
