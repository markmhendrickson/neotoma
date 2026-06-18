import { Link, useLocation } from "react-router-dom";
import { Compass } from "lucide-react";
import { PageShell } from "@/components/layout/page_shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty_state";

/**
 * Catch-all route mounted at `*` inside `AppLayout`. Shown when the URL
 * does not match any known route — keeps the user inside the app shell
 * (sidebar, header) and offers entry points back into the inspector.
 */
export default function NotFoundPage() {
  const location = useLocation();
  const pathLabel = location.pathname + (location.search ?? "");
  return (
    <PageShell title="Not found">
      <EmptyState
        icon={Compass}
        title="We couldn't find that page"
        description={
          <>
            <span className="block">
              The route{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
                {pathLabel}
              </code>{" "}
              doesn&apos;t match anything in this inspector.
            </span>
            <span className="mt-2 block">
              Try one of the entry points below, or use search to find a
              specific record.
            </span>
          </>
        }
        actions={
          <>
            <Button asChild variant="default" size="sm">
              <Link to="/">Home</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/search">Search</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/analytics">Analytics</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/entities">Entities</Link>
            </Button>
          </>
        }
      />
    </PageShell>
  );
}
