import { ListChecks, Users, Receipt, CalendarClock } from "lucide-react";
import { ICP_PROFILES } from "../../site/site_data";
import { IcpDetailPage } from "./IcpDetailPage";
import type { IcpOutcomeCard } from "./IcpDetailPage";
import { MdxSitePage } from "./MdxSitePage";

const profile = ICP_PROFILES.find((p) => p.slug === "operating")!;

const outcomes: IcpOutcomeCard[] = [
  {
    category: "Tasks",
    Icon: ListChecks,
    title: "Task created in Claude, invisible in Cursor",
    description:
      "You told Claude to track a deadline. Later you asked Cursor for open tasks. The deadline didn't exist - each tool keeps its own disposable context with no shared memory.",
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
      "You updated a contact's email in one conversation. The next session used the old address because the correction was silently lost.",
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
      "You shared a receipt in a chat. Weeks later you needed it for an expense report. Gone - conversation-scoped memory doesn't keep documents.",
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
      "You told your AI you'd follow up with a client by Thursday. By Wednesday, neither tool remembered - the commitment was locked in a prior session's expired context.",
    scenario: {
      left: "Do I have anything due this week?",
      fail: "Nothing scheduled.",
      succeed: "Follow up with Kenji re: proposal, due Thursday.",
    },
  },
];

export function AiNativeOperatorsPageBody() {
  return (
    <IcpDetailPage
      mdxShell
      profile={profile}
      openingHook={
        <p>
          You open Claude, Cursor, ChatGPT, or Codex to get work done. Nothing
          your agent learns in one session is guaranteed to be there in the next.
          When it gets something wrong, there's no way to correct it that sticks.
          You're the human sync layer between every tool. Neotoma gives you
          continuity so you can steer instead of drive.
        </p>
      }
      outcomes={outcomes}
      aiNeeds={[
        { label: "Memory that survives session resets and tool switches", href: "/memory-models#deterministic-memory", linkTerm: "Memory that survives" },
        { label: "One source of truth across Claude, Cursor, Codex, and ChatGPT", href: "/foundations#cross-platform", linkTerm: "One source of truth" },
        "Automatic extraction of commitments, tasks, and contacts from conversations",
        { label: "Corrections that stick: fix once, fixed everywhere", href: "/deterministic-state-evolution", linkTerm: "Corrections that stick" },
        { label: "Every stored fact traces back to where it came from", href: "/auditable-change-log", linkTerm: "Every stored fact traces back" },
      ]}
      deepPainPoints={[
        {
          heading: "Every session starts from scratch",
          body: (
            <p>
              You re-explain the same project context, preferences, and
              constraints in every new conversation. Memory doesn't follow you
              across tools, and it silently drifts as models compress or discard
              what you told them.
            </p>
          ),
        },
        {
          heading: "Commitments vanish between tools",
          body: (
            <p>
              You tell Claude to remind you about a deadline. Later you ask
              Cursor for open tasks. The deadline doesn't exist. Action items
              created in one session have no guarantee of surviving to the next.
            </p>
          ),
        },
        {
          heading: "Corrections don't persist",
          body: (
            <p>
              When your AI gets a date wrong, associates the wrong contact, or
              misidentifies something, you can't tell it "that's wrong" in a way
              that lasts. The mistake reappears next session.
            </p>
          ),
        },
        {
          heading: "Your data in someone else's memory",
          body: (
            <p>
              Your receipts, contacts, health information, and financial records
              live in provider-hosted memory. No transparency into retention, no
              guarantee against training use, no delete button.
            </p>
          ),
        },
      ]}
      solutions={[
        {
          heading: "Shared memory across every tool",
          icon: "Link2",
          href: "/foundations#cross-platform",
          body: (
            <p>
              Every agent connected to Neotoma reads from and writes to the same
              memory. Store a task in Claude, retrieve it from Cursor. One
              memory, not one per tool.
            </p>
          ),
        },
        {
          heading: "Facts extracted automatically every turn",
          icon: "Sparkles",
          body: (
            <p>
              People, tasks, events, preferences, and commitments are extracted
              from every conversation turn and stored before the agent responds.
            </p>
          ),
        },
        {
          heading: "Corrections that stick",
          icon: "RefreshCw",
          href: "/deterministic-state-evolution",
          body: (
            <p>
              Correct something once. The fix persists across every tool and
              session. Same question, same answer, every time.
            </p>
          ),
        },
        {
          heading: "Full history with provenance",
          icon: "History",
          href: "/versioned-history",
          body: (
            <p>
              Every conversation and fact is stored with its source. See what was
              known at any point in time and where each fact came from.
            </p>
          ),
        },
      ]}
      whatChanges={
        <>
          <p>
            Without persistent memory, you drive every turn. Every prompt carries
            the full weight of what came before because the system won't hold it
            for you.
          </p>
          <p>
            With Neotoma, the agent arrives at each session already knowing what
            it knew last time. Your role shifts from re-explaining your world to
            reviewing what the agent knows and correcting when it's off.
          </p>
          <p>
            Fewer prompts, shorter sessions, more done. Not "let me re-explain
            my situation" - "here's what changed since yesterday."
          </p>
        </>
      }
      dataTypeDetails={[
        { type: "conversation", description: "Chat sessions with full turn history across tools" },
        { type: "message", description: "Individual turns with role, content, and extracted facts" },
        { type: "task", description: "Commitments, reminders, and action items with status and deadlines" },
        { type: "note", description: "Captured thoughts, observations, and reference material" },
        { type: "contact", description: "People and their details (email, role, organization)" },
        { type: "event", description: "Calendar events, deadlines, and commitments" },
        { type: "preference", description: "Settings and preferences that persist across sessions" },
        { type: "receipt", description: "Purchase records, invoices, and expense tracking" },
      ]}
      scopeNote={
        <p>
          For one-off questions or single-document analysis, your AI tools
          already work fine. Neotoma is for when you need what you told one tool
          to still be true when you open another - and for knowing that a
          correction you made actually stuck.
        </p>
      }
      credibilityBridge="Built by someone who runs every workflow (email, finance, content, tasks) through the same multi-tool stack."
      blogPostLink={{
        label: "Agentic retrieval infers. It doesn't guarantee.",
        href: "https://markmhendrickson.com/posts/agentic-search-and-the-truth-layer",
      }}
      closingStatement="The tax is re-prompting, re-explaining, and manually syncing context between tools. Neotoma removes that tax and gives you back the attention and continuity it was consuming."
    />
  );
}

export function AiNativeOperatorsPage() {
  return <MdxSitePage canonicalPath="/operating" detailTitle={profile.shortName} />;
}
