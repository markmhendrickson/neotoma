import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function QueryErrorAlert({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Alert variant="destructive">
      <CircleAlert className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

/** Generic stacked rows (feeds, simple lists). */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-3 py-2">
          <Skeleton className="h-4 w-16 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stat card grid on the dashboard. */
export function DashboardStatsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-lg" />
      ))}
    </div>
  );
}

/** Table-shaped placeholder (entities, observations, etc.). */
export function DataTableSkeleton({ rows = 10, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 overflow-hidden rounded-md border bg-card text-card-foreground" aria-hidden>
      <div className="flex gap-4 border-b bg-inset p-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} className="flex gap-4 border-b p-3 last:border-0">
          {Array.from({ length: cols }).map((_, ci) => (
            <Skeleton key={ci} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function InlineSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("inline-block h-4 w-32 align-middle", className)} aria-hidden />;
}

/** Card grid placeholder for overview routes and compact directory pages. */
export function CardGridSkeleton({
  cards = 8,
  className,
}: {
  cards?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)} aria-hidden>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-md border px-3 py-2">
          <Skeleton className="h-4 w-4 shrink-0" />
          <Skeleton className="h-4 min-w-0 flex-1" />
          <Skeleton className="h-4 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Lazy route fallback that preserves page shape while the chunk loads. */
export function PageRouteSkeleton() {
  return (
    <div className="min-w-0 flex-1 space-y-6 p-6 pb-10" aria-busy aria-label="Loading page">
      <div className="space-y-2">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <DashboardStatsSkeleton />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-56 rounded-lg" />
        <Skeleton className="h-56 rounded-lg" />
      </div>
    </div>
  );
}

/** Large bordered region (e.g. graph canvas). */
/** Entity / relationship detail shells while primary query loads. */
export function DetailPageSkeleton() {
  return (
    <div className="space-y-4 px-6 py-4" aria-hidden>
      <Skeleton className="h-8 max-w-md" />
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-56 rounded-lg" />
        <Skeleton className="h-56 rounded-lg" />
      </div>
    </div>
  );
}

export function GraphAreaSkeleton() {
  return (
    <div
      className="flex h-[min(70vh,560px)] w-full items-center justify-center rounded-md border bg-inset p-8"
      aria-hidden
    >
      <div className="flex w-full max-w-md flex-col items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-4 w-full max-w-sm" />
        <Skeleton className="h-3 w-full max-w-xs" />
      </div>
    </div>
  );
}
