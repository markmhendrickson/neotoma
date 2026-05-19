import { Fragment } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BrowseCrumb {
  label: string;
  href?: string;
}

export interface BrowseBreadcrumbsProps {
  crumbs: BrowseCrumb[];
  className?: string;
}

/**
 * Inline breadcrumb trail rendered above docs browse pages. Crumbs without
 * `href` render as plain text (terminal "you are here" segment).
 *
 * Example: `Documentation › Concepts › Foundations`
 */
export function BrowseBreadcrumbs({ crumbs, className }: BrowseBreadcrumbsProps) {
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("text-xs text-muted-foreground", className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {crumbs.map((crumb, idx) => (
          <Fragment key={`${crumb.label}-${idx}`}>
            <li className="inline-flex items-center">
              {crumb.href ? (
                <Link
                  to={crumb.href}
                  className="text-muted-foreground transition-colors hover:text-foreground hover:underline"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current="page" className="font-medium text-foreground">
                  {crumb.label}
                </span>
              )}
            </li>
            {idx < crumbs.length - 1 ? (
              <li aria-hidden className="inline-flex items-center">
                <ChevronRight className="h-3 w-3" />
              </li>
            ) : null}
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
