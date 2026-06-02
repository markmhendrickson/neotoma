import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function TimelineLayerHeader({
  icon: Icon,
  title,
  description,
  count,
  countLabel,
  fullPageHref,
  fullPageLinkText,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  count?: number;
  countLabel?: string;
  fullPageHref?: string;
  fullPageLinkText?: string;
}) {
  const showCount = typeof count === "number" && count > 0;
  const linkText =
    fullPageLinkText ??
    (showCount && countLabel
      ? `View all ${count.toLocaleString()} ${countLabel}`
      : "View all");

  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">{title}</h2>
          {showCount ? (
            <span className="text-sm text-muted-foreground tabular-nums">
              ({count.toLocaleString()})
            </span>
          ) : null}
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {fullPageHref ? (
        <Link
          to={fullPageHref}
          className={cn(
            "shrink-0 text-sm font-medium text-primary hover:underline",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {linkText}
        </Link>
      ) : null}
    </div>
  );
}
