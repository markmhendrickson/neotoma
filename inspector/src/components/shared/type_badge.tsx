import { cn } from "@/lib/utils";
import { getEntityTypeColor } from "@/lib/constants";
import { humanizeEntityType } from "@/lib/humanize";

interface TypeBadgeProps {
  type: string;
  /** Optional human-readable label override, e.g. from `SchemaMetadata.label`. */
  label?: string | null;
  /** When true, render the humanized label instead of the raw slug. */
  humanize?: boolean;
  className?: string;
}

export function TypeBadge({ type, label, humanize, className }: TypeBadgeProps) {
  const shown = humanize || label ? humanizeEntityType(type, label ?? undefined) : type;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        getEntityTypeColor(type),
        className,
      )}
      title={humanize ? type : undefined}
    >
      {shown}
    </span>
  );
}
