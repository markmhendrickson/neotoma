import {
  createElement,
  isValidElement,
  type ComponentType,
  type ReactNode,
} from "react";
import type { LucideProps } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * Renderable shape for the optional leading icon: either a Lucide-style
 * component (`<X className="…" />`) or a pre-rendered React node.
 */
export type EmptyStateIcon =
  | ReactNode
  | ComponentType<LucideProps>;

export interface EmptyStateProps {
  /**
   * Optional leading visual. Pass either a Lucide icon component
   * (rendered at `size-8` with `text-muted-foreground`) or a pre-rendered
   * React node (used verbatim).
   */
  icon?: EmptyStateIcon;
  /**
   * Short title (e.g. "No entities yet"). Rendered at
   * `text-base font-medium`.
   */
  title: string;
  /**
   * Optional supporting copy explaining what the user is looking at
   * and, ideally, how they get out of the empty state.
   */
  description?: ReactNode;
  /**
   * Optional actions row (typically one or two `Button` elements).
   */
  actions?: ReactNode;
  className?: string;
}

/**
 * Detects component-like inputs that should be rendered via `createElement`
 * (with the canonical icon className) rather than passed through verbatim.
 *
 * Covers plain function components AND `forwardRef`/`memo` wrappers, which
 * are objects with a `$$typeof` Symbol but not valid React elements
 * themselves. Lucide icons are `forwardRef` components, so a simple
 * `typeof === "function"` check would miss them.
 */
function isIconComponent(
  icon: EmptyStateIcon,
): icon is ComponentType<LucideProps> {
  if (typeof icon === "function") return true;
  if (
    typeof icon === "object" &&
    icon !== null &&
    "$$typeof" in icon &&
    !isValidElement(icon as object)
  ) {
    return true;
  }
  return false;
}

function renderIcon(icon: EmptyStateIcon): ReactNode {
  if (icon === null || icon === undefined) return null;
  if (isIconComponent(icon)) {
    return createElement(icon, {
      className: "size-8 text-muted-foreground",
      "aria-hidden": true,
      strokeWidth: 1.5,
    });
  }
  if (isValidElement(icon)) return icon;
  return null;
}

/**
 * Shared empty-state primitive used inside `ListSurface`, on top-level
 * pages without `ListSurface`, and inside widgets that render their own
 * cards. Avoid hard-coded colors; everything uses theme tokens so the
 * primitive works in light and dark mode.
 *
 * The component intentionally renders only its own content (no surrounding
 * `Card`) so callers can drop it into a `Card`, a `CardContent`, the body
 * slot of `ListSurface`, or a bare `PageShell` without doubling up on
 * borders or padding.
 */
export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: EmptyStateProps) {
  const iconNode = icon !== undefined ? renderIcon(icon) : null;
  return (
    <div
      role="status"
      className={cn(
        "mx-auto flex max-w-md flex-col items-center justify-center gap-3 px-4 py-10 text-center",
        className,
      )}
    >
      {iconNode ? <div className="flex justify-center">{iconNode}</div> : null}
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      {description !== undefined && description !== null ? (
        typeof description === "string" ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : (
          <div className="text-sm text-muted-foreground">{description}</div>
        )
      ) : null}
      {actions ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
