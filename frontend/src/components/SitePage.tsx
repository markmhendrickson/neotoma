import { AlertTriangle, Check, ChevronDown, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  FUNCTIONALITY_MATRIX,
  MCP_ACTIONS_TABLE,
  CLI_COMMANDS_TABLE,
  GLOSSARY_ROWS,
  LEARN_MORE_POSTS,
  LEARN_MORE_REPO_CARD,
  SITE_CODE_SNIPPETS,
  SITE_METADATA,
  type LearnMoreCardItem,
} from "../site/site_data";
import thinkingAndPlanningDemo from "../assets/thinking-and-planning-demo.gif";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./ui/dialog";
import { TableScrollWrapper } from "./ui/table-scroll-wrapper";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { SeoHead } from "./SeoHead";

interface SitePageProps {
  staticMode?: boolean;
}

const RESPONSIVE_TABLE_CLASS =
  "w-full caption-bottom border-0 text-[15px] leading-7 [&_th]:max-w-[50ch] [&_td]:max-w-[50ch] [&_th]:break-words [&_td]:break-words [&_thead]:sr-only [&_thead]:absolute [&_thead]:w-px [&_thead]:h-px [&_thead]:overflow-hidden [&_thead]:whitespace-nowrap [&_tbody]:block [&_tr]:block [&_tr]:mb-0 [&_tr]:rounded-none [&_tr]:border-b [&_tr]:border-border [&_tr]:bg-transparent [&_tr]:py-4 [&_td]:grid [&_td]:grid-cols-[8rem_minmax(0,1fr)] [&_td]:gap-3 [&_td]:items-start [&_td]:p-0 [&_td]:border-0 [&_td]:text-[14px] [&_td]:leading-5 [&_td]:py-4 [&_td.align-top]:py-2 [&_td::before]:content-[attr(data-label)] [&_td::before]:font-semibold [&_td::before]:text-foreground md:w-full md:border md:border-border md:border-collapse md:rounded-lg md:overflow-hidden md:[&_thead]:not-sr-only md:[&_thead]:static md:[&_thead]:w-auto md:[&_thead]:h-auto md:[&_thead]:overflow-visible md:[&_thead]:whitespace-normal md:[&_thead_th]:bg-muted md:[&_thead_th:first-child]:rounded-tl-lg md:[&_thead_th:last-child]:rounded-tr-lg md:[&_tbody_tr:last-child_td:first-child]:rounded-bl-lg md:[&_tbody_tr:last-child_td:last-child]:rounded-br-lg md:[&_thead_tr]:border-b md:[&_thead_tr]:border-border md:[&_tbody]:table-row-group md:[&_tbody_tr]:border-b md:[&_tbody_tr]:border-border md:[&_tbody_tr:last-child]:border-b-0 md:[&_tr]:table-row md:[&_tr]:h-10 md:[&_tr]:mb-0 md:[&_tr]:rounded-none md:[&_tr]:border-0 md:[&_tr]:bg-transparent md:[&_tr]:py-4 md:[&_tr]:transition-colors md:[&_tbody_tr:hover]:bg-muted/50 md:[&_td]:table-cell md:[&_td]:px-4 md:[&_td]:py-3 md:[&_td]:align-middle md:[&_td]:text-body md:[&_td:has([role=checkbox])]:pr-0 md:[&_td::before]:hidden md:[&_th]:h-12 md:[&_th]:px-4 md:[&_th]:text-left md:[&_th]:align-middle md:[&_th]:font-semibold md:[&_th]:text-foreground md:[&_th:has([role=checkbox])]:pr-0";
const MOBILE_TABLE_ROWS_STEP = 5;

function sanitizeCodeForCopy(rawCode: string): string {
  return rawCode
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("//")) {
        return "";
      }
      const commentIndex = line.indexOf("#");
      if (commentIndex >= 0 && !line.trimStart().startsWith('"')) {
        return line.slice(0, commentIndex).trimEnd();
      }
      return line;
    })
    .filter((line) => line !== "")
    .join("\n");
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="group scroll-mt-6 text-[20px] font-medium tracking-[-0.02em] mt-14 mb-3">
      {children}
      <a
        href={`#${id}`}
        className="ml-2 inline-flex items-center text-muted-foreground no-underline border-none opacity-40 group-hover:opacity-70 hover:!opacity-100 hover:text-foreground transition"
        aria-label="Link to section"
      >
        #
      </a>
    </h2>
  );
}

function SectionDivider() {
  return (
    <div className="flex items-center gap-3 my-12" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[8px] text-muted-foreground leading-none">◆</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Learn more card: matches ateles Post.tsx prev/next post design (Alert + layout). Links are not underlined. */
function LearnMoreCard({ item }: { item: LearnMoreCardItem }) {
  const isExternal = item.href.startsWith("http");
  const content = (
    <Alert className="flex flex-col md:flex-row items-stretch gap-4 cursor-pointer h-full no-underline bg-white dark:bg-card border-border">
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt=""
          className="w-full md:w-[148px] md:h-[148px] md:shrink-0 rounded object-cover"
        />
      )}
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <AlertTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {item.label}
        </AlertTitle>
        <AlertDescription className="py-px">
          <span className="font-medium text-foreground">{item.title}</span>
          {item.description && (
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
          )}
          <span className="mt-2 inline-block text-sm font-medium text-foreground/80">
            {item.ctaLabel ?? "Read more →"}
          </span>
        </AlertDescription>
      </div>
    </Alert>
  );
  return isExternal ? (
    <a
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
      className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-lg [&:hover]:opacity-95 transition-opacity no-underline"
    >
      {content}
    </a>
  ) : (
    <a
      href={item.href}
      className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-lg [&:hover]:opacity-95 transition-opacity no-underline"
    >
      {content}
    </a>
  );
}

