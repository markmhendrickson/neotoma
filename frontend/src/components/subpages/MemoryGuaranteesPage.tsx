import {
  AlertTriangle,
  Box,
  ChevronDown,
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
import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";
import { GuaranteeCell, MemoryGuaranteesTable } from "../MemoryGuaranteesTable";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { TooltipProvider } from "../ui/tooltip";
import { MEMORY_GUARANTEE_ROWS, MEMORY_MODEL_VENDORS } from "../../site/site_data";
import { useLocale } from "@/i18n/LocaleContext";

const MOBILE_GUARANTEE_PREVIEW_COUNT = 4;

const sectionH2Class =
  "flex items-start gap-2 text-[22px] font-medium tracking-[-0.01em] mb-4";
const sectionIconClass = "mt-1 size-5 shrink-0 text-muted-foreground";

export function MemoryGuaranteesPage() {
  const { pack } = useLocale();
  const memory = pack.memory;
  const [showAllMobileGuarantees, setShowAllMobileGuarantees] = useState(false);

  return (
    <DetailPage title={pack.seo.memoryGuarantees.title.replace(" | Neotoma", "")}>
      <p className="text-[16px] leading-7 font-medium text-foreground mb-6">
        Neotoma provides nine memory guarantees: deterministic state evolution, versioned history, replayable timeline, auditable change log, schema constraints, silent mutation prevention, conflicting facts detection, reproducible state reconstruction, and human inspectability.
      </p>
      <p className="text-[15px] leading-7 mb-4">
        These are the properties that determine whether an agent memory system is reliable under
        production load. Each guarantee addresses a specific failure mode; together they form the
        invariant stack that Neotoma enforces.
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
            <a
              href="#deterministic-state-evolution"
              className="text-foreground underline hover:text-foreground"
            >
              Deterministic state evolution
            </a>
          </li>
          <li>
            <a
              href="#versioned-history"
              className="text-foreground underline hover:text-foreground"
            >
              Versioned history
            </a>
          </li>
          <li>
            <a
              href="#replayable-timeline"
              className="text-foreground underline hover:text-foreground"
            >
              Replayable timeline
            </a>
          </li>
          <li>
            <a
              href="#auditable-change-log"
              className="text-foreground underline hover:text-foreground"
            >
              Auditable change log
            </a>
          </li>
          <li>
            <a
              href="#schema-constraints"
              className="text-foreground underline hover:text-foreground"
            >
              Schema constraints
            </a>
          </li>
          <li>
            <a
              href="#silent-mutation-risk"
              className="text-foreground underline hover:text-foreground"
            >
              Silent mutation risk
            </a>
          </li>
          <li>
            <a
              href="#conflicting-facts-risk"
              className="text-foreground underline hover:text-foreground"
            >
              Conflicting facts risk
            </a>
          </li>
          <li>
            <a
              href="#reproducible-state-reconstruction"
              className="text-foreground underline hover:text-foreground"
            >
              Reproducible state reconstruction
            </a>
          </li>
          <li>
            <a
              href="#human-inspectability"
              className="text-foreground underline hover:text-foreground"
            >
              Human inspectability
            </a>
          </li>
          <li>
            <a
              href="#zero-setup-onboarding"
              className="text-foreground underline hover:text-foreground"
            >
              Zero-setup onboarding
            </a>
          </li>
          <li>
            <a
              href="#semantic-similarity-search"
              className="text-foreground underline hover:text-foreground"
            >
              Semantic similarity search
            </a>
          </li>
          <li>
            <a
              href="#direct-human-editability"
              className="text-foreground underline hover:text-foreground"
            >
              Direct human editability
            </a>
          </li>
        </ul>
      </nav>

      {/* Deterministic state evolution */}
      <section id="deterministic-state-evolution" className="scroll-mt-20 mb-12">
        <h2 className={sectionH2Class}>
          <Fingerprint className={sectionIconClass} aria-hidden />
          <span>Deterministic state evolution</span>
        </h2>
        <p className="text-[15px] leading-7 mb-4">
          Given the same set of observations, the system always produces the same entity state
          regardless of when or in what order they are processed. This removes ordering bugs and
          makes agent state testable.
        </p>
        <h3 className="text-[18px] font-medium tracking-[-0.01em] mt-6 mb-3">Before vs after</h3>
        <p className="text-[15px] leading-7 mb-4">
          Before: two agents report conflicting values and whichever write arrives last wins. After:
          both observations are preserved and a deterministic merge rule resolves the canonical
          value reproducibly.
        </p>
        <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Agent A writes one value
neotoma store --json='[{"entity_type":"contact","name":"Ana Rivera","city":"Barcelona"}]'

# Agent B writes a conflicting value
neotoma store --json='[{"entity_type":"contact","name":"Ana Rivera","city":"San Francisco"}]'

# Deterministic reducer computes one canonical snapshot
neotoma entities search --query "Ana Rivera" --type contact`}</pre>
        <p className="text-[15px] leading-7 mb-4">
          Late-arriving observations are folded in deterministically. If the merge rule prefers
          stronger provenance or recency, it behaves identically on replay, which is required for{" "}
          <a
            href="#reproducible-state-reconstruction"
            className="text-foreground underline hover:text-foreground"
          >
            reproducible state reconstruction
          </a>
          .
        </p>
      </section>

      {/* Versioned history */}
      <section id="versioned-history" className="scroll-mt-20 mb-12">
        <h2 className={sectionH2Class}>
          <History className={sectionIconClass} aria-hidden />
          <span>Versioned history</span>
        </h2>
        <p className="text-[15px] leading-7 mb-4">
          Every change creates a new version instead of overwriting prior state. Earlier snapshots
          remain queryable, so you can answer what the system believed at any point.
        </p>
        <h3 className="text-[18px] font-medium tracking-[-0.01em] mt-6 mb-3">Before vs after</h3>
        <p className="text-[15px] leading-7 mb-4">
          Before: a row update erases the old value unless you added custom history tables. After:
          each correction is appended as a new observation, so historical state is preserved by
          default.
        </p>
        <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Current snapshot
neotoma entities search --query "Ana Rivera" --type contact

# Historical lineage
neotoma observations list --entity-id <entity_id>`}</pre>
        <p className="text-[15px] leading-7 mb-4">
          This aligns with event-sourcing principles: the observation log is authoritative,
          snapshots are derived views.
        </p>
      </section>

      {/* Replayable timeline */}
      <section id="replayable-timeline" className="scroll-mt-20 mb-12">
        <h2 className={sectionH2Class}>
          <Waypoints className={sectionIconClass} aria-hidden />
          <span>Replayable timeline</span>
        </h2>
        <p className="text-[15px] leading-7 mb-4">
          The full sequence of observations can be replayed to reconstruct state at any timestamp.
          This enables deterministic debugging and incident analysis.
        </p>
        <h3 className="text-[18px] font-medium tracking-[-0.01em] mt-6 mb-3">Before vs after</h3>
        <p className="text-[15px] leading-7 mb-4">
          Before: after an incident, you only have current snapshots and partial logs. After: replay
          from observations reproduces the exact state transition path that led to failure.
        </p>
        <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# List timeline events
neotoma timeline list

# Get one event and inspect linked entities
neotoma timeline get <event_id>
neotoma relationships list --entity-id <entity_id>`}</pre>
        <p className="text-[15px] leading-7 mb-4">
          Replay depends on{" "}
          <a
            href="#deterministic-state-evolution"
            className="text-foreground underline hover:text-foreground"
          >
            deterministic state evolution
          </a>{" "}
          and supports{" "}
          <a
            href="#reproducible-state-reconstruction"
            className="text-foreground underline hover:text-foreground"
          >
            reproducible state reconstruction
          </a>
          .
        </p>
      </section>

      {/* Auditable change log */}
      <section id="auditable-change-log" className="scroll-mt-20 mb-12">
        <h2 className={sectionH2Class}>
          <ScrollText className={sectionIconClass} aria-hidden />
          <span>Auditable change log</span>
        </h2>
        <p className="text-[15px] leading-7 mb-4">
          Every modification records who changed what, when, and from which source. This creates
          field-level lineage for every fact in state.
        </p>
        <h3 className="text-[18px] font-medium tracking-[-0.01em] mt-6 mb-3">Before vs after</h3>
        <p className="text-[15px] leading-7 mb-4">
          Before: state changes are visible but origin is unclear. After: every change maps back to
          a concrete tool call or source artifact with timestamped provenance.
        </p>
        <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Inspect provenance trail
neotoma observations list --entity-id <entity_id>

# Inspect relationships to source/message entities
neotoma relationships list --entity-id <entity_id>`}</pre>
        <p className="text-[15px] leading-7 mb-4">
          This is required for trustworthy multi-agent systems.
        </p>
      </section>

      {/* Schema constraints */}
      <section id="schema-constraints" className="scroll-mt-20 mb-12">
        <h2 className={sectionH2Class}>
          <Box className={sectionIconClass} aria-hidden />
          <span>Schema constraints</span>
        </h2>
        <p className="text-[15px] leading-7 mb-4">
          Entities conform to defined types and validation rules. Invalid writes fail at store time
          so malformed data does not silently enter the memory graph.
        </p>
        <h3 className="text-[18px] font-medium tracking-[-0.01em] mt-6 mb-3">Before vs after</h3>
        <p className="text-[15px] leading-7 mb-4">
          Before: one tool stores <code>age: "thirty"</code> while another expects a number. After:
          schema validation rejects the invalid write and returns a deterministic error.
        </p>
        <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Invalid payload example
neotoma store --json='[{"entity_type":"person","name":"Ana Rivera","age":"thirty"}]'

# Valid payload
neotoma store --json='[{"entity_type":"person","name":"Ana Rivera","age":30}]'`}</pre>
        <p className="text-[15px] leading-7 mb-4">
          This protects{" "}
          <a
            href="#deterministic-state-evolution"
            className="text-foreground underline hover:text-foreground"
          >
            deterministic state evolution
          </a>{" "}
          and reduces{" "}
          <a
            href="#silent-mutation-risk"
            className="text-foreground underline hover:text-foreground"
          >
            silent mutation risk
          </a>
          .
        </p>
      </section>

      {/* Silent mutation risk */}
      <section id="silent-mutation-risk" className="scroll-mt-20 mb-12">
        <h2 className={sectionH2Class}>
          <AlertTriangle className={sectionIconClass} aria-hidden />
          <span>Silent mutation risk</span>
        </h2>
        <p className="text-[15px] leading-7 mb-4">
          Silent mutation risk is the chance that state changes without an explicit, inspectable
          trail. High-risk systems can overwrite or drop facts without leaving evidence.
        </p>
        <h3 className="text-[18px] font-medium tracking-[-0.01em] mt-6 mb-3">Before vs after</h3>
        <p className="text-[15px] leading-7 mb-4">
          Before: a contact field changes after an agent run and nobody can tell when or why. After:
          every field change is an observation, and lineage can be queried by entity and timestamp.
        </p>
        <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Inspect mutation trail for one entity
neotoma observations list --entity-id <entity_id>

# Verify relationship links for source context
neotoma relationships list --entity-id <entity_id>`}</pre>
        <p className="text-[15px] leading-7 mb-4">
          Deterministic systems prevent silent mutation by design through{" "}
          <a
            href="#auditable-change-log"
            className="text-foreground underline hover:text-foreground"
          >
            auditable change logs
          </a>{" "}
          and{" "}
          <a href="#versioned-history" className="text-foreground underline hover:text-foreground">
            versioned history
          </a>
          .
        </p>
      </section>

      {/* Conflicting facts risk */}
      <section id="conflicting-facts-risk" className="scroll-mt-20 mb-12">
        <h2 className={sectionH2Class}>
          <GitMerge className={sectionIconClass} aria-hidden />
          <span>Conflicting facts risk</span>
        </h2>
        <p className="text-[15px] leading-7 mb-4">
          Conflicting facts risk is the likelihood that contradictory statements coexist without
          deterministic resolution. In production this causes unpredictable agent behavior.
        </p>
        <h3 className="text-[18px] font-medium tracking-[-0.01em] mt-6 mb-3">Before vs after</h3>
        <p className="text-[15px] leading-7 mb-4">
          Before: both "office is in New York" and "office is in London" remain active with no
          canonical winner. After: merge rules choose one canonical value and preserve conflicting
          history for audit.
        </p>
        <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Store two conflicting facts
