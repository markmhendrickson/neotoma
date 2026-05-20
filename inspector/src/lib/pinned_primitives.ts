import type { LucideIcon } from "lucide-react";
import { Box, Clock, FileText, GitBranch, Layers, Network } from "lucide-react";
import {
  entityTypeListPath,
  isEntityIdSegment,
  parseEntityTypeFromListPath,
  pluralizeEntityTypeLabel,
} from "./entity_type_labels";
import {
  entityRelationshipSubpageHref,
  parseEntityRelationshipSubpageRoute,
} from "./entity_relationship_routes";
import type { SearchPrimitiveKind } from "@/lib/search_primitives";

/** Inspector primitive kinds that have a stable detail URL. */
export type PinnedPrimitiveKind =
  | "entity"
  | "entity_type"
  | "entity_relationships"
  | "source"
  | "relationship"
  | "timeline_event";

export type PinnedPrimitive = {
  /** Normalized pathname (e.g. `/entities/ent_abc`). */
  href: string;
  kind: PinnedPrimitiveKind;
  label: string;
  /**
   * Schema type for icon resolution on entity / entity_relationships pins.
   * For entity_relationships, this is the anchor entity's type (not the related slice type).
   */
  entity_type?: string;
  /** Human label for the related entity-type slice (entity_relationships pins). */
  related_entity_type?: string;
  subtitle?: string;
  pinned_at: string;
};

export const PINNED_PRIMITIVES_STORAGE_KEY = "inspector_pinned_primitives";
const MAX_PINS = 24;

export const PINNED_PRIMITIVE_KIND_META: Record<
  PinnedPrimitiveKind,
  { label: string; icon: LucideIcon; searchKind: SearchPrimitiveKind | null }
> = {
  entity: { label: "Entity", icon: Box, searchKind: "entities" },
  entity_type: { label: "Entity type", icon: Layers, searchKind: null },
  entity_relationships: { label: "Related entities", icon: Network, searchKind: null },
  source: { label: "Source", icon: FileText, searchKind: "sources" },
  relationship: { label: "Relationship", icon: GitBranch, searchKind: "relationships" },
  timeline_event: { label: "Timeline", icon: Clock, searchKind: "timeline_events" },
};

const PINNED_PRIMITIVE_KINDS = new Set<string>(Object.keys(PINNED_PRIMITIVE_KIND_META));

/** Stable href for an entities list filtered to one schema type. */
export function entityTypeFilterPinHref(entityType: string): string {
  return entityTypeListPath(entityType);
}

export function normalizePinHref(href: string): string {
  const path = href.startsWith("/") ? href : `/${href}`;
  const queryIndex = path.indexOf("?");
  if (queryIndex >= 0) {
    const pathname = path.slice(0, queryIndex) || "/";
    const params = new URLSearchParams(path.slice(queryIndex + 1));
    const type = params.get("type")?.trim();
    if (pathname === "/entities" && type) {
      const keys = [...params.keys()];
      if (keys.length === 1 && keys[0] === "type") {
        return entityTypeFilterPinHref(type);
      }
    }
    return pathname;
  }
  return path || "/";
}

export function coercePinnedPrimitives(value: unknown): PinnedPrimitive[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is PinnedPrimitive => {
      if (!row || typeof row !== "object") return false;
      const p = row as PinnedPrimitive;
      return (
        typeof p.href === "string" &&
        typeof p.kind === "string" &&
        PINNED_PRIMITIVE_KINDS.has(p.kind) &&
        typeof p.label === "string" &&
        typeof p.pinned_at === "string"
      );
    })
    .map((p) => ({
      ...p,
      href: normalizePinHref(p.href),
      entity_type: p.entity_type?.trim() || undefined,
      related_entity_type: p.related_entity_type?.trim() || undefined,
      subtitle: p.subtitle?.trim() || undefined,
    }));
}

