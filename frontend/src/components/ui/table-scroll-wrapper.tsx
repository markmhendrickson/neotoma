import React, { useEffect, useRef, useState } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

type TableScrollDir = "left" | "right" | "both";

interface TableScrollWrapperProps {
  children: React.ReactNode;
  className?: string;
  viewportClassName?: string;
  showHint?: boolean;
}

/**
 * Constrain content to container width and enable horizontal scrolling.
 * Matches the post table UX from the ateles site (directional scroll hint).
 */
export function TableScrollWrapper({
  children,
  className,
  viewportClassName,
  showHint = true,
}: TableScrollWrapperProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [isScrollable, setIsScrollable] = useState(false);
  const [scrollDir, setScrollDir] = useState<TableScrollDir>("right");

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const update = () => {
      // Only treat as scrollable when there is meaningful overflow (avoid 1px rounding)
      const scrollable = el.scrollWidth > el.clientWidth + 1;
      setIsScrollable(scrollable);
      if (scrollable) {
        const left = el.scrollLeft > 4;
        const right = el.scrollLeft < el.scrollWidth - el.clientWidth - 4;
        setScrollDir(left && right ? "both" : left ? "left" : "right");
      }
    };

    update();
    // Re-measure after layout so we don't show hint if table fits once rendered
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(update);
    });
    el.addEventListener("scroll", update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", update);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      className={cn(
        "table-scroll-outer w-full max-w-full overflow-hidden md:rounded-lg md:border md:border-border",
        isScrollable && "table-scrollable",
        className
      )}
    >
      <div
        ref={viewportRef}
        className={cn(
          "table-scroll-viewport overflow-x-auto w-full min-w-0 max-w-full md:rounded-lg",
          viewportClassName
        )}
      >
        <div className="table-scroll-inner">
          {children}
        </div>
      </div>
      {showHint && isScrollable && (
        <div className="table-scroll-edge" aria-hidden="true">
          <span className="table-scroll-hint">
            {scrollDir === "left" && (
              <>
                <ChevronsLeft className="h-4 w-4" />
                Scroll left
              </>
            )}
            {scrollDir === "right" && (
              <>
                Scroll right
                <ChevronsRight className="h-4 w-4" />
              </>
            )}
            {scrollDir === "both" && (
              <>
                <ChevronsLeft className="h-4 w-4" />
                Scroll
                <ChevronsRight className="h-4 w-4" />
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