neotoma store --json='[{"entity_type":"contact","name":"Ana Rivera","office_city":"New York"}]'
neotoma store --json='[{"entity_type":"contact","name":"Ana Rivera","office_city":"London"}]'

# Query canonical resolved state
neotoma entities search --query "Ana Rivera" --type contact`}</pre>
        <p className="text-[15px] leading-7 mb-4">
          Deterministic merge logic resolves conflicts reproducibly.{" "}
          <a href="#schema-constraints" className="text-foreground underline hover:text-foreground">
            Schema constraints
          </a>{" "}
          support typed conflict handling, and{" "}
          <a
            href="#deterministic-state-evolution"
            className="text-foreground underline hover:text-foreground"
          >
            deterministic state evolution
          </a>{" "}
          guarantees the same result on replay.
        </p>
      </section>

      {/* Reproducible state reconstruction */}
      <section id="reproducible-state-reconstruction" className="scroll-mt-20 mb-12">
        <h2 className={sectionH2Class}>
          <RotateCcw className={sectionIconClass} aria-hidden />
          <span>Reproducible state reconstruction</span>
        </h2>
        <p className="text-[15px] leading-7 mb-4">
          Reproducible state reconstruction means rebuilding complete state from raw observations
          alone. If the database is lost, replay reconstructs the same state deterministically.
        </p>
        <h3 className="text-[18px] font-medium tracking-[-0.01em] mt-6 mb-3">Before vs after</h3>
        <p className="text-[15px] leading-7 mb-4">
          Before: restoring requires uncertain backups and manual reconciliation. After: replay up
          to timestamp T recreates state at T exactly, then replay to present restores current
          state.
        </p>
        <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Verify timeline events are available
neotoma timeline list

# Recompute and verify snapshots
neotoma entities list --type task --limit 20`}</pre>
        <p className="text-[15px] leading-7 mb-4">
          This depends on{" "}
          <a
            href="#replayable-timeline"
            className="text-foreground underline hover:text-foreground"
          >
            replayable timeline
          </a>{" "}
          and{" "}
          <a
            href="#deterministic-state-evolution"
            className="text-foreground underline hover:text-foreground"
          >
            deterministic state evolution
          </a>
          .
        </p>
      </section>

      {/* Human inspectability */}
      <section id="human-inspectability" className="scroll-mt-20 mb-12">
        <h2 className={sectionH2Class}>
          <Eye className={sectionIconClass} aria-hidden />
          <span>Human inspectability</span>
        </h2>
        <p className="text-[15px] leading-7 mb-4">
          Human inspectability means a person can diff two versions, inspect lineage, and trace each
          fact to its source. Trust comes from verification, not hidden model behavior.
        </p>
        <h3 className="text-[18px] font-medium tracking-[-0.01em] mt-6 mb-3">Before vs after</h3>
        <p className="text-[15px] leading-7 mb-4">
          Before: a value changes and operators only see "current state." After: operators can
          inspect field-level diffs and provenance to validate or correct the update.
        </p>
        <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Inspect snapshot lineage
