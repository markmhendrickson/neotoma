import type { HomeBodyPack } from "@/i18n/locales/home_body_types";
import {
  CLI_DEMO_AGENTIC_SCENARIOS_EN,
  CLI_DEMO_API_SCENARIOS_EN,
  CLI_DEMO_CHAT_SCENARIOS_EN,
  CLI_DEMO_CLI_SCENARIOS_EN,
} from "@/i18n/locales/cli_demo_scenarios_en";

export const HOME_BODY_EN: HomeBodyPack = {
  outcomes: {
    kicker: "Before & after",
    heading: "Same question, different outcome",
    subtitle:
      "Without shared memory, agents act on facts they can't verify. With Neotoma, every response reads from versioned, structured history.",
    withoutNeotoma: "without Neotoma",
    withNeotoma: "with Neotoma",
    bridgeLabel: "with Neotoma",
  },
  guaranteePreviewCards: [
    {
      slug: "deterministic-state-evolution",
      property: "Deterministic state",
      failure:
        "You run the same pipeline twice and get different results — no way to trace why.",
      status: "guaranteed",
    },
    {
      slug: "versioned-history",
      property: "Versioned history",
      failure: "A retry silently overwrites a preference. The original is gone.",
      status: "guaranteed",
    },
    {
      slug: "auditable-change-log",
      property: "Auditable change log",
      failure: "Your agent makes a bad call. You can't trace what data it relied on.",
      status: "guaranteed",
    },
    {
      slug: "silent-mutation-risk",
      property: "Silent mutation prevention",
      failure: "Data changes without your knowledge. You find out when something breaks.",
      status: "prevented",
    },
    {
      slug: "schema-constraints",
      property: "Schema constraints",
      failure: "An agent writes a malformed record. Nothing rejects it — errors compound silently.",
      status: "guaranteed",
    },
    {
      slug: "reproducible-state-reconstruction",
      property: "Reproducible reconstruction",
      failure: "Your database corrupts. There's no path back to a known-good state.",
      status: "guaranteed",
    },
  ],
  guaranteeStatusLabels: { guaranteed: "Guaranteed", prevented: "Prevented" },
  faqPreview: [
    {
      q: "Platform memory (Claude, ChatGPT) is good enough - why add another tool?",
      a: "Platform memory stores what one vendor decides to remember, in a format you can't inspect or export. It doesn't version, doesn't detect conflicts, and vanishes if you switch tools. Neotoma gives you structured, cross-tool memory you control.",
    },
    {
      q: "Can't I just build this with SQLite or a JSON file?",
      a: "You can start there - many teams do. But you'll eventually need versioning, conflict detection, schema evolution, and cross-tool sync. That's months of infrastructure work. Neotoma ships those guarantees on day one.",
    },
    {
      q: "Is this production-ready?",
      a: "Neotoma is in developer preview — used daily by real agent workflows. The core guarantees (deterministic memory, versioned history, append-only change log) are stable. Install in 5 minutes and let your agent evaluate the fit.",
    },
    {
      q: "Does Neotoma replace Claude's memory or ChatGPT's?",
      a: "No — it works alongside them. Platform memory stores what one vendor decides to remember within that vendor's tool. Neotoma stores facts you control across all your tools. Keep using platform memory for quick context; use Neotoma when you need versioning, auditability, and cross-tool consistency.",
    },
    {
      q: "Does Neotoma send my data to the cloud?",
      a: "No. Neotoma runs locally by default. Your data stays on your machine in a local SQLite database. There is no cloud sync, no telemetry, and no training on your data unless you choose to expose the API (for example for remote MCP clients).",
    },
    {
      q: "What's the difference between RAG memory and deterministic memory?",
      a: "RAG stores text chunks and retrieves them by similarity. Neotoma stores structured facts and builds a versioned history for each one; the same inputs always produce the same result. RAG optimizes relevance; deterministic memory optimizes integrity, versioning, and auditability.",
    },
    {
      q: "Does the memory degrade or drift over time?",
      a: "No. Neotoma uses an append-only observation log with deterministic reducers. Nothing is overwritten or silently dropped. Facts stored six months ago are as retrievable and verifiable as facts stored today — with full version history and provenance intact. The memory compounds; it never decays.",
    },
  ],
  scenarios: [
    {
      left: "Use the new email I gave you for Sarah.",
      fail: "Sent to sarah@oldcompany.com.",
      succeed: "Sent to sarah@newstartup.io, updated Mar 28. Previous email preserved in v2.",
      version: "contact·v3",
    },
    {
      left: "What did I say I'd follow up on with Nick?",
      fail: "No follow-up items found.",
      succeed: "You committed to sending the architecture doc by Friday.",
      version: "task·v2",
    },
    {
      left: "How much did I spend on cloud hosting last month?",
      fail: "No hosting expenses found.",
      succeed: "$847 across AWS and Vercel, up 12% from February.",
      version: "transaction·v5",
    },
    {
      left: "Why did my agent post that tweet yesterday?",
      fail: "No record of a tweet action.",
      succeed: "Drafted from your content pipeline, approved in session #412.",
      version: "decision·v3",
    },
    {
      left: "Continue where we left off yesterday.",
      fail: "Resuming based on thread from two weeks ago.",
      succeed: "Resuming yesterday's thread on the migration plan.",
      version: "conversation·v7",
    },
    {
      left: "What did we originally agree with Acme Corp back in October?",
      fail: "No records from October found.",
      succeed:
        "Original terms from Oct 12: 18-month engagement, $4,200/mo, with a 90-day exit clause. Amended Jan 8 to $4,800/mo.",
      version: "contract·v3",
    },
    {
      left: "Which agent session updated my contact list?",
      fail: "No session history available.",
      succeed: "Session #389 in Cursor added 3 contacts from email triage.",
      version: "agent_session·v2",
    },
    {
      left: "Was the invoice from Acme Corp paid?",
      fail: "Unpaid as of Feb 2.",
      succeed: "Paid Feb 14 via Wise transfer.",
      version: "transaction·v3",
    },
    {
      left: "Show my open tasks across all projects.",
      fail: "Showing 18 open items.",
      succeed: "Showing 7 open items, 3 due this week.",
      version: "task·v5",
    },
    {
      left: "Send that update to Alex from the call last week.",
      fail: "No contact named Alex found.",
      succeed: "Sending to Alex Rivera, met at demo call Mar 24.",
      version: "contact·v4",
    },
    {
      left: "When's my next appointment this week?",
      fail: "No upcoming events found.",
      succeed: "Thursday 10am, dentist. Friday 4pm, call with Simon.",
      version: "event·v2",
    },
  ],
  outcomeCards: [
    {
      category: "Contacts & people",
      failTitle: "Silently overwritten, confidently wrong",
      failDescription:
        "You corrected a contact's email last week. A different agent session overwrote it with the old address. Your agent sends to the wrong person, and nobody notices until it's too late.",
      successTitle: "Every version preserved, corrections verified",
      successDescription:
        "Both the old and new email are preserved in versioned history. Your agent works from the verified current facts, and you can inspect exactly when and why each value changed.",
      scenarioIndex: 0,
    },
    {
      category: "Tasks & commitments",
      failTitle: "Forgotten follow-up, dropped commitment",
      failDescription:
        'You said "I\'ll send that doc by Friday" in a call. No agent recorded it. By Monday, the commitment is gone - no reminder, no trace it existed.',
      successTitle: "Every commitment persisted, every session",
      successDescription:
        "Tasks and commitments are captured from conversation and stored with due dates and context. Your agent surfaces them before they slip - across sessions and tools.",
      scenarioIndex: 1,
    },
    {
      category: "Financial data",
      failTitle: "Missing transaction, wrong balance",
      failDescription:
        "You asked about last month's spending. Your agent has no memory of the transactions you tracked two weeks ago in a different tool. You start over.",
      successTitle: "Versioned transactions, consistent totals",
      successDescription:
        "Every transaction is stored with full history and source tracking. Ask from any tool and the numbers match — no re-entry, no conflicting answers.",
      scenarioIndex: 2,
    },
    {
      category: "Decisions & provenance",
      failTitle: "No trace of why the agent acted",
      failDescription:
        "Your agent posted a tweet, sent an email, or made a recommendation. When you ask why, there's no record of the reasoning or the data it used.",
      successTitle: "Full audit trail for every action",
      successDescription:
        'Every decision is stored with its inputs, reasoning, and the session that produced it. When you ask "why did you do that?", the agent can show you exactly.',
      scenarioIndex: 3,
    },
  ],
  recordTypes: {
    kicker: "What to store",
    heading: "Not sure where to start?",
    headingAccent: "Pick three.",
    subtitle:
      "Your contacts, tasks, and events disappear between sessions and tools. Store them once, versioned and queryable across every agent you run, and stop re-explaining your world.",
    startHereBadge: "Start here",
    viewFullGuideCta: "View full guide",
    seeAllGuaranteesCta: "See all {count} guarantees compared",
    cards: [
      {
        label: "Contacts",
        description: "People, companies, roles, and the relationships between them.",
      },
      {
        label: "Tasks",
        description: "Obligations, deadlines, habits, and goals tracked across sessions.",
      },
      {
        label: "Events",
        description: "Meetings, milestones, and the outcomes attached to them.",
      },
      {
        label: "Transactions",
        description: "Payments, receipts, invoices, and ledger entries versioned instead of overwritten.",
      },
      {
        label: "Contracts",
        description: "Agreements, clauses, and amendments with the exact terms preserved over time.",
      },
      {
        label: "Decisions",
        description: "Choices, rationale, and the audit trail that proves why an agent acted.",
      },
    ],
  },
  who: {
    kicker: "Who this is for",
    titleLine1: "You run AI agents seriously...",
    titleLine2: "...and pay the tax for missing memory",
    subtitle:
      "The re-prompting wastes your time and tokens. The deeper risk is when your agent acts confidently on wrong facts, and you don't find out until the damage is done.",
    operatorConnector:
      "One operator, three modes. Different pain, same state layer.",
    calloutHeading: "Already building your own memory system?",
    calloutBodyBeforeLink: "Most developers start with SQLite, JSON, markdown, or a custom MCP server. Neotoma ships ",
    calloutLink: "the guarantees you'd otherwise build and maintain yourself",
    calloutBodyAfterLink: ": versioning, conflict detection, schema evolution, and cross-tool sync.",
    calloutNotForLead: "Not for ",
    calloutNotForLink: "one-off thought-partner workflows or note-taking apps",
    calloutNotForTrail: ".",
    icpCards: [
      {
        slug: "operating",
        modeLabel: "Cross-tool sync",
        name: "You're the context janitor between tools",
        tagline:
          "Every session starts from zero. You re-explain context, re-prompt corrections, re-establish what the agent already knew.",
        homepageTransition:
          "Stop acting as the human sync layer between tools. Start operating with continuity — steering instead of re-explaining.",
      },
      {
        slug: "building-pipelines",
        modeLabel: "Pipeline state",
        name: "You're babysitting inference variance",
        tagline:
          "Your agent guesses entities every run. Corrections don't persist. Regressions ship because the architecture can't prevent them.",
        homepageTransition:
          "Stop babysitting inference variance. Build on solid ground — state that stays corrected from run to run.",
      },
      {
        slug: "debugging-infrastructure",
        modeLabel: "Replay & debug",
        name: "You're the log archaeologist",
        tagline: "Two runs. Same inputs. Different state. No replay, no diff, no explanation.",
        homepageTransition:
          "Stop reverse-engineering truth from logs. Debug from replayable state you can inspect, diff, and trust.",
      },
    ],
  },
  demo: {
    kicker: "Product demo",
    title: "Inspect, version, diff, and replay what your agents remember",
    subtitle:
      "The same operations work from the CLI, the REST API, the Inspector app, or through any MCP-connected agent. Toggle between views to try each interface.",
  },
  guarantees: {
    kicker: "Guarantees",
    title: "Memory that stays correct from session one to month twelve",
    subtitle:
      "Chat memory fades. RAG drifts. Markdown and JSON files accumulate silent conflicts. Neotoma enforces versioning, provenance, and tamper detection that hold over months and years: not just between recent sessions.",
  },
  proof: {
    kicker: "How it's used",
    blockquote:
      "Running daily for 5+ months across Claude Code, Cursor, ChatGPT, and CLI. Same state graph from day one: every version preserved, every correction traceable. Contacts evolve, contracts get amended, tasks close and reopen. I ask my agents what changed on a deal since October or what I originally told an investor three months ago. The memory compounds; nothing silently drifts.",
    founderPhotoAlt: "Mark Hendrickson",
    founderName: "Mark Hendrickson",
    founderRole: "Neotoma creator",
    readFullPost: "Read the full post",
    statsContacts: "contacts",
    statsTasks: "tasks",
    statsConversations: "conversations",
    statsAgentMessages: "agent messages",
    statsEntityTypes: "entity types",
  },
  evaluate: {
    kicker: "Evaluate it",
    title: "Let your agent decide if Neotoma fits",
    subtitle:
      "Your agent can read the docs, inspect the evaluation criteria, and tell you whether Neotoma fits your actual workflow before you install anything.",
    promptHint:
      "Copy this prompt into any AI agent. It reads the evaluation page, inspects your context, and judges whether Neotoma fits.",
    homeEvaluatePrompt: `Read https://neotoma.io/evaluate. Use any tool, workspace, and chat context already available in this session to assess my real workflow. Avoid ad-hoc shell introspection just to profile me; if Neotoma is already installed, use \`neotoma doctor --json\` for status instead. Then tell me whether Neotoma fits my workflow, what data would be highest value to persist first, and what I should do next.`,
    evaluatePromptPill: "Evaluation prompt",
    evaluatePromptCardSubtitle:
      "Reads the page, then evaluates fit against your real workflow.",
    evaluatePromptCopy: "Copy",
    evaluatePromptCopied: "Copied",
    evaluatePromptCopyMobile: "Copy prompt",
    evaluatePromptIntroBeforeTarget: "Copy this prompt into ",
    evaluatePromptIntroBetweenTargetAndLink: " to have it read the ",
    evaluatePromptIntroLink: "evaluation page",
    evaluatePromptIntroAfterLink:
      ", inspect your tool, workspace, and configuration context, then judge whether Neotoma fits your real workflow and what to persist first.",
    evaluatePromptDefaultAgentTarget: "any AI agent",
  },
  commonQuestions: {
    moreQuestionsLink: "More questions? See the FAQ",
  },
  hero: {
    trustLine: "Trustworthy state for AI agents",
    releasesShipped: "releases shipped",
    heroStateCaption:
      "Facts are stored privately under your control. Any agent can retrieve exactly what it needs, with full versioning and provenance.",
    onGithubSuffix: " on GitHub",
    githubLabel: "GitHub",
  },
  stateFlow: {
    hero: {
      regionAriaLabel: "Example flow: tell an agent about an invoice, store structured state, ask another agent later, get a grounded answer",
      youTellProduct: "You tell OpenClaw",
      invoiceQuote: "\u201cI've issued Acme $3,200 invoice due Dec 15.\u201d",
      storedLabel: "Stored in invoices",
      storedSub:
        "entity_type: invoice \u00b7 amount: $3,200 \u00b7 due_date: 2026-12-15 \u00b7 status: unpaid \u00b7 REFERS_TO company: Acme",
      youAskProduct: "You ask Claude later",
      balanceQuote: "\u201cWhat's my total outstanding balance?\u201d",
      answerBold: "$16,302",
      answerRest: " from 4 unpaid invoices, 2 past due",
      answerFootnote: "Retrieved from stored invoices and relationships",
    },
    technical: {
      regionAriaLabel: "Neotoma state pipeline: source observations through snapshots to the memory graph",
      pipelineKicker: "neotoma state pipeline",
      layers: [
        { label: "Source", sub: "structured entities \u00b7 MCP \u00b7 CLI \u00b7 API" },
        { label: "Observations", sub: "granular facts + provenance" },
        { label: "Entity Snapshots", sub: "current truth \u00b7 versioned" },
        { label: "Memory Graph", sub: "entities \u00b7 relationships \u00b7 timeline" },
      ],
      operations: ["record", "reduce", "relate"] as const,
      replayHint: "\u21bb replay \u00b7 inspect any past state",
    },
  },
  cliDemo: {
    modeTabs: { chat: "Chat", cli: "CLI", mcp: "MCP", api: "API", inspector: "Inspector" },
    chatPlaceholder: "Ask anything...",
    playPause: { pauseLabel: "Pause demo", playLabel: "Play demo" },
    installCta: "Install in 5 minutes",
    chatScenarios: CLI_DEMO_CHAT_SCENARIOS_EN,
    cliScenarios: CLI_DEMO_CLI_SCENARIOS_EN,
    agenticScenarios: CLI_DEMO_AGENTIC_SCENARIOS_EN,
    apiScenarios: CLI_DEMO_API_SCENARIOS_EN,
  },
  agentToolChips: {
    ariaLabel: "AI agents and tools",
    worksWith: "Works with",
  },
  quotes: [
    { text: "State integrity, not retrieval quality.", attribution: "Agentic app builder" },
    {
      text: "Very relevant problem, most people rolling their own.",
      attribution: "Laurie Voss, npm co-founder",
    },
    {
      text: "Genuinely useful for production agents, overkill for hobbyist chatbots.",
      attribution: "Production agent evaluator",
    },
    {
      text: "CI/CD for agent state.",
      attribution: "Tycho Onnasch, co-founder, Zest Protocol",
    },
  ],
  sectionNavAria: {
    previous: "Go to previous section",
    next: "Go to next section",
    quoteDot: "Go to quote",
  },
};
