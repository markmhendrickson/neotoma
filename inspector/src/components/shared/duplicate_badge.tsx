import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DuplicateBadgeProps {
  entityId: string;
}

/**
 * Inline indicator for entities that appear in a duplicate-candidate pair.
 * Links to the entity detail page for review/merge.
 */
export function DuplicateBadge({ entityId }: DuplicateBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={`/entities/${encodeURIComponent(entityId)}`}
          onClick={(e) => e.stopPropagation()}
          aria-label="Potential duplicate — click to review"
        >
          <Badge
            variant="outline"
            className="ml-1.5 shrink-0 cursor-pointer border-amber-400 text-amber-600 hover:bg-amber-50 dark:border-amber-500 dark:text-amber-400 dark:hover:bg-amber-950/30"
          >
            ~dup
          </Badge>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">
        Potential duplicate detected. Open entity to review and merge.
      </TooltipContent>
    </Tooltip>
  );
}
