import { ReactNode } from "react";
import {
  type HeaderSearchContextValue,
  usePageShellHeaderActions,
  usePageShellHeaderMeta,
  usePageShellHeaderSearch,
  usePageShellTitle,
} from "./page_title_context";

interface PageShellProps {
  /** Registered with the header breadcrumb via `page_title_context`; not rendered in-page. */
  title?: string;
  /** Short count or status line shown in the top header (right), not in the page body. */
  meta?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  search?: HeaderSearchContextValue;
  children?: ReactNode;
}

export function PageShell({ title, meta, description, actions, search, children }: PageShellProps) {
  usePageShellTitle(title);
  usePageShellHeaderMeta(meta);
  usePageShellHeaderActions(actions);
  usePageShellHeaderSearch(search);

  return (
    <div className="min-w-0 flex-1 space-y-6 p-6 pb-10">
      {description ? (
        <div className="min-w-0">
          {typeof description === "string" ? (
            <p className="text-muted-foreground">{description}</p>
          ) : (
            <div className="text-muted-foreground mt-1">{description}</div>
          )}
        </div>
      ) : null}
      {children}
    </div>
  );
}
