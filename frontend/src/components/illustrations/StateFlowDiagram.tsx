import { useEffect, useRef, useState } from "react";

interface StateFlowDiagramProps {
  className?: string;
  variant?: "hero" | "technical";
}

const TECHNICAL_LAYERS = [
  { label: "Source", sub: "structured entities · MCP · CLI · API" },
  { label: "Observations", sub: "granular facts + provenance" },
  { label: "Entity Snapshots", sub: "current truth · versioned" },
  { label: "Memory Graph", sub: "entities · relationships · timeline" },
] as const;

const TECHNICAL_OPERATIONS = ["record", "reduce", "relate"] as const;

const HERO_LAYERS = [
  { label: "Facts saved", sub: "contacts · tasks · decisions" },
  { label: "State stays consistent", sub: "versioned, traceable, cross-tool" },
  { label: "Same answer in every tool", sub: "Claude · Cursor · ChatGPT" },
] as const;

const HERO_OPERATIONS = ["store", "sync"] as const;

const STAGGER_MS = 120;

function HeroStateFlow({ visible }: { visible: boolean }) {
  return (
    <div className="relative flex flex-col gap-3">
      <div
        className="rounded-xl border border-sky-300/60 bg-sky-50/90 p-4 transition-[opacity,transform] duration-500 ease-out dark:border-sky-500/30 dark:bg-sky-500/10"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(12px)",
          transitionDelay: "80ms",
        }}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-sky-700 dark:text-sky-300">
          one tool stores
        </p>
        <p className="mt-2 font-mono text-[13px] leading-6 text-slate-800 dark:text-slate-100">
          "Invoice for Acme: $3,200 unpaid"
        </p>
      </div>

      {HERO_LAYERS.map((layer, index) => {
        const layerDelay = `${(index + 1) * 2 * STAGGER_MS}ms`;
        const connectorDelay = `${((index + 1) * 2 + 1) * STAGGER_MS}ms`;

        return (
          <div key={layer.label}>
            <div
              className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white/90 px-4 py-3 transition-[opacity,transform] duration-500 ease-out dark:border-slate-700/40 dark:bg-slate-900/70"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(12px)",
                transitionDelay: layerDelay,
              }}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-violet-600/50 bg-violet-100 font-mono text-[10px] font-bold text-violet-700 dark:border-violet-400/40 dark:bg-violet-500/10 dark:text-violet-300">
                {index + 1}
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[13px] font-medium text-slate-800 dark:text-slate-100">
                  {layer.label}
                </p>
                <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                  {layer.sub}
                </p>
              </div>
            </div>
            {index < HERO_LAYERS.length - 1 && (
              <div
                className="flex items-center gap-2 py-1.5 pl-8 transition-opacity duration-400 ease-out"
                style={{
                  opacity: visible ? 1 : 0,
                  transitionDelay: connectorDelay,
                }}
              >
                <svg
                  width="12"
                  height="16"
                  viewBox="0 0 12 16"
                  className="shrink-0 text-violet-600/40 dark:text-violet-400/50"
                >
                  <path
                    d="M6 0 L6 12 M2 8 L6 13 L10 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="font-mono text-[10px] text-slate-400/80 dark:text-slate-500/70">
                  {HERO_OPERATIONS[index]}
                </span>
              </div>
            )}
          </div>
        );
      })}

      <div
        className="mt-1 flex items-center gap-2 rounded-lg border border-dashed border-slate-300/60 bg-slate-50/80 px-3 py-2 transition-[opacity,transform] duration-500 ease-out dark:border-slate-700/50 dark:bg-slate-900/40"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(12px)",
          transitionDelay: `${HERO_LAYERS.length * 2 * STAGGER_MS + 120}ms`,
        }}
      >
        <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400/80">
          exact state · timeline · provenance on retrieval
        </span>
      </div>
    </div>
  );
}

function TechnicalStateFlow({ visible }: { visible: boolean }) {
  const totalRows = TECHNICAL_LAYERS.length * 2;

  return (
    <div className="relative flex flex-col gap-0">
      <p
        className="mb-3 font-mono text-[10px] uppercase tracking-[0.15em] text-slate-400 transition-opacity duration-500 dark:text-slate-500"
        style={{ opacity: visible ? 1 : 0 }}
      >
        neotoma state pipeline
      </p>

      {TECHNICAL_LAYERS.map((layer, i) => {
        const layerDelay = `${i * 2 * STAGGER_MS}ms`;
        const connectorDelay = `${(i * 2 + 1) * STAGGER_MS}ms`;

        return (
          <div key={layer.label}>
            <div
              className="group flex items-center gap-3 rounded border border-slate-200 bg-slate-50 px-4 py-3 transition-[opacity,transform] duration-500 ease-out dark:border-slate-700/40 dark:bg-slate-900/60"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(12px)",
                transitionDelay: layerDelay,
              }}
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-violet-600/50 bg-violet-100 font-mono text-[10px] font-bold text-violet-700 dark:border-violet-400/40 dark:bg-violet-500/10 dark:text-violet-300">
                {i + 1}
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[13px] font-medium text-slate-800 dark:text-slate-200">
                  {layer.label}
                </p>
                <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                  {layer.sub}
                </p>
              </div>
            </div>
            {i < TECHNICAL_LAYERS.length - 1 && (
              <div
                className="flex items-center gap-2 py-1 pl-7 transition-opacity duration-400 ease-out"
                style={{
                  opacity: visible ? 1 : 0,
                  transitionDelay: connectorDelay,
                }}
              >
                <svg
                  width="12"
                  height="16"
                  viewBox="0 0 12 16"
                  className="shrink-0 text-violet-600/40 dark:text-violet-400/50"
                >
                  <path
                    d="M6 0 L6 12 M2 8 L6 13 L10 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="font-mono text-[10px] text-slate-400/80 dark:text-slate-500/70">
                  {TECHNICAL_OPERATIONS[i]}
                </span>
              </div>
            )}
          </div>
        );
      })}

      <div
        className="mt-3 flex items-center gap-2 rounded border border-dashed border-slate-300/50 bg-slate-100/50 px-3 py-2 transition-[opacity,transform] duration-500 ease-out dark:border-slate-600/40 dark:bg-slate-800/30"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(12px)",
          transitionDelay: `${totalRows * STAGGER_MS}ms`,
        }}
      >
        <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400/80">
          ↻ replay · inspect any past state
        </span>
      </div>
    </div>
  );
}

export function StateFlowDiagram({ className, variant = "technical" }: StateFlowDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-lg border border-slate-300/60 bg-white p-5 dark:border-slate-700/60 dark:bg-slate-950 ${className ?? ""}`}
      aria-hidden="true"
    >
      {/* Blueprint grid overlay */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,rgba(148,163,184,1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,1)_1px,transparent_1px)] [background-size:20px_20px] dark:opacity-[0.06]" />

      {variant === "hero" ? (
        <HeroStateFlow visible={visible} />
      ) : (
        <TechnicalStateFlow visible={visible} />
      )}
    </div>
  );
}
