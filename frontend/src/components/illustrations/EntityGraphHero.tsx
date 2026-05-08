import { useEffect, useRef, useState } from "react";

interface EntityGraphHeroProps {
  className?: string;
  /** Tighter max width for compact hero layouts (e.g. homepage v2). */
  compact?: boolean;
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

// Live observations that cycle through the ticker, each one targets a node index
// so we can pulse the matching entity when it appears.
const OBSERVATIONS: { text: string; nodeIdx: number }[] = [
  { text: "task.status \u2192 done", nodeIdx: 2 },
  { text: "company.employees += 1", nodeIdx: 1 },
  { text: "person.last_seen updated", nodeIdx: 0 },
  { text: "transaction.amount corrected", nodeIdx: 3 },
  { text: "task \u2192 person :: assigned", nodeIdx: 2 },
];

const OBSERVATION_INTERVAL_MS = 2400;

export function EntityGraphHero({ className = "", compact = false }: EntityGraphHeroProps) {
  const [visible, setVisible] = useState(false);
  const [obsIdx, setObsIdx] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mql.addEventListener?.("change", handler);
    return () => mql.removeEventListener?.("change", handler);
  }, []);

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

  useEffect(() => {
    if (!visible || reduceMotion) return;
    const interval = window.setInterval(() => {
      setObsIdx((i) => (i + 1) % OBSERVATIONS.length);
    }, OBSERVATION_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [visible, reduceMotion]);

  const currentObs = OBSERVATIONS[obsIdx];

  return (
    <div
      ref={ref}
      className={`relative mx-auto w-full ${
        compact ? "max-w-[280px] sm:max-w-[300px] lg:max-w-[320px]" : "max-w-[420px] lg:max-w-none"
      } ${className}`}
      style={{ perspective: "1200px" }}
    >
      <div
        className="relative rounded-xl border border-border/60 bg-card/30 p-4 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.35)] dark:shadow-[0_24px_60px_-28px_rgba(0,0,0,0.55)] transition-transform duration-700 ease-out motion-reduce:transition-none"
        style={{
          transform: reduceMotion
            ? "none"
            : visible
              ? "rotateX(6deg) rotateY(-8deg) translateZ(0)"
              : "rotateX(0deg) rotateY(0deg) translateZ(-20px)",
          transformStyle: "preserve-3d",
        }}
      >
        <svg
          viewBox="0 0 100 80"
          className="w-full"
          style={{ aspectRatio: "100/80" }}
          aria-label="Entity relationship graph showing person, company, task, and transaction nodes with live observations flowing in"
        >
          <defs>
            <marker
              id="arrow-emerald"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-emerald-500/50 dark:fill-emerald-400/45" />
            </marker>
          </defs>

          {EDGES.map(([from, to, label], i) => {
            const a = NODES[from];
            const b = NODES[to];
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            return (
              <g
                key={`edge-${i}`}
                style={{
                  opacity: visible ? 0.65 : 0,
                  transition: `opacity 600ms ease-out ${(NODES.length + i) * STAGGER_MS}ms`,
                }}
              >
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className="stroke-emerald-500/45 dark:stroke-emerald-400/40"
                  strokeWidth="0.3"
                  strokeDasharray="1.2 0.8"
                  markerEnd="url(#arrow-emerald)"
                />
                <text
                  x={mx}
                  y={my - 1.2}
                  textAnchor="middle"
                  className="fill-muted-foreground/55 text-[2.8px] font-mono"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {NODES.map((node, i) => {
            const pulsing = visible && !reduceMotion && currentObs.nodeIdx === i;
            return (
              <g
                key={node.id}
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(4px)",
                  transition: `opacity 500ms ease-out ${i * STAGGER_MS}ms, transform 500ms ease-out ${i * STAGGER_MS}ms`,
                }}
              >
                {pulsing ? (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r="7"
                    className="fill-none stroke-emerald-500/60 dark:stroke-emerald-400/55"
                    strokeWidth="0.4"
                  >
                    <animate
                      attributeName="r"
                      values="7;11;7"
                      dur="1.6s"
                      repeatCount="1"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.9;0;0"
                      dur="1.6s"
                      repeatCount="1"
                    />
                  </circle>
                ) : null}
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
                  className={
                    pulsing
                      ? "fill-emerald-500/20 dark:fill-emerald-400/20"
                      : "fill-emerald-500/8 dark:fill-emerald-400/10"
                  }
                  style={{ transition: "fill 400ms ease-out" }}
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
            );
          })}
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

        {/* Live observation ticker — shows writes landing on the graph in real time */}
        <div
          className="mt-3 flex items-center justify-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-50/40 px-2.5 py-1.5 text-[11px] font-mono dark:bg-emerald-950/20"
          style={{
            opacity: visible ? 1 : 0,
            transition: `opacity 600ms ease-out ${(NODES.length + EDGES.length + 1) * STAGGER_MS}ms`,
          }}
          aria-live="polite"
          aria-atomic="true"
        >
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 dark:bg-emerald-400"
            style={{
              animation: reduceMotion ? undefined : "pulse 1.8s ease-in-out infinite",
            }}
            aria-hidden
          />
          <span className="text-muted-foreground/60">observation</span>
          <span
            key={obsIdx}
            className="text-foreground/80"
            style={
              reduceMotion
                ? undefined
                : { animation: "fadeInObs 600ms ease-out" }
            }
          >
            {currentObs.text}
          </span>
        </div>

        <style>{`
          @keyframes fadeInObs {
            from { opacity: 0; transform: translateY(2px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
      <p className="mt-3 text-center text-[12px] leading-5 text-muted-foreground lg:text-left">
        Structured entities and relationships your agents can query, version, and trust.
      </p>
    </div>
  );
}
