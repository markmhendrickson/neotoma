import { useEffect, useRef, useState } from "react";

interface DotNavSection {
  id: string;
  label: string;
}

interface SectionDotNavProps {
  sections: DotNavSection[];
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  onActiveSectionChange?: (sectionId: string) => void;
}

export function SectionDotNav({
  sections,
  scrollContainerRef,
  onActiveSectionChange,
}: SectionDotNavProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const activeSectionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const ratios = new Map<string, number>();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target.id, entry.intersectionRatio);
        }
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
          if (bestId && activeSectionIdRef.current !== bestId) {
            activeSectionIdRef.current = bestId;
            onActiveSectionChange?.(bestId);
          }
        }
      },
      { root: container, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observerRef.current.observe(el);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [onActiveSectionChange, sections, scrollContainerRef]);

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
