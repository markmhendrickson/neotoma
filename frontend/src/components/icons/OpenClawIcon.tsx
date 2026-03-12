import lobsterOutlineSvg from "./openclaw_lobster_outline.svg?raw";
import { cn } from "@/lib/utils";

/**
 * OpenClaw icon — silhouette from openclaw_lobster_outline.svg.
 * Used in hero "Works with" badge and OpenClaw docs page.
 */
export function OpenClawIcon({
  className,
  size,
  ...props
}: React.SVGAttributes<SVGSVGElement> & { size?: number }) {
  const svgWithProps = lobsterOutlineSvg.replace(
    /^<svg /,
    `<svg width="100%" height="100%" `
  );
  return (
    <span
      className={cn("inline-flex shrink-0 size-4", className)}
      style={size ? { width: size, height: size } : undefined}
      dangerouslySetInnerHTML={{ __html: svgWithProps }}
      {...(props as React.HTMLAttributes<HTMLSpanElement>)}
    />
  );
}
