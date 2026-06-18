import type { ReactNode } from "react";

/** Cites where an Inspector design-system pattern is defined (CSS utility, primitive, or composite). */
export function DesignPatternSourceNote({ paths }: { paths: string[] }) {
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground/80">Source: </span>
      {paths.map((path, i) => (
        <span key={path}>
          {i > 0 ? ", " : null}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-caption">{path}</code>
        </span>
      ))}
    </p>
  );
}

/** Vertical stack for /design pattern specimens (no separate CSS scope). */
export function DesignPatternStack({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}
