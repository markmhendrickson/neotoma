import { IntegrationSection } from "./IntegrationSection";

interface IntegrationExtrasProps {
  toolName: string;
}

const BEFORE_AFTER_SCENARIOS: {
  question: string;
  without: string;
  withNeotoma: string;
}[] = [
  {
    question: "Continue where we left off yesterday.",
    without: "Resuming based on thread from two weeks ago.",
    withNeotoma:
      "Resuming yesterday\u2019s thread on the migration plan. 3 open tasks remaining.",
  },
  {
    question: "What did I commit to with Sarah last week?",
    without: "No commitments found.",
    withNeotoma:
      "You committed to sending the architecture doc by Friday. Sarah\u2019s email updated Mar 28.",
  },
  {
    question: "How much did we spend on cloud hosting last month?",
    without: "No hosting expenses found.",
    withNeotoma: "$847 across AWS and Vercel, up 12% from February.",
  },
];

const STARTER_COMMANDS = [
  {
    label: "Store a contact",
    command:
      "Remember that Sarah Chen's email is sarah@newstartup.io \u2014 she's the CTO at NewStartup.",
  },
  {
    label: "Store a task",
    command: "I need to send the architecture doc to Sarah by Friday.",
  },
  {
    label: "Recall across sessions",
    command:
      "What do I know about Sarah? What did I commit to doing for her?",
  },
];

const KNOWN_LIMITATIONS: { limitation: string; workaround: string }[] = [
  {
    limitation:
      "MCP tool calls may time out for very large stores (100+ entities in one call).",
    workaround: "Batch into groups of 20\u201350 entities per store call.",
  },
  {
    limitation: "Neotoma runs locally \u2014 data is not synced across machines by default.",
    workaround:
      "Use the remote HTTP transport or deploy Neotoma as a remote MCP server for multi-machine access.",
  },
  {
    limitation:
      "Schema evolution is additive. Removing fields requires a major version bump.",
    workaround:
      "Plan schemas with future fields in mind. Use flexible entity types for exploratory data.",
  },
];

export function IntegrationBeforeAfter({ toolName }: IntegrationExtrasProps) {
  return (
    <IntegrationSection
      sectionKey="before-after"
      title={`Before and after: ${toolName} with Neotoma`}
    >
      <div className="space-y-3">
        {BEFORE_AFTER_SCENARIOS.map((s) => (
          <div
            key={s.question}
            className="rounded-lg border border-border/60 bg-card/30 p-4 text-[14px] leading-6"
          >
            <p className="font-medium text-foreground mb-2">
              &ldquo;{s.question}&rdquo;
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wide text-rose-500 dark:text-rose-400">
                  Without Neotoma
                </span>
                <p className="text-muted-foreground mt-0.5">{s.without}</p>
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  With Neotoma
                </span>
                <p className="text-muted-foreground mt-0.5">{s.withNeotoma}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </IntegrationSection>
  );
}

export function IntegrationActivation({ toolName }: IntegrationExtrasProps) {
  return (
    <IntegrationSection
      sectionKey="after-you-connect"
      title="After you connect"
    >
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        Once Neotoma is running, try these starter commands in {toolName} to see
        cross-session memory in action:
      </p>
      <div className="space-y-2">
        {STARTER_COMMANDS.map((cmd) => (
          <div
            key={cmd.label}
            className="rounded-md border border-border/50 bg-muted/30 px-4 py-3"
          >
            <p className="text-[12px] font-mono uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-1">
              {cmd.label}
            </p>
            <p className="text-[14px] leading-6 text-foreground/80 italic">
              &ldquo;{cmd.command}&rdquo;
            </p>
          </div>
        ))}
      </div>
    </IntegrationSection>
  );
}

export function IntegrationLimitations() {
  return (
    <IntegrationSection
      sectionKey="known-limitations"
      title="Known limitations"
    >
      <div className="space-y-3">
        {KNOWN_LIMITATIONS.map((item) => (
          <div key={item.limitation} className="text-[14px] leading-6">
            <p className="text-foreground/80">{item.limitation}</p>
            <p className="text-muted-foreground mt-0.5">
              <span className="font-medium text-foreground/70">
                Workaround:
              </span>{" "}
              {item.workaround}
            </p>
          </div>
        ))}
      </div>
    </IntegrationSection>
  );
}
