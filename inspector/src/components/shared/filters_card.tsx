import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FiltersCardProps {
  /** Card header title (e.g. "Record filters"). */
  title: ReactNode;
  /** Optional description rendered under the title. */
  description?: ReactNode;
  /**
   * Optional header-end slot (badges, dropdown menus, shortcut buttons).
   * Aligns to the right on desktop and stacks below on mobile.
   */
  headerEnd?: ReactNode;
  /** Filter controls rendered inside `CardContent`. */
  children: ReactNode;
  /**
   * Optional active-filter summary rendered at the bottom of the card body,
   * intended for `<ActiveFilterBadges divider />`.
   */
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}

/**
 * Titled filters card used at the top of index pages. Mirrors the Activity
 * "Record filters" card: header on a muted strip, right-aligned summary
 * badges / shortcut menus, then the filter controls in `CardContent` and an
 * optional active-filter footer.
 *
 * Use with `SegmentedControl`, `MobileFilterPopover`, and
 * `ActiveFilterBadges`.
 */
export function FiltersCard({
  title,
  description,
  headerEnd,
  children,
  footer,
  className,
  contentClassName,
}: FiltersCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="gap-3 border-b bg-muted/20 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {headerEnd ? (
          <div className="flex shrink-0 items-center gap-2">{headerEnd}</div>
        ) : null}
      </CardHeader>
      <CardContent className={cn("space-y-3 p-4", contentClassName)}>
        {children}
        {footer}
      </CardContent>
    </Card>
  );
}