function CodeBlock({ code, staticMode = false }: { code: string; staticMode?: boolean }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const normalizedCode = sanitizeCodeForCopy(code);
    await navigator.clipboard.writeText(normalizedCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative mb-4">
      {!staticMode ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="absolute top-2 right-2 gap-0 shrink-0"
          aria-label={copied ? "Copied" : "Copy code"}
          onClick={onCopy}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      ) : null}
      <pre className="rounded-lg border border-border bg-muted p-4 pr-12 overflow-x-auto font-mono text-[14px] text-foreground whitespace-pre-wrap break-words">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Failure interaction examples from docs/developer/agent_memory_failure_interactions_by_schema.md */
const FORGETFUL_SCENARIOS = [
  {
    left: "Use Jordan Lee from legal on this thread.",
    right: "Sending to Jordan Lee (Sales).",
    schema: "person",
  },
  {
    left: "Use Priya's new work email.",
    right: "Sent to priya@oldco.com.",
    schema: "contact",
  },
  {
    left: "Route this to Acme Holdings.",
    right: "Assigned to Acme Logistics account owner.",
    schema: "company",
  },
  {
    left: "Ship to the updated Austin office.",
    right: "Shipment queued for 210 2nd St.",
    schema: "address",
  },
  {
    left: "Remind me to submit payroll Friday.",
    right: "Reminder set for last Friday's payroll task.",
    schema: "task",
  },
  {
    left: "What changed after yesterday's incident?",
    right: "No change after incident close.",
    schema: "event",
  },
  {
    left: "Where is the handoff meeting?",
    right: "At the old office on 3rd Ave.",
    schema: "location",
  },
  {
    left: "Which company owns this contract?",
    right: "Owned by Beta LLC.",
    schema: "contract",
  },
  {
    left: "Was invoice 884 paid?",
    right: "Unpaid as of Feb 2.",
    schema: "transaction",
  },
  {
    left: "Continue where we left off yesterday.",
    right: "Resuming based on last week's thread.",
    schema: "conversation",
  },
  {
    left: "Show all open work for Project Atlas.",
    right: "Showing 18 open items.",
    schema: "project",
  },
];

const SCENARIO_DURATION_MS = 5000;
const HUMAN_TYPING_MS = 1700;
const AGENT_THINKING_MS = 900;
const AGENT_TYPING_MS = 2000;

function ForgetfulAgentIllustration() {
  const [elapsedTotal, setElapsedTotal] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      setElapsedTotal(Date.now() - startedAt);
    }, 80);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const absoluteScenarioIndex = Math.floor(elapsedTotal / SCENARIO_DURATION_MS);
  const activeScenario = FORGETFUL_SCENARIOS[absoluteScenarioIndex % FORGETFUL_SCENARIOS.length];
  const elapsedInActiveScenario = elapsedTotal - absoluteScenarioIndex * SCENARIO_DURATION_MS;
  const composerProgress = Math.min(1, Math.max(0, elapsedInActiveScenario / HUMAN_TYPING_MS));
  const composerVisibleChars = Math.floor(activeScenario.left.length * composerProgress);
  const composerText = activeScenario.left.slice(0, composerVisibleChars);
  const isComposerTyping = elapsedInActiveScenario < HUMAN_TYPING_MS;
  const agentResponseStart = HUMAN_TYPING_MS + AGENT_THINKING_MS;
  const firstVisibleScenarioIndex = Math.max(0, absoluteScenarioIndex - 8);
  const messages: Array<{
    key: string;
    role: "human" | "agent";
    text: string;
    isThinking: boolean;
  }> = [];

  for (let i = firstVisibleScenarioIndex; i <= absoluteScenarioIndex; i += 1) {
    const scenario = FORGETFUL_SCENARIOS[i % FORGETFUL_SCENARIOS.length];
    const elapsedInScenario = elapsedTotal - i * SCENARIO_DURATION_MS;
    if (elapsedInScenario < 0) continue;

    if (elapsedInScenario >= HUMAN_TYPING_MS) {
      messages.push({
        key: `human-${i}`,
        role: "human",
        text: scenario.left,
        isThinking: false,
      });

      const agentTypingProgress = Math.max(
        0,
        Math.min(1, (elapsedInScenario - agentResponseStart) / AGENT_TYPING_MS)
      );
      const agentVisibleChars = Math.floor(scenario.right.length * agentTypingProgress);
      const agentIsThinking = elapsedInScenario < agentResponseStart;

      messages.push({
        key: `agent-${i}`,
        role: "agent",
        text: scenario.right.slice(0, agentVisibleChars),
        isThinking: agentIsThinking,
      });
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="relative h-[360px] overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 p-3 shadow-[0_14px_50px_rgba(0,0,0,0.45)] dark:border-emerald-400/30 dark:from-slate-100 dark:via-slate-50 dark:to-white dark:shadow-[0_14px_50px_rgba(0,0,0,0.08)] md:h-[420px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.18),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.12),transparent_35%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.12),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.08),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(to_bottom,rgba(148,163,184,0.28)_1px,transparent_1px)] [background-size:100%_10px] dark:opacity-30 dark:[background-image:linear-gradient(to_bottom,rgba(100,116,139,0.2)_1px,transparent_1px)]" />
      <div className="relative flex h-full flex-col overflow-hidden rounded-lg border border-emerald-400/25 bg-slate-950/90 dark:border-emerald-500/30 dark:bg-white/95">
        <div className="flex shrink-0 items-center justify-between border-b border-emerald-400/20 px-3 py-2 text-[10px] uppercase tracking-wide text-emerald-200/70 dark:border-emerald-500/25 dark:text-emerald-800/90">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-400/75 dark:bg-rose-500/80" />
            <span className="h-2 w-2 rounded-full bg-amber-300/75 dark:bg-amber-500/80" />
            <span className="h-2 w-2 rounded-full bg-emerald-400/75 dark:bg-emerald-500/80" />
          </div>
          <span>agent session · deterministic mode</span>
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col justify-end gap-2 px-2 py-2 pb-2">
            {messages.map((message, index) => {
              const total = messages.length || 1;
              const age = total - 1 - index;
              const opacity = Math.max(0.22, 1 - age * 0.13);
              return (
                <div
                  key={message.key}
                  className={`flex ${message.role === "human" ? "justify-start" : "justify-end"}`}
                  style={{ opacity }}
                >
                  <div
                    className={`max-w-[88%] rounded-md border px-2.5 py-1.5 font-mono text-[11px] shadow-sm ${
                      message.role === "human"
                        ? "border-slate-600/80 bg-slate-900 text-slate-200 dark:border-slate-300 dark:bg-slate-200 dark:text-slate-800"
                        : "border-emerald-400/35 bg-emerald-500/10 text-emerald-100 dark:border-emerald-400/50 dark:bg-emerald-100 dark:text-emerald-900"
                    }`}
                  >
                    {message.isThinking ? (
                      <p className="flex items-center gap-1 leading-4 text-emerald-200/70 dark:text-emerald-600/90">
                        <span className="h-1 w-1 rounded-full bg-emerald-300/80 animate-bounce [animation-delay:0ms] dark:bg-emerald-600" />
                        <span className="h-1 w-1 rounded-full bg-emerald-300/80 animate-bounce [animation-delay:150ms] dark:bg-emerald-600" />
                        <span className="h-1 w-1 rounded-full bg-emerald-300/80 animate-bounce [animation-delay:300ms] dark:bg-emerald-600" />
                      </p>
                    ) : (
                      <p className="leading-4">
                        <span>{message.text || "\u00A0"}</span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-9 h-10 bg-gradient-to-b from-slate-950 to-transparent dark:from-white dark:to-transparent" />
        <div className="shrink-0 px-2 pb-2 pt-1">
          <div className="rounded-md border border-emerald-400/25 bg-slate-900/95 p-1.5 shadow-sm shadow-emerald-500/10 dark:border-emerald-400/40 dark:bg-slate-100/95 dark:shadow-emerald-500/15">
            <div className="flex h-8 items-center rounded border border-emerald-400/25 bg-slate-950 px-2 font-mono text-[11px] leading-4 text-emerald-100/90 dark:border-emerald-400/40 dark:bg-white dark:text-emerald-800">
              <span className="mr-1 text-emerald-300 dark:text-emerald-600">$</span>
              <span className={composerText ? "" : "text-emerald-300/45 dark:text-emerald-500/60"}>
                {composerText || "awaiting operator input..."}
              </span>
              {isComposerTyping ? (
                <span className="ml-0.5 inline-block w-[1px] animate-pulse text-emerald-300 dark:text-emerald-600">
                  |
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SitePage({ staticMode = false }: SitePageProps) {
  const functionalityRows = FUNCTIONALITY_MATRIX.flatMap((row) =>
    row.openapi
      .split(",")
      .map((endpoint) => endpoint.trim())
      .filter(Boolean)
      .map((endpoint, i) => {
        const spaceIdx = endpoint.indexOf(" ");
        const method = spaceIdx >= 0 ? endpoint.slice(0, spaceIdx) : "";
        const path = spaceIdx >= 0 ? endpoint.slice(spaceIdx + 1) : endpoint;
        return {
          key: `${row.functionality}-${i}-${endpoint}`,
          method,
          path,
          description: row.endpointDescriptions?.[i] ?? row.functionality,
          parameters: row.endpointParameters?.[i] ?? "—",
        };
      })
  );
  const [isMobile, setIsMobile] = useState(false);
  const [visibleGlossaryRows, setVisibleGlossaryRows] = useState(MOBILE_TABLE_ROWS_STEP);
  const [visibleFunctionalityRows, setVisibleFunctionalityRows] = useState(MOBILE_TABLE_ROWS_STEP);
  const [visibleMcpRows, setVisibleMcpRows] = useState(MOBILE_TABLE_ROWS_STEP);
  const [visibleCliRows, setVisibleCliRows] = useState(MOBILE_TABLE_ROWS_STEP);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncMobileState = () => setIsMobile(window.innerWidth <= 767);
    syncMobileState();
    window.addEventListener("resize", syncMobileState);
    window.visualViewport?.addEventListener("resize", syncMobileState);
    return () => {
      window.removeEventListener("resize", syncMobileState);
      window.visualViewport?.removeEventListener("resize", syncMobileState);
    };
  }, []);

  const glossaryVisibleCount = visibleGlossaryRows;
  const functionalityVisibleCount = visibleFunctionalityRows;
  const mcpVisibleCount = visibleMcpRows;
  const cliVisibleCount = visibleCliRows;

  return (
    <>
      {!staticMode ? <SeoHead routePath="/" /> : null}
      <div className="min-h-screen bg-background text-foreground">
        <main className="min-w-0">
          <div className="max-w-[52em] mx-auto px-4 py-10 md:py-16">
            <section className="relative left-1/2 right-1/2 -ml-[calc(50vw+1.5rem)] -mr-[calc(50vw+1.5rem)] md:-ml-[calc(50vw+2rem)] md:-mr-[calc(50vw+2rem)] -mt-16 md:-mt-24 w-[calc(100vw+3rem)] md:w-[calc(100vw+4rem)] min-h-[100svh] px-8 pt-0 pb-12 md:px-16 md:pt-0 md:pb-16 lg:px-24 lg:pt-0 lg:pb-20 flex flex-col justify-center">
              <div className="grid gap-2 md:gap-4 lg:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-center">
                <div className="p-16">
                  <h1
                    id="quick-start"
                    className="group scroll-mt-6 text-[28px] font-medium tracking-[-0.02em] mt-0 mb-2"
                  >
                    Your production agent is amnesiac.
                  </h1>
                  <p className="text-[17px] leading-7 mb-5 text-foreground/90 font-normal">
                    Deterministic, inspectable memory for long-running agents.
                  </p>

                  <div className="mb-5">
                    <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                      Without a memory invariant
                    </p>
                    <ul className="list-none pl-0 space-y-1">
                      <li className="text-[14px] leading-6 text-muted-foreground flex items-start gap-2">
                        <span className="text-rose-400 mt-0.5 shrink-0" aria-hidden="true">×</span>
                        Context drifts across sessions.
                      </li>
                      <li className="text-[14px] leading-6 text-muted-foreground flex items-start gap-2">
                        <span className="text-rose-400 mt-0.5 shrink-0" aria-hidden="true">×</span>
                        Facts conflict across tools.
                      </li>
                      <li className="text-[14px] leading-6 text-muted-foreground flex items-start gap-2">
                        <span className="text-rose-400 mt-0.5 shrink-0" aria-hidden="true">×</span>
                        Decisions execute without a reproducible trail.
                      </li>
                    </ul>
                  </div>

                  <div className="mb-5">
                    <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                      Neotoma makes memory
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {["Versioned", "Schema-bound", "Replayable", "Auditable"].map((tag) => (
                        <span
                          key={tag}
                          className="inline-block rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[13px] font-medium text-emerald-600 dark:text-emerald-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded border border-border bg-muted/50 px-4 py-3 mb-4">
                    <p className="text-[13px] leading-5 text-foreground/90 font-medium mb-0.5">
                      Invariant: Memory evolves deterministically.
                    </p>
                    <p className="text-[13px] leading-5 text-muted-foreground mb-0.5">
                      Every state change is versioned and replayable.
                    </p>
                    <p className="text-[13px] leading-5 text-muted-foreground/70">
                      No silent mutation. No implicit overwrite.
                    </p>
                  </div>

                  <p className="text-[13px] leading-5 text-muted-foreground/80 italic mb-5">
                    RAG retrieves documents. Neotoma enforces state evolution.
                  </p>

                  <p className="text-[13px] leading-5 text-muted-foreground mb-5">
                    For builders running long-lived agents in production.
                    {" "}Not for note-taking. Not for ad hoc prompts.
                  </p>

                  <p className="text-[13px] leading-5 text-muted-foreground mb-5">
                    5-minute integration. Fully reversible.
                    {" "}Works with Claude, Codex, and Cursor.
                  </p>

                  <div className="flex flex-wrap gap-3">
                    <a
                      href="https://github.com/markmhendrickson/neotoma?tab=readme-ov-file#neotoma-truth-layer-for-persistent-agent-memory"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-md border border-foreground bg-foreground px-4 py-2 text-[14px] font-medium text-background no-underline hover:bg-foreground/90 transition-colors"
                    >
                      View invariant + architecture
                    </a>
                    <a
                      href="#install"
                      className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                    >
                      Install in 5 minutes (reversible)
                    </a>
                  </div>
                </div>
                <div className="lg:px-6">
                  <ForgetfulAgentIllustration />
                </div>
              </div>
              <a
                href="#intro"
                className="absolute bottom-6 left-1/2 -translate-x-1/2 inline-flex flex-col items-center gap-1 text-muted-foreground no-underline hover:text-foreground transition"
                aria-label="Scroll to introduction"
              >
                <span className="text-[11px] uppercase tracking-wide">Scroll for more details</span>
                <ChevronDown className="h-5 w-5 animate-bounce" />
              </a>
            </section>

            <div className="rounded-lg border border-border bg-card p-4 md:p-5 mb-8">
              <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                Example
              </p>
              <p className="text-[14px] leading-6 text-foreground/90 font-mono">
                Agent updates contract owner →
                {" "}previous state versioned →
                {" "}conflict detected →
                {" "}timeline replayed →
                {" "}operator verifies change.
              </p>
            </div>

            <SectionDivider />

            <article id="intro" className="post-prose [&_a]:underline [&_a]:hover:text-foreground">
              <h2 className="text-[24px] font-medium tracking-[-0.02em] mb-4 mt-0">
                Neotoma is a memory correctness layer for persistent agent state
              </h2>
              <p className="text-[15px] leading-7 mb-4">
                What keeps breaking agent automation is not intelligence but state integrity:
                memory changes implicitly, context drifts, and there is no way to see what
                changed or replay it. When agents act on personal data, that data becomes state.
                The missing primitive is a correctness layer for explicit, inspectable, replayable state.
              </p>
              <p className="text-[15px] leading-7 mb-4">
                Neotoma is that layer. Open-source, privacy-protective, and user-controlled.
                Contract-first and deterministic (same input, same output). Immutable, queryable
                state in one graph for documents you upload and data agents write. You control what
                goes in; nothing updates memory implicitly.
              </p>
              <p className="text-[15px] leading-7 mb-4">
                It works with Cursor, Claude, and Codex via Model Context Protocol (MCP), and via
                CLI when MCP isn&apos;t available. Other apps and agentic systems can call the REST
                API directly. <a href="#install">Install with npm</a> below, then configure MCP for
                your editor or use the CLI.
              </p>
              <Alert className="mt-10 mb-12 rounded-lg border border-border bg-card p-6 md:p-8 text-foreground [&>svg]:left-6 [&>svg]:top-6 md:[&>svg]:left-8 md:[&>svg]:top-8 [&>svg~*]:pl-8 [&>svg]:text-muted-foreground">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <AlertTitle>Currently in developer release</AlertTitle>
                <AlertDescription className="text-[15px] leading-7 [&_a]:text-foreground [&_a]:underline [&_a]:hover:text-foreground/90">
                  Neotoma is in active, early development. Runs locally with CLI, MCP, and API with
                  tunnel support for remote access. Best for developers comfortable with early-stage
                  tooling and feedback. Not yet hardened for production; avoid storing highly
                  sensitive data.&nbsp;
                  <a
                    href="https://markmhendrickson.com/posts/neotoma-developer-release"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Read release post
                  </a>
                </AlertDescription>
              </Alert>
              <figure className="my-10 rounded overflow-hidden">
                <div className="bg-muted">
                  <img
                    src={SITE_METADATA.heroImageUrl}
                    alt="Neotoma: memory correctness layer for AI agents"
                    loading="eager"
                    className="block max-w-full h-auto"
                  />
                </div>
                <figcaption className="pt-3 text-[12px] text-muted-foreground">
                  <em>Neotoma</em> is named after the genus of packrats, known for collecting and
                  preserving material. Here it denotes a memory correctness layer for persistent agent state.
                </figcaption>
              </figure>

              <SectionDivider />
              <SectionHeading id="install">Install with npm</SectionHeading>
              <Tabs defaultValue="agent" className="mb-4">
                <TabsList className="mb-3">
                  <TabsTrigger value="agent">Agent</TabsTrigger>
                  <TabsTrigger value="human">Human</TabsTrigger>
                </TabsList>
                <TabsContent value="agent">
                  <p className="text-[15px] leading-7 mb-4">
                    If you want your assistant to handle setup, give it instructions like the prompt
                    below. This path starts with npm install, then init.
                  </p>
                  <CodeBlock code={SITE_CODE_SNIPPETS.agentInstallPrompt} staticMode={staticMode} />
                  <p className="text-[15px] leading-7 mb-4">
                    Prefer to run in a container? See{" "}
                    <a
                      href="#docker"
                      className="text-foreground underline underline-offset-2 hover:no-underline"
                    >
                      Run with Docker
                    </a>{" "}
                    for an agent-ready Docker prompt.
                  </p>
                  <p className="text-[15px] leading-7 mb-4">
                    During first-run onboarding, the agent should preview any personal data it can
                    already see from your in-session context or explicit tool outputs and ask for
                    confirmation before saving. See{" "}
                    <a
                      href="https://neotoma.io/agent-installation"
                      className="text-foreground underline underline-offset-2 hover:no-underline"
                    >
                      agent installation workflow
                    </a>{" "}
                    for the exact sequence.
                  </p>
                </TabsContent>
                <TabsContent value="human">
                  <CodeBlock code={SITE_CODE_SNIPPETS.installCommands} staticMode={staticMode} />
                  <p className="text-[15px] leading-7 mb-4">
                    Running <code>neotoma init</code> creates a local data folder where Neotoma
                    stores your memory, logs, and ingested files, keeps development and production
                    data separate, and writes a config file you can edit later if needed.
                  </p>
                  <p className="text-[15px] leading-7 mb-4">
                    Init will also connect Neotoma to your tools, saving CLI instructions and
                    configuring MCP servers for Claude, Claude, Codex and/or Cursor so agents use
                    MCP when available and fall back to the CLI.
                  </p>
                  <p className="text-[15px] leading-7 mb-4">
                    You don’t need to run the API server for normal MCP or CLI use. Run it only if
                    you want app-based access.
                  </p>
                  <CodeBlock
                    code={SITE_CODE_SNIPPETS.postInstallCommands}
                    staticMode={staticMode}
                  />
                  <p className="text-[15px] leading-7 mb-4">
                    Prefer to run in a container? See{" "}
                    <a
                      href="#docker"
                      className="text-foreground underline underline-offset-2 hover:no-underline"
                    >
                      Run with Docker
                    </a>{" "}
                  </p>
                </TabsContent>
              </Tabs>

              <SectionDivider />
              <SectionHeading id="get-started">Get started</SectionHeading>
              <p className="text-[15px] leading-7 mb-4">
                After installing Neotoma, run <code>neotoma init</code> and choose your client.
                Neotoma works with Claude, Claude Code, Cursor, and Codex today, with more tools
                coming. The steps are the same regardless of which one you pick.
              </p>
              <ol className="list-decimal pl-5 mb-2">
                <li className="text-[15px] leading-7 mt-2 first:mt-0">
                  Restart your tool so it picks up the new MCP configuration (for Claude Desktop and
                  Cursor) or start a new session (for Claude Code and Codex).
                </li>
                <li className="text-[15px] leading-7 mt-2 first:mt-0">
                  Tell the agent something like &quot;Remind me to review my subscription
                  Friday.&quot;
                </li>
                <li className="text-[15px] leading-7 mt-2 first:mt-0">
                  In the same conversation, ask it to list your open tasks. The one you just created
                  should appear.
                </li>
              </ol>
              <p className="text-[15px] leading-7 mt-4 mb-4">
                Behind the scenes the agent also stores the conversation itself and every turn you
                exchange, so the full thread is available as persistent, queryable memory the next
                time you or any connected tool needs it. Below, a screen recording shows the agent
                thinking and planning: breaking down a request into steps and using memory as it
                works.
              </p>
              <div className="my-6">
                <Dialog>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="w-full rounded-md border border-border overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-zoom-in"
                      aria-label="View screen recording full size"
                    >
                      <img
                        src={thinkingAndPlanningDemo}
                        alt="Screen recording: agent thinking and planning (sped up); click to view full size"
                        className="w-full block"
                      />
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] max-h-[95vh] w-max p-0 border-0 [&>div]:p-0 [&>div]:overflow-visible">
                    <DialogTitle className="sr-only">Screen recording full size</DialogTitle>
                    <img
                      src={thinkingAndPlanningDemo}
                      alt="Screen recording: agent thinking and planning (sped up)"
                      className="max-w-[95vw] max-h-[95vh] w-auto h-auto object-contain rounded-lg"
                    />
                  </DialogContent>
                </Dialog>
                <p className="mt-2 text-[13px] text-muted-foreground">Click to view full size</p>
              </div>

              <SectionDivider />
              <SectionHeading id="use-cases">Use cases</SectionHeading>
              <p className="text-[15px] leading-7 mb-4">
                Neotoma gives every connected AI tool a shared, persistent memory. Anything you
                store in one session is available in every other session and every other tool
                without re-explaining context. It&apos;s for AI-native individual operators,
                knowledge workers with scattered data, and builders of agentic systems. The table
                below shows what each needs and the kinds of data they ask Neotoma to remember.
              </p>
              <TableScrollWrapper
                className="my-6 md:rounded-lg md:bg-white dark:md:bg-transparent"
                showHint={!staticMode}
              >
                <table
                  className={`${RESPONSIVE_TABLE_CLASS} md:[&_th]:max-w-[23ch] md:[&_td]:max-w-[23ch] md:[&_th:first-child]:max-w-[17ch] md:[&_td:first-child]:max-w-[17ch] [&_th]:whitespace-normal [&_td]:whitespace-normal [&_td]:items-center [&_th]:!align-middle [&_td]:!align-middle md:[&_th]:!align-middle md:[&_td]:!align-middle`}
                >
                  <thead>
                    <tr>
                      <th className="min-w-[14ch] md:min-w-[14ch]">Who</th>
                      <th className="min-w-[22ch] md:min-w-[22ch]">What they need</th>
                      <th className="min-w-[26ch] md:min-w-[26ch]">Example data to remember</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td data-label="Who" className="font-medium">
                        AI-native individual operators
                      </td>
                      <td data-label="What they need">
                        Memory that follows them across Claude, Cursor, ChatGPT, and other daily
                        tools. Teams once data sharing is in place.
                      </td>
                      <td data-label="Example data">
                        Tasks, preferences, conversation history, personal notes, recurring
                        reminders, contacts, deadlines, follow-ups, saved snippets
                      </td>
                    </tr>
                    <tr>
                      <td data-label="Who" className="font-medium">
                        Knowledge workers with scattered data
                      </td>
                      <td data-label="What they need">
                        One place for context across documents and sessions that survives model
                        resets and tool switches
                      </td>
                      <td data-label="Example data">
                        Source documents, extracted entities, evidence chains, cross-document
                        relationships, citations, key quotes, timelines, personas
                      </td>
                    </tr>
                    <tr>
                      <td data-label="Who" className="font-medium">
                        Builders of agentic systems
                      </td>
                      <td data-label="What they need">
                        A structured memory layer agents can read and write with full provenance
                      </td>
                      <td data-label="Example data">
                        Past resolutions, session histories, accumulated facts, runbooks, decisions,
                        tool configs, error patterns, user intents
                      </td>
                    </tr>
                  </tbody>
                </table>
              </TableScrollWrapper>

              <SectionDivider />
              <SectionHeading id="terminology">Core terminology</SectionHeading>
              <TableScrollWrapper
                className="my-6 md:rounded-lg md:bg-white dark:md:bg-transparent"
                showHint={!staticMode}
              >
                <table className={RESPONSIVE_TABLE_CLASS}>
                  <thead>
                    <tr>
                      <th className="min-w-[14ch] md:min-w-[14ch]">Term</th>
                      <th className="min-w-[36ch] md:min-w-[36ch]">Definition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {GLOSSARY_ROWS.slice(0, glossaryVisibleCount).map((row) => (
                      <tr key={row.term}>
                        {!isMobile ? (
                          <td data-label="Term" className="font-medium">
                            {row.term}
                          </td>
                        ) : null}
                        <td data-label={row.term} className="align-top">
                          {row.definition}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScrollWrapper>
              {glossaryVisibleCount < GLOSSARY_ROWS.length ? (
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setVisibleGlossaryRows((prev) =>
                        Math.min(prev + MOBILE_TABLE_ROWS_STEP, GLOSSARY_ROWS.length)
                      )
                    }
                  >
                    Load more (
                    {Math.min(MOBILE_TABLE_ROWS_STEP, GLOSSARY_ROWS.length - glossaryVisibleCount)})
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleGlossaryRows(GLOSSARY_ROWS.length)}
                  >
                    Load all ({GLOSSARY_ROWS.length - glossaryVisibleCount})
                  </Button>
                </div>
              ) : null}

              <SectionDivider />
              <SectionHeading id="agent-instructions">Agent instructions</SectionHeading>
              <p className="text-[15px] leading-7 mb-4">
                Agents use Neotoma via MCP when it is installed and running, or via the CLI when MCP
                is not available. The same behaviors apply either way.
              </p>
              <p className="text-[15px] leading-7 mb-4">
                The instructions below are mandatory requirements for all agents using Neotoma. For
                the full text, see{" "}
                <a href="https://github.com/markmhendrickson/neotoma/blob/main/docs/developer/mcp/instructions.md">
                  MCP instructions
                </a>{" "}
                and{" "}
                <a href="https://github.com/markmhendrickson/neotoma/blob/main/docs/developer/cli_agent_instructions.md">
                  CLI agent instructions
                </a>
                .
              </p>
              <ul className="list-disc pl-5 mb-4">
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>Store first:</strong> Every turn, the agent persists the conversation and
                  current user message (plus any implied entities) in one store call before
                  responding. Responding before storing is forbidden.
                </li>
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>Retrieval before store:</strong> The agent runs bounded retrieval for
                  entities implied by the message and uses results when storing to link or reuse
                  existing records.
                </li>
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>Entity extraction:</strong> Facts from the message become stored entities
                  with descriptive types and fields; the message is linked to each extracted entity
                  (REFERS_TO).
                </li>
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>Proactive retrieval:</strong> After persistence, the agent runs bounded
                  retrieval when the prompt may depend on stored memory (targeted queries first,
                  expand only when needed).
                </li>
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>Attachments and images:</strong> Attachments are stored in the same
                  request and linked via EMBEDS. For screenshots or images, the agent extracts
                  visible entities (people, events, tasks, etc.) and stores them before responding.
                </li>
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>Tasks:</strong> When the user expresses intent, obligation, or future
                  action (&quot;I need to&quot;, &quot;remind me&quot;, deadlines), the agent
                  creates a task with due date when present and relates it to person or entity.
                </li>
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>External data (store-first):</strong> Data from other tools (email,
                  calendar, search) is stored in Neotoma before the agent responds; the agent does
                  not reply until storage is complete.
                </li>
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>User identity:</strong> When the user provides or implies their identity
                  (name, email, &quot;me&quot;), the agent stores them as contact or person in the
                  same turn.
                </li>
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>Conventions:</strong> The agent does not mention storage or linking unless
                  the user asked; when confirming something was stored, uses language like
                  &quot;remember&quot; or &quot;stored in memory.&quot; It checks for existing
                  records before storing to avoid duplicates.
                </li>
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>Report or fix bugs:</strong> When the agent sees a Neotoma error or you
                  describe a bug, it will suggest filing an issue on GitHub or, when it has access
                  to a clone or fork, contributing a fix via a fork and pull request.
                </li>
              </ul>

              <SectionDivider />
              <SectionHeading id="functionality">API and OpenAPI specification</SectionHeading>
              <p className="text-[15px] leading-7 mb-4">
                The Neotoma REST API is defined in the{" "}
                <a href="https://github.com/markmhendrickson/neotoma/blob/main/openapi.yaml">
                  OpenAPI spec
                </a>
                . The table below lists each endpoint and the capability it provides.
              </p>
              <div>
                <TableScrollWrapper
                  className="my-6 md:rounded-lg md:bg-white dark:md:bg-transparent"
                  showHint={!staticMode}
                >
                  <table className={RESPONSIVE_TABLE_CLASS}>
                    <thead>
                      <tr>
                        <th className="min-w-[8ch]">Method</th>
                        <th className="min-w-[28ch]">Endpoint</th>
                        <th className="min-w-[20ch]">Description</th>
                        <th className="min-w-[18ch]">Parameters</th>
                      </tr>
                    </thead>
                    <tbody>
                      {functionalityRows.slice(0, functionalityVisibleCount).map((row) => (
                        <tr key={row.key}>
                          <td data-label="Method" className="align-top">
                            <code className="text-[13px]">{row.method}</code>
                          </td>
                          <td data-label="Endpoint" className="align-top">
                            <code className="text-[13px] break-words whitespace-normal">
                              {row.path}
                            </code>
                          </td>
                          <td data-label="Description" className="align-top">
                            {row.description}
                          </td>
                          <td data-label="Parameters" className="align-top">
                            <code className="text-[13px] text-muted-foreground">
                              {row.parameters}
                            </code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScrollWrapper>
                {functionalityVisibleCount < functionalityRows.length ? (
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setVisibleFunctionalityRows((prev) =>
                          Math.min(prev + MOBILE_TABLE_ROWS_STEP, functionalityRows.length)
                        )
                      }
                    >
                      Load more (
                      {Math.min(
                        MOBILE_TABLE_ROWS_STEP,
                        functionalityRows.length - functionalityVisibleCount
                      )}
                      )
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setVisibleFunctionalityRows(functionalityRows.length)}
                    >
                      Load all ({functionalityRows.length - functionalityVisibleCount})
                    </Button>
                  </div>
                ) : null}
              </div>

              <SectionDivider />
              <SectionHeading id="configure-mcp">
                Model Context Protocol (MCP) server
              </SectionHeading>
              <p className="text-[15px] leading-7 mb-4">
                MCP actions are available once the server is running and the client is configured:
                Cursor (<code>.cursor/mcp.json</code>), Claude (<code>.mcp.json</code>), or Codex (
                <code>.codex/config.toml</code>). Use stdio for local usage, HTTP for remote or
                tunnel access.
              </p>
              <div>
                <TableScrollWrapper
                  className="my-6 md:rounded-lg md:bg-white dark:md:bg-transparent"
                  showHint={!staticMode}
                >
                  <table className={RESPONSIVE_TABLE_CLASS}>
                    <thead>
                      <tr>
                        <th className="min-w-[28ch]">Action</th>
                        <th className="min-w-[20ch]">Description</th>
                        <th className="min-w-[18ch]">Parameters</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MCP_ACTIONS_TABLE.slice(0, mcpVisibleCount).map((row, i) => (
                        <tr key={`${row.action}-${i}`}>
                          <td data-label="Action" className="align-top">
                            <code className="text-[13px] break-words whitespace-normal">
                              {row.action}
                            </code>
                          </td>
                          <td data-label="Description" className="align-top">
                            {row.description}
                          </td>
                          <td data-label="Parameters" className="align-top">
                            <code className="text-[13px] text-muted-foreground">
                              {row.parameters}
                            </code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScrollWrapper>
                {mcpVisibleCount < MCP_ACTIONS_TABLE.length ? (
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setVisibleMcpRows((prev) =>
                          Math.min(prev + MOBILE_TABLE_ROWS_STEP, MCP_ACTIONS_TABLE.length)
                        )
                      }
                    >
                      Load more (
                      {Math.min(MOBILE_TABLE_ROWS_STEP, MCP_ACTIONS_TABLE.length - mcpVisibleCount)}
                      )
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setVisibleMcpRows(MCP_ACTIONS_TABLE.length)}
                    >
                      Load all ({MCP_ACTIONS_TABLE.length - mcpVisibleCount})
                    </Button>
                  </div>
                ) : null}
              </div>

              <SectionDivider />
              <SectionHeading id="cli">Command-line interface (CLI)</SectionHeading>
              <p className="text-[15px] leading-7 mb-4">
                Use the CLI when MCP is not available. Run <code>neotoma</code> with no arguments
                for an interactive REPL (<code>neotoma&gt; </code> prompt).
              </p>
              <p className="text-[15px] leading-7 mb-4">
                Data commands (store, entities, relationships, etc.) are offline-first and run via
                in-process local transport by default. Use <code>--api-only</code> to require the
                API, or <code>--offline</code> to force local explicitly.
              </p>
              <p className="text-[15px] leading-7 mb-4">
                Every command is available as <code>neotoma &lt;subcommand&gt;</code> or{" "}
                <code>neotoma request --operation &lt;id&gt;</code>. See <code>neotoma --help</code>{" "}
                and subcommand help for usage.
              </p>
              <div>
                <TableScrollWrapper
                  className="my-6 md:rounded-lg md:bg-white dark:md:bg-transparent"
                  showHint={!staticMode}
                >
                  <table className={RESPONSIVE_TABLE_CLASS}>
                    <thead>
                      <tr>
                        <th className="min-w-[28ch]">Command</th>
                        <th className="min-w-[20ch]">Description</th>
                        <th className="min-w-[18ch]">Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CLI_COMMANDS_TABLE.slice(0, cliVisibleCount).map((row, i) => (
                        <tr key={`${row.command}-${i}`}>
                          <td data-label="Command" className="align-top">
                            <code className="text-[13px] break-words whitespace-normal">
                              {row.command}
                            </code>
                          </td>
                          <td data-label="Description" className="align-top">
                            {row.description}
                          </td>
                          <td data-label="Flags" className="align-top">
                            <code className="text-[13px] text-muted-foreground">
                              {row.parameters}
                            </code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScrollWrapper>
                {cliVisibleCount < CLI_COMMANDS_TABLE.length ? (
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setVisibleCliRows((prev) =>
                          Math.min(prev + MOBILE_TABLE_ROWS_STEP, CLI_COMMANDS_TABLE.length)
                        )
                      }
                    >
                      Load more (
                      {Math.min(
                        MOBILE_TABLE_ROWS_STEP,
                        CLI_COMMANDS_TABLE.length - cliVisibleCount
                      )}
                      )
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setVisibleCliRows(CLI_COMMANDS_TABLE.length)}
                    >
                      Load all ({CLI_COMMANDS_TABLE.length - cliVisibleCount})
                    </Button>
                  </div>
                ) : null}
              </div>

              <SectionDivider />
              <SectionHeading id="docker">Run with Docker</SectionHeading>
              <Tabs defaultValue="agent" className="mb-4">
                <TabsList className="mb-3">
                  <TabsTrigger value="agent">Agent</TabsTrigger>
                  <TabsTrigger value="human">Human</TabsTrigger>
                </TabsList>
                <TabsContent value="agent">
                  <p className="text-[15px] leading-7 mb-4">
                    If you want your assistant to handle Docker setup, use a prompt like this:
                  </p>
                  <CodeBlock code={SITE_CODE_SNIPPETS.dockerAgentPrompt} staticMode={staticMode} />
                </TabsContent>
                <TabsContent value="human">
                  <p className="text-[15px] leading-7 mb-4">
                    If you prefer not to install directly on your host machine, you can run the full
                    Neotoma stack&mdash;API server, CLI, and MCP server&mdash;inside a Docker
                    container. Clone the Neotoma repository and build the image:
                  </p>
                  <CodeBlock code={SITE_CODE_SNIPPETS.dockerBuild} staticMode={staticMode} />
                  <p className="text-[15px] leading-7 mb-4">
                    Start a container with a persistent volume so your data survives restarts:
                  </p>
                  <CodeBlock code={SITE_CODE_SNIPPETS.dockerRun} staticMode={staticMode} />
                  <p className="text-[15px] leading-7 mb-4">
                    Initialize the data directory inside the container:
                  </p>
                  <CodeBlock code={SITE_CODE_SNIPPETS.dockerInit} staticMode={staticMode} />

                  <h3 className="text-[16px] font-medium tracking-[-0.01em] mt-8 mb-2">
                    Connect MCP from Docker
                  </h3>
                  <p className="text-[15px] leading-7 mb-4">
                    To connect an MCP client (Cursor, Claude, Codex) to the containerized server,
                    add this to your MCP configuration. The client runs <code>docker exec</code> to
                    communicate with the MCP server over stdio:
                  </p>
                  <CodeBlock code={SITE_CODE_SNIPPETS.dockerMcpConfig} staticMode={staticMode} />

                  <h3 className="text-[16px] font-medium tracking-[-0.01em] mt-8 mb-2">
                    Use the CLI from Docker
                  </h3>
                  <p className="text-[15px] leading-7 mb-4">
                    The <code>neotoma</code> CLI is available inside the container. Prefix commands
                    with <code>docker exec</code>:
                  </p>
                  <CodeBlock code={SITE_CODE_SNIPPETS.dockerCliExample} staticMode={staticMode} />
                  <p className="text-[15px] leading-7 mb-4">
                    The API is also available at <code>http://localhost:3080</code> for direct HTTP
                    access.
                  </p>
                </TabsContent>
              </Tabs>

              <SectionDivider />
              <div className="rounded-lg p-6 md:p-8 -mx-4 px-4 md:-mx-8 md:px-8 mt-6 [&_h2]:!mt-0">
                <SectionHeading id="learn-more">Learn more</SectionHeading>
                <div className="flex flex-col gap-4 [&_a]:no-underline mt-4">
                  <LearnMoreCard key={LEARN_MORE_REPO_CARD.href} item={LEARN_MORE_REPO_CARD} />
                  {LEARN_MORE_POSTS.map((post) => (
                    <LearnMoreCard key={post.href} item={post} />
                  ))}
                </div>
              </div>
            </article>
          </div>
        </main>
      </div>
    </>
  );
}

export function SitePageStatic() {
  return <SitePage staticMode={true} />;
}