/** Whether the current route matches a pinned sidebar target. */
export function isPinnedLocationActive(
  pin: PinnedPrimitive,
  pathname: string,
  search: string,
): boolean {
  if (pin.kind === "entity_relationships") {
    return pathname === normalizePinHref(pin.href);
  }
  if (pin.kind === "entity_type") {
    const type =
      pin.entity_type?.trim() ||
      parseEntityTypeFromListPath(normalizePinHref(pin.href)) ||
      undefined;
    if (!type) {
      return normalizePinHref(pin.href) === pathname;
    }
    if (pathname === entityTypeListPath(type)) return true;
    return (
      pathname === "/entities" && new URLSearchParams(search).get("type")?.trim() === type
    );
  }
  return pathname === normalizePinHref(pin.href);
}

export function loadPinnedPrimitives(): PinnedPrimitive[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PINNED_PRIMITIVES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return coercePinnedPrimitives(parsed);
  } catch {
    return [];
  }
}

export function savePinnedPrimitives(pins: PinnedPrimitive[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PINNED_PRIMITIVES_STORAGE_KEY, JSON.stringify(pins));
}

export function isPinnedHref(pins: PinnedPrimitive[], href: string): boolean {
  const normalized = normalizePinHref(href);
  return pins.some((p) => p.href === normalized);
}

export function togglePinnedPrimitive(
  pins: PinnedPrimitive[],
  entry: Omit<PinnedPrimitive, "pinned_at">,
): PinnedPrimitive[] {
  const href = normalizePinHref(entry.href);
  const existing = pins.findIndex((p) => p.href === href);
  if (existing >= 0) {
    return pins.filter((_, i) => i !== existing);
  }
  const entityType = entry.entity_type?.trim() || undefined;
  const relatedEntityType = entry.related_entity_type?.trim() || undefined;
  const next: PinnedPrimitive = {
    href:
      entry.kind === "entity_type" && entityType
        ? entityTypeFilterPinHref(entityType)
        : href,
    kind: entry.kind,
    label: entry.label.trim() || href,
    entity_type: entityType,
    related_entity_type: relatedEntityType,
    subtitle: entry.subtitle?.trim() || undefined,
    pinned_at: new Date().toISOString(),
  };
  return [next, ...pins].slice(0, MAX_PINS);
}

export function removePinnedPrimitive(pins: PinnedPrimitive[], href: string): PinnedPrimitive[] {
  const normalized = normalizePinHref(href);
  return pins.filter((p) => p.href !== normalized);
}

/** Reorder pins by moving the item at `fromIndex` to `toIndex` (array splice semantics). */
export function reorderPinnedPrimitives(
  pins: PinnedPrimitive[],
  fromIndex: number,
  toIndex: number,
): PinnedPrimitive[] {
  if (fromIndex === toIndex) return pins;
  if (fromIndex < 0 || fromIndex >= pins.length) return pins;
  if (toIndex < 0 || toIndex >= pins.length) return pins;
  const next = [...pins];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return pins;
  next.splice(toIndex, 0, moved);
  return next;
}

export type ParsedPinnableRoute = Omit<PinnedPrimitive, "pinned_at">;

/** Entity id from a pinned entity href (`/entities/<id>`), or null. */
export function parseEntityIdFromPinHref(href: string): string | null {
  const normalized = normalizePinHref(href);
  const match = normalized.match(/^\/entities\/([^/]+)$/);
  if (!match) return null;
  const id = decodeURIComponent(match[1]!);
  if (!id || !isEntityIdSegment(id)) return null;
  return id;
}

/** Fill missing `entity_type` on entity pins when hydration map has a value. */
export function enrichPinnedPrimitivesWithEntityTypes(
  pins: PinnedPrimitive[],
  entityTypeByHref: ReadonlyMap<string, string>,
): PinnedPrimitive[] {
  if (entityTypeByHref.size === 0) return pins;
  let changed = false;
  const next = pins.map((pin) => {
    if (pin.kind !== "entity" || pin.entity_type?.trim()) return pin;
    const type = entityTypeByHref.get(pin.href)?.trim();
    if (!type) return pin;
    changed = true;
    return { ...pin, entity_type: type };
  });
  return changed ? next : pins;
}

export type EntityRelationshipPinHydration = {
  anchorEntityType: string;
  anchorLabel: string;
  relatedEntityType: string;
  relatedTypeLabel: string;
};

