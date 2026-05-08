import {
  AlertTriangle,
  Box,
  ChevronDown,
  Clock,
  Eye,
  Fingerprint,
  GitMerge,
  History,
  Rocket,
  RotateCcw,
  ScrollText,
  Sparkles,
  SquarePen,
  Waypoints,
} from "lucide-react";
import { useState } from "react";
import { MdxI18nLink } from "@/components/mdx/mdx_i18n_link";
import { GuaranteeCell, MemoryGuaranteesTable } from "@/components/MemoryGuaranteesTable";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MEMORY_GUARANTEE_ROWS, MEMORY_MODEL_VENDORS } from "@/site/site_data";
import { useLocale } from "@/i18n/LocaleContext";

const MOBILE_GUARANTEE_PREVIEW_COUNT = 4;

export function MemoryGuaranteesPageBody() {
  const { pack } = useLocale();
  const memory = pack.memory;
  const [showAllMobileGuarantees, setShowAllMobileGuarantees] = useState(false);

  return (
    <>
      <p className="text-[16px] leading-7 font-medium text-foreground mb-6">
        Neotoma provides a set of memory guarantees: properties that determine whether an agent
        memory system is reliable under production load. Each addresses a specific failure mode;
        together they form the invariant stack that Neotoma enforces.
      </p>
      <div className="md:hidden mb-8 space-y-2 overflow-x-hidden">
        <TooltipProvider delayDuration={200}>
          <Collapsible
            defaultOpen
            className="rounded-lg border border-border bg-card overflow-hidden"
          >
            <header className="bg-muted/50 border-b border-border/50">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="group w-full px-3 py-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[13px] font-medium text-foreground">{memory.vendors}</span>
                      <p className="text-[11px] leading-4 text-muted-foreground break-words">
                        {memory.representativeProviders}
                      </p>
                    </div>
                    <ChevronDown
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                      aria-hidden
                    />
                  </div>
                </button>
              </CollapsibleTrigger>
            </header>
            <CollapsibleContent>
              <dl className="text-[12px] leading-5 divide-y divide-border/50">
                {(["platform", "retrieval", "file", "database", "neotoma"] as const).map((key) => (
                  <div key={key} className="px-3 py-1.5 flex items-center justify-between gap-2">
                    <dt className="font-medium text-foreground shrink-0">
                      {key === "neotoma"
                        ? memory.deterministic
                        : key === "database"
                          ? memory.database
                          : key === "retrieval"
                            ? memory.retrievalRag
                            : key === "file"
                              ? memory.files
                              : memory.platform}
                    </dt>
                    <dd className="text-muted-foreground text-right truncate">
                      {MEMORY_MODEL_VENDORS[key]}
                    </dd>
                  </div>
                ))}
              </dl>
            </CollapsibleContent>
          </Collapsible>
          {(showAllMobileGuarantees
            ? MEMORY_GUARANTEE_ROWS
            : MEMORY_GUARANTEE_ROWS.slice(0, MOBILE_GUARANTEE_PREVIEW_COUNT)
          ).map((row) => (
            <Collapsible
              key={row.property}
              defaultOpen
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              <header className="bg-muted/50 border-b border-border/50">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="group w-full px-3 py-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[13px] font-medium text-foreground">
                          {row.property}
                        </span>
                        <p className="text-[11px] leading-4 text-muted-foreground break-words">
                          {row.tooltip}
                        </p>
                      </div>
                      <ChevronDown
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                        aria-hidden
                      />
                    </div>
                  </button>
                </CollapsibleTrigger>
              </header>
              <CollapsibleContent>
                <div className="grid grid-cols-5 divide-x divide-border/50">
                  {(
                    [
                      { key: "platform" as const, label: memory.platformShort },
                      { key: "retrieval" as const, label: memory.ragShort },
                      { key: "file" as const, label: memory.filesShort },
                      { key: "database" as const, label: memory.databaseShort },
                      { key: "neotoma" as const, label: memory.deterministicShort },
                    ] as const
                  ).map(({ key, label }) => (
                    <div key={key} className="flex flex-col items-center gap-0.5 px-1 py-1.5">
                      <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                        {label}
                      </span>
                      <GuaranteeCell level={row[key]} />
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
          {MEMORY_GUARANTEE_ROWS.length > MOBILE_GUARANTEE_PREVIEW_COUNT && (
            <button
              type="button"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-medium text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              onClick={() => setShowAllMobileGuarantees(!showAllMobileGuarantees)}
            >
              {showAllMobileGuarantees
                ? memory.showFewer
                : memory.showAllGuarantees(MEMORY_GUARANTEE_ROWS.length)}
            </button>
          )}
        </TooltipProvider>
      </div>

      <div className="hidden md:block mb-8 w-full md:relative md:left-1/2 md:-translate-x-1/2 md:max-w-none md:w-[min(calc(100vw-var(--sidebar-width,16rem)-2rem),calc(100%+28rem))]">
        <MemoryGuaranteesTable />
      </div>

      <nav className="rounded-lg border toc-panel p-4 mb-8">
        <p className="text-[14px] font-medium mb-2">{memory.onThisPage}</p>
        <ul className="list-none pl-0 space-y-1 text-[14px]">
          <li>
            <MdxI18nLink
              to="/deterministic-state-evolution"
              className="text-foreground underline hover:text-foreground"
            >
              Deterministic state evolution
            </MdxI18nLink>
          </li>
          <li>
            <MdxI18nLink to="/versioned-history" className="text-foreground underline hover:text-foreground">
              Versioned history
            </MdxI18nLink>
          </li>
          <li>
            <MdxI18nLink to="/replayable-timeline" className="text-foreground underline hover:text-foreground">
              Replayable timeline
            </MdxI18nLink>
          </li>
          <li>
            <MdxI18nLink to="/auditable-change-log" className="text-foreground underline hover:text-foreground">
              Auditable change log
            </MdxI18nLink>
          </li>
          <li>
            <MdxI18nLink to="/schema-constraints" className="text-foreground underline hover:text-foreground">
              Schema constraints
            </MdxI18nLink>
          </li>
          <li>
            <MdxI18nLink to="/silent-mutation-risk" className="text-foreground underline hover:text-foreground">
              Silent mutation risk
            </MdxI18nLink>
          </li>
          <li>
            <MdxI18nLink to="/conflicting-facts-risk" className="text-foreground underline hover:text-foreground">
              Conflicting facts risk
            </MdxI18nLink>
          </li>
          <li>
            <MdxI18nLink to="/false-closure-risk" className="text-foreground underline hover:text-foreground">
              False closure risk
            </MdxI18nLink>
          </li>
          <li>
            <MdxI18nLink
              to="/reproducible-state-reconstruction"
              className="text-foreground underline hover:text-foreground"
            >
              Reproducible state reconstruction
            </MdxI18nLink>
          </li>
          <li>
            <MdxI18nLink to="/human-inspectability" className="text-foreground underline hover:text-foreground">
              Human inspectability
            </MdxI18nLink>
          </li>
          <li>
            <MdxI18nLink to="/zero-setup-onboarding" className="text-foreground underline hover:text-foreground">
              Zero-setup onboarding
            </MdxI18nLink>
          </li>
          <li>
            <MdxI18nLink
              to="/semantic-similarity-search"
              className="text-foreground underline hover:text-foreground"
            >
              Semantic similarity search
            </MdxI18nLink>
          </li>
          <li>
            <MdxI18nLink
              to="/direct-human-editability"
              className="text-foreground underline hover:text-foreground"
            >
              Direct human editability
            </MdxI18nLink>
          </li>
        </ul>
      </nav>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {[
          {
            to: "/deterministic-state-evolution",
            icon: Fingerprint,
            title: "Deterministic state evolution",
            desc: "Same observations always produce the same entity state.",
          },
          {
            to: "/versioned-history",
            icon: History,
            title: "Versioned history",
            desc: "Every change creates a new version; earlier snapshots remain queryable.",
          },
          {
            to: "/replayable-timeline",
            icon: Waypoints,
            title: "Replayable timeline",
            desc: "Full observation sequence can be replayed to reconstruct state at any timestamp.",
          },
          {
            to: "/auditable-change-log",
            icon: ScrollText,
            title: "Auditable change log",
            desc: "Every modification records who, when, and from which source.",
          },
          {
            to: "/schema-constraints",
            icon: Box,
            title: "Schema constraints",
            desc: "Entities conform to defined types; invalid writes fail at store time.",
          },
          {
            to: "/silent-mutation-risk",
            icon: AlertTriangle,
            title: "Silent mutation risk",
            desc: "State cannot change without an explicit, inspectable trail.",
          },
          {
            to: "/conflicting-facts-risk",
            icon: GitMerge,
            title: "Conflicting facts risk",
            desc: "Contradictory statements are resolved deterministically, not silently.",
          },
          {
            to: "/false-closure-risk",
            icon: Clock,
            title: "False closure risk",
            desc: "Stale context is distinguished from current resolved state.",
          },
          {
            to: "/reproducible-state-reconstruction",
            icon: RotateCcw,
            title: "Reproducible state reconstruction",
            desc: "Complete state can be rebuilt from raw observations alone.",
          },
          {
            to: "/human-inspectability",
            icon: Eye,
            title: "Human inspectability",
            desc: "Diff versions, inspect lineage, trace each fact to its source.",
          },
          {
            to: "/zero-setup-onboarding",
            icon: Rocket,
            title: "Zero-setup onboarding",
            desc: "Memory works from the first message with no configuration.",
          },
          {
            to: "/semantic-similarity-search",
            icon: Sparkles,
            title: "Semantic similarity search",
            desc: "Find relevant context by meaning over structured entity snapshots.",
          },
          {
            to: "/direct-human-editability",
            icon: SquarePen,
            title: "Direct human editability",
            desc: "Modify memory in standard editors; plain-text accessibility trade-offs.",
          },
        ].map(({ to, icon: Icon, title, desc }) => (
          <MdxI18nLink
            key={to}
            to={to}
            className="group rounded-lg border border-border bg-card p-4 hover:bg-muted/50 transition-colors no-underline"
          >
            <div className="flex items-start gap-2 mb-2">
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="text-[15px] font-medium text-foreground group-hover:underline">{title}</span>
            </div>
            <p className="text-[13px] leading-5 text-muted-foreground">{desc}</p>
          </MdxI18nLink>
        ))}
      </div>
    </>
  );
}
