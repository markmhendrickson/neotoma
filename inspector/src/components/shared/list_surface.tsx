import { isValidElement, type ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ListSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { cn } from "@/lib/utils";
import { ApiNotConfiguredState } from "./api_not_configured_state";
import { EmptyState, type EmptyStateProps } from "./empty_state";

/**
 * Structured shape accepted by the `empty` prop. When provided, the
 * surface renders a full {@link EmptyState} primitive instead of the
 * legacy single-line message.
 */
export type ListSurfaceEmpty = Pick<
  EmptyStateProps,
  "icon" | "title" | "description" | "actions" | "className"
>;

/**
 * Reasons a list surface can be "off". Each entry short-circuits the
 * loading / error / empty branches and renders a canonical replacement.
 */
export type ListSurfaceDisabled =
  | { kind: "api-not-configured"; node?: ReactNode }
  | { kind: "auth-required"; node?: ReactNode }
  | { kind: "custom"; node: ReactNode };

interface ListSurfaceProps {
  /** Card header title (e.g. "Activity feed", "Sources", "Issues"). */
  title: ReactNode;
  /**
   * Header description — typically a short summary of which filters or
   * range are currently active.
   */
  description?: ReactNode;
  /**
   * Optional right-aligned header slot (commonly a range/count badge like
   * "Showing 1–50+"). Hidden automatically during loading and error states.
   */
  headerEnd?: ReactNode;
  /**
   * Loading skeleton to render inside the card body. When omitted the
   * default `<ListSkeleton />` is used.
   */
  loading?: boolean;
  loadingNode?: ReactNode;
  /** Error to display via `QueryErrorAlert`. */
  error?: { message: string } | null;
  /** Title to use on the error alert. Defaults to "Could not load". */
  errorTitle?: string;
  /**
   * When true, the body slot is empty and the `emptyMessage` (legacy) or
   * `empty` (structured) state is rendered in place of the list.
   */
  isEmpty?: boolean;
  /**
   * Legacy single-line empty copy. Prefer `empty` for new callsites —
   * `emptyMessage` continues to work for backwards compatibility.
   */
  emptyMessage?: ReactNode;
  /**
   * Structured empty state. May be:
   * - A `ListSurfaceEmpty` object (rendered through {@link EmptyState}).
   * - A `ReactNode` (rendered verbatim inside the body slot).
   *
   * When omitted, the surface falls back to `emptyMessage` (legacy).
   */
  empty?: ListSurfaceEmpty | ReactNode;
  /**
   * Render a canonical disabled state instead of loading / error / empty.
   * Use this when the surface cannot load (API not configured, auth
   * required) and you want the explanatory state inside the card chrome.
   */
  disabled?: ListSurfaceDisabled | null;
  /**
   * Pagination footer rendered below the body with its own border. Use the
   * existing `<Pagination>` or `<OffsetPagination>` components.
   */
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

function isListSurfaceEmpty(value: unknown): value is ListSurfaceEmpty {
  if (!value || typeof value !== "object") return false;
  if (isValidElement(value)) return false;
  const candidate = value as { title?: unknown };
  return typeof candidate.title === "string";
}

function renderDisabledNode(disabled: ListSurfaceDisabled): ReactNode {
  if (disabled.node !== undefined && disabled.node !== null) return disabled.node;
  if (disabled.kind === "api-not-configured") {
    return <ApiNotConfiguredState />;
  }
  if (disabled.kind === "auth-required") {
    return (
      <EmptyState
        title="Sign in required"
        description="This view requires an authenticated session. Open Settings to add a bearer token or start a sandbox session."
      />
    );
  }
  // kind === "custom" with no node — fall back to a neutral message so we
  // never render a blank body.
  return (
    <EmptyState
      title="Unavailable"
      description="This list cannot be displayed right now."
    />
  );
}

/**
 * Content card used to wrap an index/list/feed body together with its
 * loading skeleton, error alert, empty state, optional disabled state,
 * and pagination footer. The card header carries the title, an optional
 * filter-summary description, and an optional right-aligned slot (e.g.
 * range badge).
 *
 * Use alongside `FiltersCard` at the top of index pages.
 */
export function ListSurface({
  title,
  description,
  headerEnd,
  loading,
  loadingNode,
  error,
  errorTitle = "Could not load",
  isEmpty,
  emptyMessage,
  empty,
  disabled,
  footer,
  children,
  className,
  bodyClassName,
}: ListSurfaceProps) {
  const hideHeaderEnd = loading || Boolean(error) || Boolean(disabled);

  let body: ReactNode;
  if (disabled) {
    body = (
      <div className={cn("p-4", bodyClassName)}>{renderDisabledNode(disabled)}</div>
    );
  } else if (loading) {
    body = (
      <div className={cn("p-4", bodyClassName)}>{loadingNode ?? <ListSkeleton />}</div>
    );
  } else if (error) {
    body = (
      <div className={cn("p-4", bodyClassName)}>
        <QueryErrorAlert title={errorTitle}>{error.message}</QueryErrorAlert>
      </div>
    );
  } else if (isEmpty) {
    if (isListSurfaceEmpty(empty)) {
      body = (
        <div className={cn("p-4", bodyClassName)}>
          <EmptyState {...empty} />
        </div>
      );
    } else if (empty !== undefined && empty !== null) {
      body = <div className={cn("p-4", bodyClassName)}>{empty}</div>;
    } else if (emptyMessage !== undefined && emptyMessage !== null) {
      body = (
        <div className={cn("p-4 text-sm text-muted-foreground", bodyClassName)}>
          {emptyMessage}
        </div>
      );
    } else {
      body = (
        <div className={cn("p-4", bodyClassName)}>
          <EmptyState
            title="No results"
            description="Adjust filters or check back after more data is captured."
          />
        </div>
      );
    }
  } else {
    body = <div className={cn("p-4", bodyClassName)}>{children}</div>;
  }

  return (
    <Card className={className}>
      <CardHeader className="gap-2 border-b p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {!hideHeaderEnd && headerEnd ? (
          <div className="flex shrink-0 items-center gap-2">{headerEnd}</div>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {body}
        {disabled ? null : footer}
      </CardContent>
    </Card>
  );
}