neotoma entities get <entity_id>
neotoma observations list --entity-id <entity_id>`}</pre>
        <p className="text-[15px] leading-7 mb-4">
          Inspectability depends on{" "}
          <a href="#versioned-history" className="text-foreground underline hover:text-foreground">
            versioned history
          </a>{" "}
          and{" "}
          <a
            href="#auditable-change-log"
            className="text-foreground underline hover:text-foreground"
          >
            auditable change log
          </a>
          .
        </p>
      </section>

      {/* Zero-setup onboarding */}
      <section id="zero-setup-onboarding" className="scroll-mt-20 mb-12">
        <h2 className={sectionH2Class}>
          <Rocket className={sectionIconClass} aria-hidden />
          <span>Zero-setup onboarding</span>
        </h2>
        <p className="text-[15px] leading-7 mb-4">
          Zero-setup onboarding means memory works from the first message with no installation,
          configuration, or infrastructure required. Platform memory products like ChatGPT and
          Claude provide this by embedding memory into the chat product itself.
        </p>
        <h3 className="text-[18px] font-medium tracking-[-0.01em] mt-6 mb-3">Trade-offs</h3>
        <p className="text-[15px] leading-7 mb-4">
          The convenience of zero-setup comes at a cost: the vendor controls where data lives, how
          it is structured, and what guarantees it provides. Users cannot export, version, or audit
          memory independently. Retrieval systems and file-based approaches require setup but offer
          more control. Neotoma requires installation but provides{" "}
          <a
            href="#deterministic-state-evolution"
            className="text-foreground underline hover:text-foreground"
          >
            deterministic state evolution
          </a>
          ,{" "}
          <a href="#versioned-history" className="text-foreground underline hover:text-foreground">
            versioned history
          </a>
          , and{" "}
          <a
            href="#human-inspectability"
            className="text-foreground underline hover:text-foreground"
          >
            human inspectability
          </a>{" "}
          in exchange.
        </p>
        <h3 className="text-[18px] font-medium tracking-[-0.01em] mt-6 mb-3">
          Getting started with Neotoma
        </h3>
        <p className="text-[15px] leading-7 mb-4">
          While Neotoma is not zero-setup, the install process is minimal. See the{" "}
          <Link to="/install" className="text-foreground underline hover:text-foreground">
            install guide
          </Link>{" "}
          for step-by-step instructions.
        </p>
        <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`npm install -g neotoma
