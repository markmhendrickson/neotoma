import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function DesignSection({
  id,
  title,
  description,
  children,
  className,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card id={id} className={cn("scroll-mt-24", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function DesignSubsection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-foreground">{title}</h4>
      {children}
    </div>
  );
}

export function DesignSwatchGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>;
}

export function DesignSwatch({
  label,
  token,
  className,
  textClassName,
}: {
  label: string;
  token: string;
  className: string;
  textClassName?: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <div className={cn("flex h-14 items-end p-2", className)}>
        <span className={cn("text-xs font-medium", textClassName ?? "text-foreground")}>Aa</span>
      </div>
      <div className="space-y-0.5 border-t bg-card px-2 py-1.5">
        <p className="text-xs font-medium">{label}</p>
        <p className="font-mono text-[10px] text-muted-foreground">{token}</p>
      </div>
    </div>
  );
}

export function DesignRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}
