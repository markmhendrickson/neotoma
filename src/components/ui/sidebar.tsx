import * as React from "react";
import { cn } from "@/lib/utils";

/** Minimal shadcn sidebar footer primitive (matches frontend SidebarFooter). */
const SidebarFooter = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 border-t border-sidebar-border p-2", className)}
      {...props}
    />
  ),
);
SidebarFooter.displayName = "SidebarFooter";

export { SidebarFooter };
