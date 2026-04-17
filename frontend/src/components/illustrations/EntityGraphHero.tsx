import { useEffect, useRef, useState } from "react";

interface EntityGraphHeroProps {
  className?: string;
}

const NODES = [
  { id: "person", label: "person", x: 15, y: 20, icon: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" },
  { id: "company", label: "company", x: 75, y: 15, icon: "M3 21h18M3 7v14M21 7v14M6 11h.01M6 15h.01M18 11h.01M18 15h.01M12 11h.01M12 15h.01M9 3h6l3 4H6l3-4z" },
  { id: "task", label: "task", x: 50, y: 55, icon: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" },
  { id: "transaction", label: "transaction", x: 85, y: 60, icon: "M2 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3l5-10a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3l5 10" },
] as const;

const EDGES: [number, number, string][] = [
  [0, 1, "works_at"],
  [0, 2, "assigned"],
  [1, 3, "invoiced"],
  [2, 0, "created_by"],
];

const STAGGER_MS = 180;

export function EntityGraphHero({ className = "" }: EntityGraphHeroProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`relative mx-auto w-full max-w-[420px] lg:max-w-none ${className}`}
    >
      <div className="relative rounded-xl border border-border/60 bg-card/30 p-4 shadow-[0_18px_48px_-28px_rgba(15,23,42,0.30)] dark:shadow-[0_18px_48px_-28px_rgba(0,0,0,0.50)]">
        <svg
          viewBox="0 0 100 80"
          className="w-full"
          style={{ aspectRatio: "100/80" }}
          aria-label="Entity relationship graph showing person, company, task, and transaction nodes"
        >
          {EDGES.map(([from, to, label], i) => {
            const a = NODES[from];
            const b = NODES[to];
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            return (
              <g
                key={`edge-${i}`}
                style={{
                  opacity: visible ? 0.6 : 0,
                  transition: `opacity 600ms ease-out ${(NODES.length + i) * STAGGER_MS}ms`,
                }}
              >
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className="stroke-emerald-500/40 dark:stroke-emerald-400/35"
                  strokeWidth="0.3"
                  strokeDasharray="1.2 0.8"
                />
                <text
                  x={mx}
                  y={my - 1.2}
                  textAnchor="middle"
                  className="fill-muted-foreground/50 text-[2.8px] font-mono"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {NODES.map((node, i) => (
            <g
              key={node.id}
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(4px)",
                transition: `opacity 500ms ease-out ${i * STAGGER_MS}ms, transform 500ms ease-out ${i * STAGGER_MS}ms`,
              }}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r="7"
                className="fill-background stroke-border"
                strokeWidth="0.4"
              />
              <circle
                cx={node.x}
                cy={node.y}
                r="7"
                className="fill-emerald-500/8 dark:fill-emerald-400/10"
              />
              <svg
                x={node.x - 3}
                y={node.y - 5}
                width="6"
                height="6"
                viewBox="0 0 24 24"
                fill="none"
                className="stroke-foreground/70"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={node.icon} />
              </svg>
              <text
                x={node.x}
                y={node.y + 5.5}
                textAnchor="middle"
                className="fill-foreground/80 text-[3px] font-mono"
              >
                {node.label}
              </text>
            </g>
          ))}
        </svg>

        <div
          className="mt-2 flex items-center justify-center gap-2 text-[10px] font-mono text-muted-foreground/60"
          style={{
            opacity: visible ? 1 : 0,
            transition: `opacity 600ms ease-out ${(NODES.length + EDGES.length) * STAGGER_MS}ms`,
          }}
        >
          <span className="rounded border border-border/50 px-1.5 py-0.5">4 entities</span>
          <span className="text-border">&middot;</span>
          <span className="rounded border border-border/50 px-1.5 py-0.5">4 relationships</span>
          <span className="text-border">&middot;</span>
          <span className="rounded border border-border/50 px-1.5 py-0.5">versioned</span>
        </div>
      </div>
      <p className="mt-3 text-center text-[12px] leading-5 text-muted-foreground lg:text-left">
        Structured entities and relationships your agents can query, version, and trust.
      </p>
    </div>
  );
}
