import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ActiveFilterGroup {
  /** Optional label for this filter group (e.g. "Types", "Status"). */
  label?: string;
  /** Display values for active filters in this group. */
  values: string[];
}

interface ActiveFilterBadgesProps {
  /** Single filter group (compatible with simple use cases). */
  values?: string[];
  /** Multiple filter groups, each rendered with its own optional label. */
  groups?: ActiveFilterGroup[];
  /** Lead-in text rendered before the badges. Defaults to "Included:". */
  prefix?: ReactNode;
  /** When true, render with a top border + padding (Activity layout). */
  divider?: boolean;
  className?: string;
}

/**
 * Render a row of outline badges describing which filters are currently
 * active. Mirrors the "Included: <Badge> <Badge>" pattern from
 * `recent_activity.tsx`. Supports either a single `values` list or multiple
 * labeled `groups`.
 *
 * Renders nothing when there are no active values to show.
 */
export function ActiveFilterBadges({
  values,
  groups,
  prefix = "Included:",
  divider = false,
  className,
}: ActiveFilterBadgesProps) {
  const normalizedGroups: ActiveFilterGroup[] =
    groups && groups.length > 0
      ? groups.filter((g) => g.values.length > 0)
      : values && values.length > 0
        ? [{ values }]
        : [];

  if (normalizedGroups.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5",
        divider ? "border-t pt-3" : null,
        className,
      )}
    >
      {prefix ? <span className="mr-1 text-xs text-muted-foreground">{prefix}</span> : null}
      {normalizedGroups.map((group, gi) => (
        <span key={group.label ?? `group-${gi}`} className="flex flex-wrap items-center gap-1.5">
          {group.label ? (
            <span className="text-xs text-muted-foreground">{group.label}:</span>
          ) : null}
          {group.values.map((value) => (
            <Badge
              key={`${group.label ?? "g"}-${value}`}
              variant="outline"
              className="font-normal"
            >
              {value}
            </Badge>
          ))}
        </span>
      ))}
    </div>
  );
}
