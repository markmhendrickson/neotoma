import { Database, Lightbulb } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/i18n/LocaleContext";
import type { HomeStateFlowHeroCopy, HomeStateFlowTechnicalCopy } from "@/i18n/locales/home_body_types";

interface StateFlowDiagramProps {
  className?: string;
  variant?: "hero" | "technical";
}

const STAGGER_MS = 120;

function HeroVerticalArrow({ visible, delay }: { visible: boolean; delay: string }) {
  return (
    <div
      className="flex justify-center py-0 transition-opacity duration-400 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transitionDelay: delay,
      }}
      aria-hidden
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        className="shrink-0 text-violet-600/45 dark:text-violet-400/55"
      >
        <path
          d="M6 1 L6 7 M2.5 5.5 L6 9.5 L9.5 5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function HeroStateFlow({ visible, copy }: { visible: boolean; copy: HomeStateFlowHeroCopy }) {
  const heroLayers = [{ label: copy.storedLabel, sub: copy.storedSub }] as const;
  const arrowAfterStoreDelay = `${2 * STAGGER_MS}ms`;
  const arrowAfterStoredDelay = `${5 * STAGGER_MS}ms`;
  const arrowAfterAsksDelay = `${heroLayers.length * 2 * STAGGER_MS + 60}ms`;

  return (
    <div className="relative flex min-w-0 max-w-full flex-col gap-3">
      <div
        className="max-w-full rounded-xl border border-sky-300/60 bg-sky-50/90 p-3 transition-[opacity,transform] duration-500 ease-out dark:border-sky-500/30 dark:bg-sky-500/10 sm:p-4"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(12px)",
          transitionDelay: "80ms",
        }}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-sky-700 dark:text-sky-300">
          {copy.youTellProduct}
        </p>
        <p className="mt-2 break-words font-mono text-[12px] leading-6 text-slate-800 dark:text-slate-100 sm:text-[13px]">
          {copy.invoiceQuote}
        </p>
      </div>

      <HeroVerticalArrow visible={visible} delay={arrowAfterStoreDelay} />

      {heroLayers.map((layer, index) => {
        const layerDelay = `${(index + 1) * 2 * STAGGER_MS}ms`;

        return (
          <div key={layer.label}>
            <div
              className="group flex min-w-0 max-w-full items-center gap-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-3 transition-[opacity,transform] duration-500 ease-out dark:border-slate-700/40 dark:bg-slate-900/70 sm:px-4"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(12px)",
                transitionDelay: layerDelay,
              }}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-violet-600/50 bg-violet-100 text-violet-700 dark:border-violet-400/40 dark:bg-violet-500/10 dark:text-violet-300">
                <Database className="h-3.5 w-3.5 shrink-0" strokeWidth={1.65} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="break-words font-mono text-[13px] font-medium text-slate-800 dark:text-slate-100">
                  {layer.label}
                </p>
                <p className="break-words font-mono text-[10px] leading-5 text-slate-500 dark:text-slate-400">
                  {layer.sub}
                </p>
              </div>
            </div>
          </div>
        );
      })}

      <HeroVerticalArrow visible={visible} delay={arrowAfterStoredDelay} />

      <div
        className="mt-1 flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-dashed border-slate-300/60 bg-slate-50/80 px-3 py-2 transition-[opacity,transform] duration-500 ease-out dark:border-slate-700/50 dark:bg-slate-900/40"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(12px)",
          transitionDelay: `${heroLayers.length * 2 * STAGGER_MS + 120}ms`,
        }}
      >
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400/80">
            {copy.youAskProduct}
          </p>
          <p className="mt-1 break-words font-mono text-[12px] leading-5 text-slate-700 dark:text-slate-200">
            {copy.balanceQuote}
          </p>
        </div>
      </div>

      <HeroVerticalArrow visible={visible} delay={arrowAfterAsksDelay} />

      <div
        className="max-w-full rounded-xl border border-emerald-300/60 bg-emerald-50/80 px-3 py-3 transition-[opacity,transform] duration-500 ease-out dark:border-emerald-500/30 dark:bg-emerald-500/10"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(12px)",
          transitionDelay: `${heroLayers.length * 2 * STAGGER_MS + 240}ms`,
        }}
      >
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-600/35 bg-white/80 text-emerald-700 dark:border-emerald-400/30 dark:bg-slate-950/60 dark:text-emerald-300">
            <Lightbulb className="h-3.5 w-3.5 shrink-0" strokeWidth={1.65} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="break-words font-mono text-[13px] leading-snug text-emerald-900 dark:text-emerald-100 sm:text-[14px]">
              <span className="font-semibold">{copy.answerBold}</span>
              <span className="font-medium">{copy.answerRest}</span>
            </p>
            <p className="mt-0.5 font-mono text-[10px] leading-5 text-emerald-800/80 dark:text-emerald-200/80">
              {copy.answerFootnote}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TechnicalStateFlow({ visible, copy }: { visible: boolean; copy: HomeStateFlowTechnicalCopy }) {
  const totalRows = copy.layers.length * 2;

  return (
    <div className="relative flex flex-col gap-0">
      <p
        className="mb-3 font-mono text-[10px] uppercase tracking-[0.15em] text-slate-400 transition-opacity duration-500 dark:text-slate-500"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {copy.pipelineKicker}
      </p>

      {copy.layers.map((layer, i) => {
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
                <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500">{layer.sub}</p>
              </div>
            </div>
            {i < copy.layers.length - 1 && (
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
                  {copy.operations[i]}
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
        <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400/80">{copy.replayHint}</span>
      </div>
    </div>
  );
}

export function StateFlowDiagram({ className, variant = "technical" }: StateFlowDiagramProps) {
  const { pack } = useLocale();
  const { stateFlow } = pack.homeBody;
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

  const regionLabel = variant === "hero" ? stateFlow.hero.regionAriaLabel : stateFlow.technical.regionAriaLabel;

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={regionLabel}
      className={`relative overflow-hidden rounded-lg border border-slate-300/60 bg-white p-5 dark:border-slate-700/60 dark:bg-slate-950 ${className ?? ""}`}
    >
      {/* Blueprint grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,rgba(148,163,184,1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,1)_1px,transparent_1px)] [background-size:20px_20px] dark:opacity-[0.06]"
        aria-hidden
      />

      {variant === "hero" ? (
        <HeroStateFlow visible={visible} copy={stateFlow.hero} />
      ) : (
        <TechnicalStateFlow visible={visible} copy={stateFlow.technical} />
      )}
    </div>
  );
}
