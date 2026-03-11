import { ListChecks, Users, Receipt, CalendarClock } from "lucide-react";
import { ICP_PROFILES } from "../../site/site_data";
import { IcpDetailPage } from "./IcpDetailPage";
import type { IcpOutcomeCard } from "./IcpDetailPage";

const profile = ICP_PROFILES.find((p) => p.slug === "ai-native-operators")!;

const outcomes: IcpOutcomeCard[] = [
  {
    category: "Tasks",
    Icon: ListChecks,
    title: "Task created in Claude, invisible in Cursor",
    description:
      "You told Claude to track a deadline. Later you asked Cursor for open tasks. The deadline didn't exist — each tool maintains its own disposable context with no shared state.",
    scenario: {
      left: "What are my open tasks?",
      fail: "No tasks found.",
      succeed: "3 open tasks. Next due: submit proposal by Friday.",
    },
  },
  {
    category: "People & contacts",
    Icon: Users,
    title: "Stale contact, wrong email sent",
    description:
      "You updated a contact's email in one conversation. The next session used the old address — because provider memory silently compressed or discarded the correction.",
    scenario: {
      left: "Email the latest draft to Priya.",
      fail: "Sent to priya@oldco.com.",
      succeed: "Sent to priya@newco.io.",
    },
  },
  {
    category: "Financial records",
    Icon: Receipt,
    title: "Receipt stored, then lost",
    description:
      "You shared a receipt in a chat session. Weeks later, you needed it for an expense report. The AI had no record of it — conversation-scoped memory doesn't persist documents.",
    scenario: {
      left: "Find the Whole Foods receipt from Feb 8.",
      fail: "No receipts found matching that query.",
      succeed: "Whole Foods, Feb 8 — $47.32. Stored from conversation on Feb 8.",
    },
  },
  {
    category: "Events & commitments",
    Icon: CalendarClock,
    title: "Commitment forgotten between sessions",
    description:
      "You told your AI you'd follow up with a client by Thursday. By Wednesday, neither tool remembered — the commitment was locked in a prior session's expired context.",
    scenario: {
      left: "Do I have anything due this week?",
      fail: "Nothing scheduled.",
      succeed: "Follow up with Kenji re: proposal — due Thursday.",
    },
  },
];

export function AiNativeOperatorsPage() {
  return (
    <IcpDetailPage
      profile={profile}
      outcomes={outcomes}
      aiNeeds={[
        { label: "Persistent memory that survives session resets and tool switches", href: "/memory-models#deterministic-memory", linkTerm: "Persistent memory" },
        { label: "A single source of truth accessible from Claude, Cursor, Codex, and ChatGPT simultaneously", href: "/cross-platform", linkTerm: "A single source of truth" },
        "Automatic extraction of commitments, tasks, and preferences from conversations",
        { label: "Corrections that propagate deterministically — fix once, fixed everywhere", href: "/deterministic-state-evolution", linkTerm: "Corrections that propagate deterministically" },
        { label: "Full provenance: every stored fact traces back to the conversation or document it came from", href: "/auditable-change-log", linkTerm: "Full provenance" },
      ]}
      deepPainPoints={[
        {
          heading: "Every session starts from scratch",
          body: (
            <p>
              You explain the same project context, preferences, and constraints in every new
              conversation. Provider-side memory is conversation-scoped at best — it doesn't follow
              you across tools, and it silently drifts as models compress or discard context.
            </p>
          ),
        },
        {
          heading: "Commitments vanish between tools",
          body: (
            <p>
              You tell Claude to remind you about a deadline. Later you ask Cursor for your open
              tasks. The deadline doesn't exist — because each tool maintains its own disposable
              context. Action items created in one session have no guarantee of surviving to the
              next.
            </p>
          ),
        },
        {
          heading: "No way to correct what the agent got wrong",
          body: (
            <p>
              When an AI tool extracts the wrong date, associates the wrong contact, or misidentifies
              an entity, there's no correction mechanism. You can't tell the system "that's wrong"
              in a way that persists. The mistake reappears next time.
            </p>
          ),
        },
        {
          heading: "Your personal data in someone else's memory",
          body: (
            <p>
              Receipts, contacts, health information, financial records — provider-hosted memory
              ingests everything with no transparency into retention, training use, or who can
              access it. There is no export button. There is no deletion guarantee. Your most
              personal context lives in a system you don't control.
            </p>
          ),
        },
      ]}
      solutions={[
        {
          heading: "Cross-tool persistent state via MCP",
          icon: "Link2",
          href: "/cross-platform",
          body: (
            <p>
              Every agent connected to Neotoma reads from and writes to the same memory substrate.
              Store a task in Claude — retrieve it from Cursor. State is shared, not siloed.
            </p>
          ),
        },
        {
          heading: "Automatic entity extraction every turn",
          icon: "Sparkles",
          body: (
            <p>
              The agent loop extracts people, tasks, events, preferences, and commitments from
              every conversation turn and persists them as versioned entities before responding.
            </p>
          ),
        },
        {
          heading: "Deterministic corrections with provenance",
          icon: "RefreshCw",
          href: "/deterministic-state-evolution",
          body: (
            <p>
              Submit a correction once. It creates a new observation that deterministically supersedes
              the incorrect value. The correction traces back to when and why it was made.
            </p>
          ),
        },
        {
          heading: "Full conversation replay",
          icon: "History",
          href: "/versioned-history",
          body: (
            <p>
              Every conversation and turn is stored with provenance. Inspect what was known at
              any point in time. Diff state across versions.
            </p>
          ),
        },
      ]}
      dataTypeDetails={[
        { type: "conversation", description: "Persistent chat sessions with full turn history across tools" },
        { type: "message", description: "Individual conversation turns with role, content, and extracted entities" },
        { type: "task", description: "Commitments, reminders, and action items with status and deadlines" },
        { type: "note", description: "Captured thoughts, observations, and reference material" },
        { type: "contact", description: "People and their details — email, role, organization, preferences" },
        { type: "event", description: "Calendar events, deadlines, and temporal commitments" },
        { type: "preference", description: "User preferences and configuration that persist across sessions" },
        { type: "receipt", description: "Purchase records, invoices, and expense tracking" },
      ]}
      closingStatement="You use more AI tools than anyone — and feel the memory gap most acutely. Neotoma closes that gap with a deterministic memory layer that works across every tool you already use."
    />
  );
}
