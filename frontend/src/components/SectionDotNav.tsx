import { useEffect, useRef, useState } from "react";

interface DotNavSection {
  id: string;
  label: string;
}

interface SectionDotNavProps {
  sections: DotNavSection[];
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  onActiveSectionChange?: (sectionId: string | null) => void;
  /**
   * When this section intersects the middle focal band of the scrollport (not a dot target),
   * no dot is shown as active — avoids highlighting a slide while reading FAQ / tail content.
   */
  neutralZoneSectionId?: string;
}

export function SectionDotNav({
  sections,
  scrollContainerRef,
  onActiveSectionChange,
  neutralZoneSectionId,
}: SectionDotNavProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const ratiosRef = useRef(new Map<string, number>());
  const neutralRef = useRef(false);
  const lastReportedIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const report = (id: string | null) => {
      if (lastReportedIdRef.current === id) return;
      lastReportedIdRef.current = id;
      onActiveSectionChange?.(id);
    };

    const apply = () => {
      if (neutralRef.current) {
        setActiveIndex(-1);
        report(null);
        return;
      }

      const ratios = ratiosRef.current;
      let bestId = sections[0]?.id;
      let bestRatio = 0;
      for (const [id, ratio] of ratios) {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestId = id;
        }
      }
      const idx = sections.findIndex((s) => s.id === bestId);
      if (idx >= 0) {
        setActiveIndex(idx);
        if (bestId) report(bestId);
      }
    };

    const navObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratiosRef.current.set(entry.target.id, entry.intersectionRatio);
        }
        apply();
      },
      { root: container, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) navObserver.observe(el);
    }

    const neutralEl =
      neutralZoneSectionId != null ? document.getElementById(neutralZoneSectionId) : null;
    const neutralObserver =
      neutralEl != null
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                neutralRef.current = entry.isIntersecting;
              }
              apply();
            },
            {
              root: container,
              // Middle ~36% of the scrollport: user is reading FAQ, not a full-bleed slide.
              rootMargin: "-32% 0px -32% 0px",
              threshold: 0,
            }
          )
        : null;

    if (neutralObserver && neutralEl) neutralObserver.observe(neutralEl);

    return () => {
      navObserver.disconnect();
      neutralObserver?.disconnect();
    };
  }, [neutralZoneSectionId, onActiveSectionChange, sections, scrollContainerRef]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav
      role="navigation"
      aria-label="Page sections"
      className="fixed right-4 top-1/2 -translate-y-1/2 z-40 hidden md:flex flex-col items-end gap-3"
    >
      {sections.map((section, i) => (
        <div key={section.id} className="relative flex items-center">
          {hoveredIndex === i && (
            <span className="absolute right-6 whitespace-nowrap rounded bg-foreground/90 px-2 py-1 text-[11px] font-medium text-background shadow-sm animate-in fade-in-0 slide-in-from-right-1 duration-150">
              {section.label}
            </span>
          )}
          <button
            type="button"
            onClick={() => scrollTo(section.id)}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
            aria-label={section.label}
            aria-current={activeIndex === i ? "true" : undefined}
            className={`h-2.5 w-2.5 rounded-full border-2 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              activeIndex === i
                ? "border-emerald-500 bg-emerald-500 scale-125"
                : "border-muted-foreground/40 bg-transparent hover:border-muted-foreground/70"
            }`}
          />
        </div>
      ))}
    </nav>
  );
}
