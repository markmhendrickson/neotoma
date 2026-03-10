import { ICP_PROFILES } from "../../site/site_data";
import { IcpDetailPage } from "./IcpDetailPage";

const profile = ICP_PROFILES[2];

export function FoundersTeamsPage() {
  return (
    <IcpDetailPage
      profile={profile}
      aiNeeds={[
        "Shared memory that every team member's AI tools can read from and write to",
        "Decision history with rationale that survives employee turnover",
        "Consistent AI responses regardless of which team member asks or which tool they use",
        "Onboarding acceleration — new hires query the team's institutional memory directly",
        "Action item tracking that persists across meetings, tools, and people",
      ]}
      deepPainPoints={[
        {
          heading: "Knowledge lives in people's heads, not systems",
          body: (
            <p>
              The founder knows the full context. The first engineer knows the technical rationale.
              The new hire knows neither. Context transfers happen through synchronous conversations
              that don't scale, or scattered Notion pages that fall out of date.
            </p>
          ),
        },
        {
          heading: "Different tools give different answers",
          body: (
            <p>
              One team member asks Claude about the project timeline and gets last month's plan.
              Another asks Cursor and gets the updated scope. Without shared state, AI tools
              reflect whatever partial context each person has provided — not ground truth.
            </p>
          ),
        },
        {
          heading: "Decisions vanish into Slack threads",
          body: (
            <p>
              Critical decisions get made in meetings, Slack, and ad-hoc conversations. Three
              months later, nobody remembers why a particular direction was chosen. There's no
              audit trail, no decision log that AI tools can reference, and no way to reconstruct
              the context.
            </p>
          ),
        },
      ]}
      solutions={[
        {
          heading: "Shared memory substrate across team tools",
          body: (
            <p>
              Every team member's AI tools — Claude, Cursor, Codex — connect to the same Neotoma
              instance. Context stored by one person is available to every other. No re-explaining.
            </p>
          ),
        },
        {
          heading: "Decision tracking with provenance",
          body: (
            <p>
              Decisions, goals, and rationale are extracted as entities with typed relationships
              linking them to the conversations and documents where they originated. Query "Why
              did we decide X?" and get the answer with source attribution.
            </p>
          ),
        },
        {
          heading: "Instant onboarding through queryable memory",
          body: (
            <p>
              New team members connect their AI tools to the team's Neotoma instance and
              immediately have access to the full decision history, project context, and
              institutional knowledge.
            </p>
          ),
        },
        {
          heading: "Consistent state across tools and people",
          body: (
            <p>
              Because every tool reads from one memory substrate, every team member gets the same
              ground truth. Updates propagate deterministically — no contradictory answers depending
              on who asks or which tool they use.
            </p>
          ),
        },
      ]}
      dataTypeDetails={[
        { type: "project", description: "Team projects with scope, status, milestones, and linked entities" },
        { type: "task", description: "Action items and commitments assigned across team members" },
        { type: "goal", description: "Team objectives with rationale, status, and linked decisions" },
        { type: "conversation", description: "Meeting notes, discussions, and decision-making sessions" },
        { type: "decision", description: "Recorded decisions with context, rationale, and linked alternatives" },
        { type: "contract", description: "Agreements, vendor relationships, and legal commitments" },
        { type: "company", description: "Partners, clients, vendors, and their relationship to the team" },
        { type: "product_spec", description: "Feature specifications, requirements, and design documents" },
      ]}
      closingStatement="Small teams can't afford knowledge loss. Neotoma gives your team shared institutional memory from day one — so context survives tool switches, employee turnover, and the chaos of early-stage growth."
    />
  );
}
