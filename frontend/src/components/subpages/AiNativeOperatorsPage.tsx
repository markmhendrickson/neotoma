import { ICP_PROFILES } from "../../site/site_data";
import { IcpDetailPage } from "./IcpDetailPage";

const profile = ICP_PROFILES.find((p) => p.slug === "ai-native-operators")!;

export function AiNativeOperatorsPage() {
  return (
    <IcpDetailPage
      profile={profile}
      aiNeeds={[
        "Persistent memory that survives session resets and tool switches",
        "A single source of truth accessible from Claude, Cursor, Codex, and ChatGPT simultaneously",
        "Automatic extraction of commitments, tasks, and preferences from conversations",
        "Corrections that propagate deterministically — fix once, fixed everywhere",
        "Full provenance: every stored fact traces back to the conversation or document it came from",
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
      ]}
      solutions={[
        {
          heading: "Cross-tool persistent state via MCP",
          body: (
            <p>
              Every agent connected to Neotoma reads from and writes to the same memory substrate.
              Store a task in Claude — retrieve it from Cursor. State is shared, not siloed.
            </p>
          ),
        },
        {
          heading: "Automatic entity extraction every turn",
          body: (
            <p>
              The agent loop extracts people, tasks, events, preferences, and commitments from
              every conversation turn and persists them as versioned entities before responding.
            </p>
          ),
        },
        {
          heading: "Deterministic corrections with provenance",
          body: (
            <p>
              Submit a correction once. It creates a new observation that deterministically supersedes
              the incorrect value. The correction traces back to when and why it was made.
            </p>
          ),
        },
        {
          heading: "Full conversation replay",
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
      closingStatement="AI-native operators use more AI tools than anyone else — and feel the memory gap most acutely. Neotoma closes that gap with a deterministic memory layer that works across every tool you already use."
    />
  );
}