neotoma api start --env prod`}</pre>
        <p className="text-[15px] leading-7 mb-4">
          Compare memory approaches on the{" "}
          <Link to="/memory-models" className="text-foreground underline hover:text-foreground">
            memory models
          </Link>{" "}
          page.
        </p>
      </section>

      {/* Semantic similarity search */}
      <section id="semantic-similarity-search" className="scroll-mt-20 mb-12">
        <h2 className={sectionH2Class}>
          <Sparkles className={sectionIconClass} aria-hidden />
          <span>Semantic similarity search</span>
        </h2>
        <p className="text-[15px] leading-7 mb-4">
          Semantic similarity search finds relevant prior context by meaning rather than exact text
          match. Retrieval / RAG systems pioneered this by searching over unstructured documents
          using vector embeddings. Neotoma applies the same technique to structured entity
          snapshots, scoped by entity type and structural filters.
        </p>
        <h3 className="text-[18px] font-medium tracking-[-0.01em] mt-6 mb-3">How it works</h3>
        <p className="text-[15px] leading-7 mb-4">
          When an agent or user queries Neotoma, the system embeds the query and compares it against
          entity snapshots. Because entities are structured and typed, search can be narrowed by
          entity type, time range, or relationship before similarity ranking is applied.
        </p>
        <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Search by meaning across all entities
neotoma entities search --query "upcoming meetings with the design team"

# Narrow by entity type
neotoma entities search --query "design review" --type event`}</pre>
        <h3 className="text-[18px] font-medium tracking-[-0.01em] mt-6 mb-3">
          Structured vs unstructured
        </h3>
        <p className="text-[15px] leading-7 mb-4">
          Pure retrieval systems search over raw documents and rely on the model to extract relevant
          facts from returned chunks. Neotoma searches over snapshots that already conform to{" "}
          <a href="#schema-constraints" className="text-foreground underline hover:text-foreground">
            schema constraints
          </a>
          , so results are typed and immediately usable. This combines the flexibility of semantic
          search with the reliability of{" "}
          <a
            href="#deterministic-state-evolution"
            className="text-foreground underline hover:text-foreground"
          >
            deterministic state evolution
          </a>
          .
        </p>
        <p className="text-[15px] leading-7 mb-4">
          See{" "}
          <Link to="/memory-models" className="text-foreground underline hover:text-foreground">
            memory models
          </Link>{" "}
          for a full comparison, and the{" "}
          <Link to="/mcp" className="text-foreground underline hover:text-foreground">
            MCP reference
          </Link>{" "}
          for retrieval actions.
        </p>
      </section>

      {/* Direct human editability */}
      <section id="direct-human-editability" className="scroll-mt-20 mb-12">
        <h2 className={sectionH2Class}>
          <SquarePen className={sectionIconClass} aria-hidden />
          <span>Direct human editability</span>
        </h2>
        <p className="text-[15px] leading-7 mb-4">
          Direct human editability means a person can open the memory store in a standard editor
          (VS Code, Notepad, vim) and modify it directly. File-based memory systems use plain text
          formats like Markdown or JSON that any tool can read and write without a runtime or API
          layer.
        </p>
        <h3 className="text-[18px] font-medium tracking-[-0.01em] mt-6 mb-3">Trade-offs</h3>
        <p className="text-[15px] leading-7 mb-4">
          Editable files are maximally accessible but lack structural guarantees. A typo, a
          malformed JSON key, or an accidental deletion can silently corrupt state. There is no
          built-in{" "}
          <a href="#versioned-history" className="text-foreground underline hover:text-foreground">
            versioned history
          </a>{" "}
          unless the user maintains it (e.g. via git), and no{" "}
          <a href="#schema-constraints" className="text-foreground underline hover:text-foreground">
            schema constraints
          </a>{" "}
          to reject invalid edits.
        </p>
        <h3 className="text-[18px] font-medium tracking-[-0.01em] mt-6 mb-3">
          How Neotoma compares
        </h3>
        <p className="text-[15px] leading-7 mb-4">
          Neotoma stores data in a structured, schema-validated format. While the underlying storage
          is not a plain text file you open directly, entities are fully accessible and modifiable
          through the CLI and MCP actions. Every modification goes through the observation pipeline,
          preserving{" "}
          <a
            href="#auditable-change-log"
            className="text-foreground underline hover:text-foreground"
          >
            auditable change logs
          </a>{" "}
          and{" "}
          <a
            href="#deterministic-state-evolution"
            className="text-foreground underline hover:text-foreground"
          >
            deterministic state evolution
          </a>
          .
        </p>
        <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Read current state
neotoma entities get <entity_id>

# Update via a new observation (preserves history)
neotoma store --json='[{"entity_type":"contact","name":"Ana Rivera","city":"Barcelona"}]'`}</pre>
        <p className="text-[15px] leading-7 mb-4">
          Platform memory (ChatGPT, Claude) may offer in-app UIs to view or edit memories, but the
          underlying store is not exposed as an editable file. See{" "}
          <Link to="/memory-models" className="text-foreground underline hover:text-foreground">
            memory models
          </Link>{" "}
          for the full comparison.
        </p>
      </section>
    </DetailPage>
  );
}
