import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

type ScrollRevealOnceProps = {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  staticMode?: boolean;
  /** Stagger offset in ms (transition-delay when revealing). */
  staggerMs?: number;
  className?: string;
  children: ReactNode;
};

/**
 * Opacity + translate reveal when the element intersects the scroll container,
 * once (mirrors StateFlowDiagram hero treatment). Uses the same root as FadeSection
 * when scrollContainerRef.current is the page scroller.
 */
export function ScrollRevealOnce({
  scrollContainerRef,
  staticMode,
  staggerMs = 0,
  className = "",
  children,
}: ScrollRevealOnceProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useLayoutEffect(() => {
    if (staticMode || reduceMotion) {
      setRevealed(true);
      return;
    }

    const scrollEl = scrollContainerRef.current;
    const el = wrapperRef.current;
    if (!el) {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0) {
            setRevealed(true);
            observer.disconnect();
            return;
          }
        }
      },
      {
        root: scrollEl ?? null,
        threshold: [0, 0.12, 0.25],
        rootMargin: "0px",
      }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollContainerRef, staticMode, reduceMotion]);

  if (staticMode || reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={wrapperRef}
      className={`transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"} ${className}`}
      style={{ transitionDelay: revealed ? `${staggerMs}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}