/** Sidebar label: anchor entity name, then related type in muted secondary text. */
export function entityRelationshipPinTypeLabel(
  pin: PinnedPrimitive,
  schemaLabelByType?: ReadonlyMap<string, string>,
): string {
  const relatedType = pin.related_entity_type?.trim();
  if (!relatedType) return pin.subtitle?.trim() || "";
  return pluralizeEntityTypeLabel(
    relatedType,
    schemaLabelByType?.get(relatedType) ?? null,
  );
}

export function entityRelationshipPinTooltip(pin: PinnedPrimitive): string {
  const typeLabel = pin.subtitle?.trim() || entityRelationshipPinTypeLabel(pin);
  const title = pin.label.trim() || pin.href;
  return typeLabel ? `${title} ${typeLabel}` : title;
}

/** Repair entity_relationships pins (anchor icon, name, related type label). */
export function enrichEntityRelationshipPins(
  pins: PinnedPrimitive[],
  hydrationByHref: ReadonlyMap<string, EntityRelationshipPinHydration>,
  schemaLabelByType?: ReadonlyMap<string, string>,
): PinnedPrimitive[] {
  if (hydrationByHref.size === 0) return pins;
  let changed = false;
  const next = pins.map((pin) => {
    if (pin.kind !== "entity_relationships") return pin;
    const hydration = hydrationByHref.get(pin.href);
    const slice = parseEntityRelationshipSubpageRoute(pin.href);
    const relatedEntityType =
      hydration?.relatedEntityType ?? pin.related_entity_type?.trim() ?? slice?.relatedEntityType;
    if (!hydration && !relatedEntityType) return pin;

    const anchorEntityType = hydration?.anchorEntityType?.trim() || pin.entity_type?.trim();
    const anchorLabel = hydration?.anchorLabel?.trim() || pin.label.trim();
    const relatedTypeLabel =
      hydration?.relatedTypeLabel?.trim() ||
      pin.subtitle?.trim() ||
      (relatedEntityType
        ? pluralizeEntityTypeLabel(
            relatedEntityType,
            schemaLabelByType?.get(relatedEntityType) ?? null,
          )
        : "");

    const updated: PinnedPrimitive = {
      ...pin,
      label: anchorLabel || pin.label,
      entity_type: anchorEntityType || pin.entity_type,
      related_entity_type: relatedEntityType || pin.related_entity_type,
      subtitle: relatedTypeLabel || pin.subtitle,
    };

    if (
      updated.label === pin.label &&
      updated.entity_type === pin.entity_type &&
      updated.related_entity_type === pin.related_entity_type &&
      updated.subtitle === pin.subtitle
    ) {
      return pin;
    }
    changed = true;
    return updated;
  });
  return changed ? next : pins;
}

/** Map current detail pathname to a pinnable target (label must be supplied by the page). */
export function parsePinnableRoute(pathname: string): ParsedPinnableRoute | null {
  const entity = pathname.match(/^\/entities\/([^/]+)$/);
  if (entity) {
    const id = decodeURIComponent(entity[1]!);
    return { href: `/entities/${encodeURIComponent(id)}`, kind: "entity", label: id };
  }
  const source = pathname.match(/^\/sources\/([^/]+)$/);
  if (source) {
    const id = decodeURIComponent(source[1]!);
    return { href: `/sources/${encodeURIComponent(id)}`, kind: "source", label: id };
  }
  const relationship = pathname.match(/^\/relationships\/(.+)$/);
  if (relationship) {
    const key = decodeURIComponent(relationship[1]!);
    return {
      href: `/relationships/${encodeURIComponent(key)}`,
      kind: "relationship",
      label: key.split(":")[0] ?? "Relationship",
      subtitle: key,
    };
  }
  const timeline = pathname.match(/^\/timeline\/([^/]+)$/);
  if (timeline) {
    const id = decodeURIComponent(timeline[1]!);
    return { href: `/timeline/${encodeURIComponent(id)}`, kind: "timeline_event", label: id };
  }
  const relSlice = parseEntityRelationshipSubpageRoute(pathname);
  if (relSlice) {
    return {
      href: entityRelationshipSubpageHref(
        relSlice.entityId,
        relSlice.relationshipType,
        relSlice.relatedEntityType,
      ),
      kind: "entity_relationships",
      label: relSlice.entityId,
      related_entity_type: relSlice.relatedEntityType,
    };
  }
  return null;
}
