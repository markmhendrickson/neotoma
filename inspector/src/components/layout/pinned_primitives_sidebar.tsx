import { useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { GripVertical, PinOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { usePinnedPrimitives } from "@/hooks/use_pinned_primitives";
import { useHydratePinnedEntityTypes } from "@/hooks/use_hydrate_pinned_entity_types";
import { useSchemas } from "@/hooks/use_schemas";
import { getIconForEntityType } from "@/lib/entity_type_icons";
import {
  entityRelationshipPinTooltip,
  entityRelationshipPinTypeLabel,
  isPinnedLocationActive,
  PINNED_PRIMITIVE_KIND_META,
  reorderPinnedPrimitives,
  type PinnedPrimitive,
} from "@/lib/pinned_primitives";
import { pluralizeEntityTypeLabel } from "@/lib/entity_type_labels";
import { cn } from "@/lib/utils";

function resolvePinIcon(
  pin: PinnedPrimitive,
  schemaMetadataByType: Map<string, Record<string, unknown> | undefined>
): LucideIcon {
  if (
    (pin.kind === "entity" || pin.kind === "entity_type" || pin.kind === "entity_relationships") &&
    pin.entity_type
  ) {
    return getIconForEntityType(pin.entity_type, schemaMetadataByType.get(pin.entity_type));
  }
  return PINNED_PRIMITIVE_KIND_META[pin.kind]?.icon ?? PINNED_PRIMITIVE_KIND_META.entity.icon;
}

function pinnedPinLabel(pin: PinnedPrimitive, schemaLabelByType: Map<string, string>): string {
  if (pin.kind === "entity_type" && pin.entity_type) {
    return pluralizeEntityTypeLabel(pin.entity_type, schemaLabelByType.get(pin.entity_type));
  }
  if (pin.kind === "entity_relationships") {
    return entityRelationshipPinTooltip(pin);
  }
  return pin.label.trim() || pin.href;
}

function PinnedNavItem({
  pin,
  collapsed,
  active,
  icon: Icon,
  label,
  schemaLabelByType,
  index,
  reorderable,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onUnpin,
}: {
  pin: PinnedPrimitive;
  collapsed: boolean;
  active: boolean;
  icon: LucideIcon;
  label: string;
  schemaLabelByType: Map<string, string>;
  index: number;
  reorderable: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (index: number) => void;
  onDragEnd: () => void;
  onDragOver: (index: number) => void;
  onDrop: (index: number) => void;
  onUnpin: (href: string) => void;
}) {
  const relatedTypeLabel =
    pin.kind === "entity_relationships"
      ? entityRelationshipPinTypeLabel(pin, schemaLabelByType)
      : null;
  const title = pin.kind === "entity_relationships" ? pin.label.trim() || pin.href : label;

  const link = (
    <Link
      to={pin.href}
      title={collapsed ? undefined : label}
      className={cn(
        "flex min-w-0 items-center gap-3 overflow-hidden rounded-md py-2 text-sm font-medium transition-colors",
        collapsed ? "h-9 w-9 justify-center px-0" : "w-0 flex-1 px-3",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? (
        pin.kind === "entity_relationships" && relatedTypeLabel ? (
          <span className="flex min-w-0 flex-1 items-baseline gap-1 overflow-hidden">
            <span className="min-w-0 truncate">{title}</span>
            <span
              className={cn(
                "shrink-0 truncate font-normal",
                active ? "text-sidebar-accent-foreground/70" : "text-muted-foreground"
              )}
            >
              {relatedTypeLabel}
            </span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate">{label}</span>
        )
      ) : null}
    </Link>
  );

  const row = collapsed ? (
    link
  ) : (
    <div
      className={cn(
        "group flex w-full min-w-0 max-w-full items-center overflow-hidden rounded-md",
        isDragging && "opacity-50",
        isDropTarget && "ring-1 ring-sidebar-border ring-inset"
      )}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDragOver(index);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(index);
      }}
    >
      {link}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Unpin ${label}`}
        title={`Unpin ${label}`}
        className={cn(
          "h-9 w-7 shrink-0 rounded-md text-muted-foreground hover:text-sidebar-foreground",
          "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        )}
        onClick={() => onUnpin(pin.href)}
      >
        <PinOff className="h-4 w-4" aria-hidden />
      </Button>
      {reorderable ? (
        <button
          type="button"
          draggable
          aria-label={`Reorder ${label}`}
          className={cn(
            "flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground",
            "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
          )}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            onDragStart(index);
          }}
          onDragEnd={onDragEnd}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );

  if (collapsed) {
    return (
      <Tooltip key={pin.href}>
        <TooltipTrigger asChild>{row}</TooltipTrigger>
        <TooltipContent side="right">
          <p className="font-medium">{label}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div key={pin.href} className="min-w-0 max-w-full">
      {row}
    </div>
  );
}

const SIDEBAR_PIN_LIMIT = 8;

export function PinnedPrimitivesSidebar({ collapsed }: { collapsed: boolean }) {
  const location = useLocation();
  const { pins, replacePins, unpin } = usePinnedPrimitives();
  useHydratePinnedEntityTypes(pins, replacePins);
  const schemas = useSchemas();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [showAllPins, setShowAllPins] = useState(false);

  const hasHiddenPins = pins.length > SIDEBAR_PIN_LIMIT;
  const hiddenCount = Math.max(0, pins.length - SIDEBAR_PIN_LIMIT);
  const visiblePins = showAllPins ? pins : pins.slice(0, SIDEBAR_PIN_LIMIT);
  const reorderable = !collapsed && pins.length > 1;

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropIndex(null);
  }, []);

  const handleDrop = useCallback(
    (toIndex: number) => {
      if (dragIndex === null) {
        handleDragEnd();
        return;
      }
      if (dragIndex !== toIndex) {
        replacePins(reorderPinnedPrimitives(pins, dragIndex, toIndex));
      }
      handleDragEnd();
    },
    [dragIndex, handleDragEnd, pins, replacePins]
  );

  const schemaMetadataByType = useMemo(() => {
    const map = new Map<string, Record<string, unknown> | undefined>();
    for (const schema of schemas.data?.schemas ?? []) {
      map.set(schema.entity_type, schema.metadata);
    }
    return map;
  }, [schemas.data?.schemas]);

  const schemaLabelByType = useMemo(() => {
    const map = new Map<string, string>();
    for (const schema of schemas.data?.schemas ?? []) {
      const label =
        schema.metadata && typeof schema.metadata === "object"
          ? (schema.metadata as Record<string, unknown>).label
          : undefined;
      if (typeof label === "string" && label.trim()) {
        map.set(schema.entity_type, label.trim());
      }
    }
    return map;
  }, [schemas.data?.schemas]);

  if (pins.length === 0) {
    return null;
  }

  return (
    <>
      <Separator className="my-2" />
      <div
        className="flex min-w-0 w-full max-w-full flex-col gap-1.5"
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDropIndex(null);
          }
        }}
      >
        {visiblePins.map((pin, index) => (
          <PinnedNavItem
            key={pin.href}
            pin={pin}
            index={index}
            label={pinnedPinLabel(pin, schemaLabelByType)}
            schemaLabelByType={schemaLabelByType}
            collapsed={collapsed}
            active={isPinnedLocationActive(pin, location.pathname, location.search)}
            icon={resolvePinIcon(pin, schemaMetadataByType)}
            reorderable={reorderable}
            isDragging={dragIndex === index}
            isDropTarget={dropIndex === index && dragIndex !== index}
            onDragStart={setDragIndex}
            onDragEnd={handleDragEnd}
            onDragOver={setDropIndex}
            onDrop={handleDrop}
            onUnpin={unpin}
          />
        ))}
        {hasHiddenPins && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={showAllPins}
            aria-label={showAllPins ? "Show fewer pinned items" : `Show all ${pins.length} pinned items`}
            onClick={() => setShowAllPins((expanded) => !expanded)}
            className={cn(
              "h-auto justify-start gap-3 rounded-md py-2 text-xs font-medium text-muted-foreground hover:text-sidebar-foreground",
              collapsed ? "h-9 w-9 justify-center px-0" : "w-full max-w-full px-3"
            )}
          >
            {!collapsed && <span>{showAllPins ? "Show fewer" : `Show all (${pins.length})`}</span>}
            {collapsed && <span className="text-[10px]">{showAllPins ? "−" : `+${hiddenCount}`}</span>}
          </Button>
        )}
      </div>
    </>
  );
}
