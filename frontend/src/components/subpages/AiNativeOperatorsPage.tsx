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
      "You told Claude to track a deadline. Later you asked Cursor for open tasks. The deadline didn't exist because each tool maintains its own disposable context with no shared state.",
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
      "You updated a contact's email in one conversation. The next session used the old address because provider memory silently compressed or discarded the correction.",
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
      "You shared a receipt in a chat session. Weeks later, you needed it for an expense report. The AI had no record of it; conversation-scoped memory doesn't persist documents.",
    scenario: {
      left: "Find the Whole Foods receipt from Feb 8.",
      fail: "No receipts found matching that query.",
      succeed: "Whole Foods, Feb 8 ($47.32). Stored from conversation on Feb 8.",
    },
  },
  {
    category: "Events & commitments",
    Icon: CalendarClock,
    title: "Commitment forgotten between sessions",
    description:
      "You told your AI you'd follow up with a client by Thursday. By Wednesday, neither tool remembered; the commitment was locked in a prior session's expired context.",
    scenario: {
      left: "Do I have anything due this week?",
      fail: "Nothing scheduled.",
      succeed: "Follow up with Kenji re: proposal, due Thursday.",
    },
  },
];

export function AiNativeOperatorsPage() {
  return (
    <IcpDetailPage
      profile={profile}
      openingHook={
        <p>
          You run your work through Claude, Cursor, ChatGPT, and Codex. You've noticed that
          nothing your agent learns in one session is guaranteed to be there in the next, and
          when it gets something wrong, there's no way to correct it that sticks.
        </p>
      }
      outcomes={outcomes}
      aiNeeds={[
        { label: "Persistent memory that survives session resets and tool switches", href: "/memory-models#deterministic-memory", linkTerm: "Persistent memory" },
        { label: "A single source of truth accessible from Claude, Cursor, Codex, and ChatGPT simultaneously", href: "/cross-platform", linkTerm: "A single source of truth" },
        "Automatic extraction of commitments, tasks, and preferences from conversations",
        { label: "Corrections that actually stick: fix once, fixed everywhere", href: "/deterministic-state-evolution", linkTerm: "Corrections that actually stick" },
        { label: "Full provenance: every stored fact traces back to the conversation or document it came from", href: "/auditable-change-log", linkTerm: "Full provenance" },
      ]}
      deepPainPoints={[
        {
          heading: "Every session starts from scratch",
          body: (
            <p>
              You explain the same project context, preferences, and constraints in every new
              conversation. Provider-side memory is conversation-scoped at best; it doesn't follow
              you across tools, and it silently drifts as models compress or discard context.
            </p>
          ),
        },
        {
          heading: "Commitments vanish between tools",
          body: (
            <p>
              You tell Claude to remind you about a deadline. Later you ask Cursor for your open
              tasks. The deadline doesn't exist because each tool maintains its own disposable
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
              Your receipts, contacts, health information, and financial records live in
              provider-hosted memory. There is no transparency into retention, no guarantee against
              training use, and no delete button. The data most personal to you is stored in a
              system you don't control.
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
              Store a task in Claude and retrieve it from Cursor. State is shared, not siloed.
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
          heading: "Corrections that stick",
          icon: "RefreshCw",
          href: "/deterministic-state-evolution",
          body: (
            <p>
              Submit a correction once. It creates a new observation that supersedes the incorrect
              value. Same question, same answer, every time. The correction traces back to when
              and why it was made.
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
      whatChanges={
        <>
          <p>
            Without persistent state, you're the driver on every turn. Every prompt carries the
            full weight of what came before because the system won't hold it for you.
          </p>
          <p>
            With Neotoma underneath, the pattern shifts. The agent arrives at each session already
            knowing what it knew last time. Your role moves from composing detailed instructions to
            reviewing what the agent already knows and correcting when it's off.
          </p>
          <p>
            Less typing, fewer prompts, shorter sessions that accomplish more. You stop thinking
            about whether the system remembers and start thinking about what you're actually trying
            to do. Not "let me re-explain my situation"; "here's what changed since yesterday."
          </p>
        </>
      }
      dataTypeDetails={[
        { type: "conversation", description: "Persistent chat sessions with full turn history across tools" },
        { type: "message", description: "Individual conversation turns with role, content, and extracted entities" },
        { type: "task", description: "Commitments, reminders, and action items with status and deadlines" },
        { type: "note", description: "Captured thoughts, observations, and reference material" },
        { type: "contact", description: "People and their details (email, role, organization, preferences)" },
        { type: "event", description: "Calendar events, deadlines, and temporal commitments" },
        { type: "preference", description: "User preferences and configuration that persist across sessions" },
        { type: "receipt", description: "Purchase records, invoices, and expense tracking" },
      ]}
      scopeNote={
        <p>
          For one-off questions, quick summaries, or single-document analysis, your AI tools
          already work fine. Neotoma is for when you need what you told one tool to still be true
          when you open another, and for when you need to know that a correction you made
          actually stuck.
        </p>
      }
      credibilityBridge="Built by someone who runs every workflow (email, finance, content, tasks) through the same agentic stack."
      blogPostLink={{
        label: "Agentic retrieval infers. It doesn't guarantee.",
        href: "https://markmhendrickson.com/posts/agentic-search-and-the-truth-layer",
      }}
      closingStatement="Each ICP is currently spending a significant portion of their effort compensating for unreliable state. Neotoma doesn't add a feature; it removes the tax. What you get back is the time, attention, and confidence that the tax was consuming."
    />
  );
}
