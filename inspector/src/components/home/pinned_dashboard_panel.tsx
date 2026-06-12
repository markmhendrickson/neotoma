import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { usePinnedPrimitives } from "@/hooks/use_pinned_primitives";
import { useSchemas } from "@/hooks/use_schemas";
import { getIconForEntityType } from "@/lib/entity_type_icons";
import { PINNED_PRIMITIVE_KIND_META, type PinnedPrimitive } from "@/lib/pinned_primitives";
import { LiveRelativeTime } from "@/components/shared/live_relative_time";
import { cn } from "@/lib/utils";

function resolvePinIcon(
  pin: PinnedPrimitive,
  schemaMetadataByType: Map<string, Record<string, unknown> | undefined>,
) {
  if (
    (pin.kind === "entity" || pin.kind === "entity_type" || pin.kind === "entity_relationships") &&
    pin.entity_type
  ) {
    return getIconForEntityType(pin.entity_type, schemaMetadataByType.get(pin.entity_type));
  }
  return PINNED_PRIMITIVE_KIND_META[pin.kind]?.icon ?? PINNED_PRIMITIVE_KIND_META.entity.icon;
}

export function PinnedDashboardPanel() {
  const { pins } = usePinnedPrimitives();
  const schemas = useSchemas();

  const schemaMetadataByType = useMemo(() => {
    const map = new Map<string, Record<string, unknown> | undefined>();
    for (const schema of schemas.data?.schemas ?? []) {
      map.set(schema.entity_type, schema.metadata);
    }
    return map;
  }, [schemas.data?.schemas]);

  if (pins.length === 0) return null;

  return (
    <div data-testid="pinned-dashboard-panel">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Pinned</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {pins.map((pin) => {
          const Icon = resolvePinIcon(pin, schemaMetadataByType);
          const kindMeta = PINNED_PRIMITIVE_KIND_META[pin.kind];
          return (
            <Link key={pin.href} to={pin.href} className="group">
              <Card
                className={cn(
                  "transition-colors group-hover:bg-accent/50",
                  "h-full",
                )}
              >
                <CardContent className="flex items-start gap-3 p-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{pin.label || pin.href}</p>
                    {pin.subtitle ? (
                      <p className="truncate text-xs text-muted-foreground">{pin.subtitle}</p>
                    ) : null}
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{kindMeta?.label ?? pin.kind}</span>
                      <span aria-hidden>&middot;</span>
                      <LiveRelativeTime iso={pin.pinned_at} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
