/**
 * Marketing copy for the inspector home page. Mirrors the canonical strings
 * from `frontend/src/i18n/locales/home_body_en.ts` so the inspector can act as
 * the public marketing surface without coupling to the legacy `frontend/`
 * package. When the legacy site is fully deprecated this file becomes the
 * single source of truth.
 */

export const HOME_HERO = {
  headline: "Trustworthy state for AI agents",
  subheader:
    "Facts are stored privately under your control. Any agent can retrieve exactly what it needs, with full versioning and provenance.",
  chips: [
    { label: "local-first", anchor: "#faq-cloud" },
    { label: "deterministic", anchor: "#diff-rag" },
    { label: "cross-tool", anchor: "#diff-platform-memory" },
  ],
  ctas: {
    sandbox: { label: "Try the sandbox", href: "/sandbox/session/new" },
    install: { label: "Install in 5 minutes", href: "/docs/getting-started" },
    github: { label: "View on GitHub", href: "https://github.com/neotoma/neotoma" },
  },
} as const;

export const STATE_FLOW = {
  youTell: "You tell your agent",
  invoiceQuote: "“I've issued Acme a $3,200 invoice due Dec 15.”",
  storedLabel: "Stored as invoice",
  storedSub:
    "entity_type: invoice · amount: $3,200 · due_date: 2026-12-15 · status: unpaid · REFERS_TO company: Acme",
  youAskLater: "You ask any agent later",
  balanceQuote: "“What's my total outstanding balance?”",
  answerBold: "$16,302",
  answerRest: " from 4 unpaid invoices, 2 past due",
  answerFootnote: "Retrieved from stored invoices and relationships",
} as const;

export interface DifferentiatorCard {
  anchorId: string;
  vs: string;
  claim: string;
  faqAnchor: string;
}

export const DIFFERENTIATORS: DifferentiatorCard[] = [
  {
    anchorId: "diff-platform-memory",
    vs: "vs platform memory",
    claim: "Cross-tool. You own the bytes. Works alongside Claude, ChatGPT, and Cursor memory.",
    faqAnchor: "#faq-platform-memory",
  },
  {
    anchorId: "diff-rag",
    vs: "vs RAG / vector DBs",
    claim: "Structured facts with versioned history, not similarity-ranked text chunks.",
    faqAnchor: "#faq-rag",
  },
  {
    anchorId: "diff-diy-sqlite",
    vs: "vs DIY SQLite or JSON",
    claim: "Versioning, conflict detection, and schema evolution on day one.",
    faqAnchor: "#faq-sqlite",
  },
  {
    anchorId: "diff-cloud",
    vs: "vs cloud sync",
    claim: "Local-first by default. No telemetry. Your data never leaves your machine unless you say so.",
    faqAnchor: "#faq-cloud",
  },
];

export interface OutcomeScenario {
  category: string;
  failTitle: string;
  failDescription: string;
  successTitle: string;
  successDescription: string;
}

export const OUTCOME_SCENARIOS: OutcomeScenario[] = [
  {
    category: "Contacts & people",
    failTitle: "Silently overwritten, confidently wrong",
    failDescription:
      "You corrected a contact's email last week. A different agent session overwrote it with the old address. Your agent sends to the wrong person, and nobody notices until it's too late.",
    successTitle: "Every version preserved, corrections verified",
    successDescription:
      "Both the old and new email are preserved in versioned history. Your agent works from the verified current facts, and you can inspect exactly when and why each value changed.",
  },
  {
    category: "Tasks & commitments",
    failTitle: "Forgotten follow-up, dropped commitment",
    failDescription:
      "You said “I'll send that doc by Friday” in a call. No agent recorded it. By Monday, the commitment is gone — no reminder, no trace it existed.",
    successTitle: "Every commitment persisted, every session",
    successDescription:
      "Tasks and commitments are captured from conversation and stored with due dates and context. Your agent surfaces them before they slip — across sessions and tools.",
  },
  {
    category: "Financial data",
    failTitle: "Missing transaction, wrong balance",
    failDescription:
      "You asked about last month's spending. Your agent has no memory of the transactions you tracked two weeks ago in a different tool. You start over.",
    successTitle: "Versioned transactions, consistent totals",
    successDescription:
      "Every transaction is stored with full history and source tracking. Ask from any tool and the numbers match — no re-entry, no conflicting answers.",
  },
  {
    category: "Decisions & provenance",
    failTitle: "No trace of why the agent acted",
    failDescription:
      "Your agent posted a tweet, sent an email, or made a recommendation. When you ask why, there's no record of the reasoning or the data it used.",
    successTitle: "Full audit trail for every action",
    successDescription:
      "Every decision is stored with its inputs, reasoning, and the session that produced it. When you ask “why did you do that?”, the agent can show you exactly.",
  },
];

export interface Quote {
  text: string;
  attribution: string;
}

export const QUOTES: Quote[] = [
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
];
