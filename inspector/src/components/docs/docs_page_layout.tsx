import { ReactNode } from "react";
import { PageShell } from "@/components/layout/page_shell";
import { cn } from "@/lib/utils";

interface DocsPageLayoutProps {
  /** Registered with the header breadcrumb and rendered as the in-page h1. */
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

/** In-page title block for bundled docs routes (header breadcrumb stays in the app chrome). */
export function DocsPageHeader({ title, description }: Pick<DocsPageLayoutProps, "title" | "description">) {
  return (
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      {description ? (
        typeof description === "string" ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : (
          <div className="text-sm text-muted-foreground">{description}</div>
        )
      ) : null}
    </header>
  );
}

/**
 * Standard bundled-docs body panel: white (`bg-background`) content area without card border/shadow.
 */
export function DocsPageContentPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg bg-background p-6 pt-6 text-foreground", className)}>{children}</div>
  );
}

/** Page shell + in-page title + optional borderless content panel wrapper. */
export function DocsPageLayout({ title, description, actions, children }: DocsPageLayoutProps) {
  return (
    <PageShell title={title} actions={actions}>
      <div className="space-y-4">
        <DocsPageHeader title={title} description={description} />
        {children}
      </div>
    </PageShell>
  );
}
