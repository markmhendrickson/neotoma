import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { compactPrefixedId } from "@/lib/humanize";
import { cn } from "@/lib/utils";

interface EntityLinkProps {
  id: string;
  name?: string;
  className?: string;
  /** Tooltip; defaults to entity id */
  title?: string;
}

export function EntityLink({ id, name, className, title: titleAttr }: EntityLinkProps) {
  const shouldTruncate = className?.split(/\s+/).includes("truncate") ?? false;
  return (
    <Link
      to={`/entities/${encodeURIComponent(id)}`}
      className={cn(
        "min-w-0 max-w-full text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline",
        shouldTruncate ? "inline-block align-bottom" : "break-words",
        className
      )}
      title={titleAttr ?? id}
    >
      {name ?? compactPrefixedId(id)}
    </Link>
  );
}

interface EntityOpenIconLinkProps {
  id: string;
  className?: string;
  /** Tooltip; defaults to entity id */
  title?: string;
  iconClassName?: string;
}

/** Same destination as EntityLink, with a drill-down chevron instead of text. */
export function EntityOpenIconLink({
  id,
  className,
  title: titleAttr,
  iconClassName,
}: EntityOpenIconLinkProps) {
  const title = titleAttr ?? id;
  return (
    <Link
      to={`/entities/${encodeURIComponent(id)}`}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
      title={title}
      aria-label={`View entity: ${title}`}
    >
      <ChevronRight className={cn("h-4 w-4", iconClassName)} aria-hidden />
    </Link>
  );
}
