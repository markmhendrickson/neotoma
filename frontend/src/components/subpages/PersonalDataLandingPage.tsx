import {
  Activity,
  Brain,
  CalendarClock,
  CreditCard,
  Dumbbell,
  FileText,
  Globe2,
  Heart,
  History,
  Layers,
  LineChart,
  Link2,
  Moon,
  Target,
  Terminal,
  TrendingUp,
  Upload,
  User,
  Wallet,
} from "lucide-react";
import { VerticalLandingShell, type VerticalConfig } from "./vertical_landing/VerticalLandingShell";

const CONFIG: VerticalConfig = {
  accentColor: "violet",
  badgeIcon: User,
  badgeText: "Neotoma for Personal Data",
  heroTitle: "Your personal data deserves",
  heroHighlight: "state integrity, not another dashboard",
  heroDesc:
    "You track workouts, spending, sleep, habits, and goals across a dozen apps. Your AI agents lose all of it between sessions. Neotoma gives your personal agents versioned, queryable memory that persists across every tool, with the same guarantees enterprises demand for their data.",
  heroTags: [
    { tag: "workout", Icon: Dumbbell },
    { tag: "transaction", Icon: CreditCard },
    { tag: "health_metric", Icon: Heart },
    { tag: "habit", Icon: Target },
    { tag: "goal", Icon: TrendingUp },
  ],
  analyticsPrefix: "personal_data",
  problemTitle: "Your life data is scattered. Your AI agents start from zero every session.",
  problemDesc:
    "Health metrics live in one app, finances in another, habits in a third. When you ask an AI agent about your progress, it either guesses or asks you to re-explain everything. And when it does get your data, it cannot tell you what changed, when, or why.",
  problemCards: [
    {
      Icon: History,
      title: "No cross-session memory",
      desc: "You told your AI about your workout split last month. Today it has no memory of it. You re-enter the same context every session across every tool.",
    },
    {
      Icon: Link2,
      title: "Siloed personal data",
      desc: "Sleep data in one app, exercise in another, spending in a third. No single agent can correlate your training volume with your sleep quality or your grocery spending.",
    },
    {
      Icon: Activity,
      title: "No progression tracking",
      desc: "You logged bench press at 225 lbs three months ago and 265 lbs today. But your AI cannot show the progression because it does not resolve the same exercise across sessions.",
    },
    {
      Icon: CalendarClock,
      title: "No temporal queries",
      desc: "What was your monthly spending when you decided to change jobs? What were your vitals when you started that new supplement? Your tools show current state, not historical state.",
    },
  ],
  problemCallout:
    "Dashboards show you charts. They cannot answer questions about your own history.",
  problemCalloutDesc:
    "The quantified-self promise was that tracking data would yield insight. Instead, data lives in app silos with no unified history, no entity resolution, and no way for an AI agent to reason about your life over time. Neotoma provides the memory layer that makes personal agents actually useful.",
  scenarios: [
    {
      category: "Exercise progression",
      human: "How has my bench press progressed over the last 3 months?",
      fail: "I don't have access to your workout history. Could you share your recent bench press numbers?",
      succeed:
        'Bench press progression (last 3 months): Jan 8: 225 lbs \u00D7 8 reps (workout\u00B7v12). Feb 2: 235 lbs \u00D7 8 reps (workout\u00B7v19). Feb 28: 245 lbs \u00D7 7 reps (workout\u00B7v28). Mar 20: 265 lbs \u00D7 6 reps (workout\u00B7v35). Trend: +40 lbs over 12 weeks (+17.8%). Volume peaked Feb 28 (5,145 lbs). Entity "Bench Press" resolved across 14 sessions with 3 name variants.',
      version: "workout\u00B7v35",
      Icon: Dumbbell,
      failTitle: "No memory of any workout you have ever logged",
      failDesc:
        "The agent has no persistent state. Every workout you mentioned in a previous session is gone. You would need to re-enter months of training data to get a simple progression answer.",
    },
    {
      category: "Financial awareness",
      human: "What was my monthly spending rate when I decided to buy the car in February?",
      fail: "I don't have your financial data. You could check your banking app for February spending.",
      succeed:
        "As of Feb 14 (decision date per goal\u00B7v8): trailing 3-month average spend was $4,280/mo. Largest categories: rent $1,850, groceries $620, dining $410. Savings rate: 28% of post-tax income. Cash reserve: $18,400 (4.3 months expenses). The car purchase ($22,500 on Feb 16, transaction\u00B7v41) reduced reserve to 0.9 months, flagged by budget agent Feb 17.",
      version: "transaction\u00B7v41 @ 2026-02-14",
      Icon: Wallet,
      failTitle: "Cannot reconstruct your financial state at decision time",
      failDesc:
        "Your banking app shows current balances. It cannot tell you what your spending rate, savings ratio, and cash reserve looked like on the day you committed to a major purchase.",
    },
    {
      category: "Health correlations",
      human: "How does my sleep quality correlate with heavy training days?",
      fail: "I'd need access to both your sleep and workout data to analyze that. Could you export your data?",
      succeed:
        "Across 47 training days (last 90 days): heavy sessions (\u22655 exercises, volume > 15,000 lbs) preceded by avg 7.2 hr sleep (health_metric\u00B7sleep). Light sessions preceded by avg 6.4 hr sleep. Post-heavy-session sleep averaged 7.6 hr with 12% more deep sleep. Worst training days (RPE \u2265 9) correlated with < 6 hr prior night (5 occurrences). Cross-entity query: workout \u00D7 health_metric \u00D7 47 temporal joins.",
      version: "health_metric\u00B7v89",
      Icon: Moon,
      failTitle: "Data exists in two apps that cannot talk to each other",
      failDesc:
        "Sleep is in one app, workouts in another. No agent can correlate them because neither app exposes versioned, queryable state to your AI tools.",
    },
    {
      category: "Habit and goal review",
      human: "Show me how my habits changed after I set the 'run a marathon' goal in January.",
      fail: "I don't have records of your goals or habits. When did you start training?",
      succeed:
        "Goal 'Run a marathon' created Jan 5 (goal\u00B7v1). Habit changes since: running frequency 2\u00D7/wk \u2192 4\u00D7/wk (habit\u00B7running\u00B7v3, Jan 12). Weekly mileage: 8 mi \u2192 26 mi over 11 weeks. Sleep target adjusted 10:30pm \u2192 10:00pm (habit\u00B7sleep\u00B7v2, Jan 8). Alcohol reduced from 4 drinks/wk to 1 (habit\u00B7alcohol\u00B7v2, Jan 15). Grocery spending +$85/mo (more protein, per transaction category analysis). All changes linked to goal\u00B7v1 via REFERS_TO.",
      version: "goal\u00B7v1 + 6 linked entities",
      Icon: Target,
      failTitle: "No record of your goal or the behavior changes it triggered",
      failDesc:
        "Your goal, the habit changes it inspired, and the downstream effects on spending and sleep are spread across multiple sessions and tools with no linking or history.",
    },
  ],
  outcomeTitle: "Same question, different answer",
  outcomeSubtitle: "Before / After",
  outcomeDesc:
    "Without a state integrity layer, your personal AI starts from zero every session. With Neotoma, it has your full history: versioned, linked, and temporally queryable.",
  howTitle: "A personal memory layer that never forgets, never hallucinates state",
  steps: [
    {
      Icon: Upload,
      title: "Observe",
      desc: "Workouts, transactions, sleep data, habits, and goals arrive as immutable observations from any tool: Claude, ChatGPT, Cursor, health apps, bank exports. Each carries a timestamp and source provenance.",
      detail: "Append-only. Every fact preserved with full lineage.",
    },
    {
      Icon: Brain,
      title: "Reduce",
      desc: "Neotoma resolves entities across sessions and tools. 'Bench Press', 'bench press', and 'Barbell Bench' become one entity. Conflicting data (two apps reporting different sleep times) is surfaced, not silently dropped.",
      detail: "Same observations + same rules = same state. Always.",
    },
    {
      Icon: Terminal,
      title: "Query",
      desc: "Ask any AI agent about your history and get answers grounded in versioned state. Temporal queries, cross-entity correlations, and progression tracking work because the data is structured, linked, and complete.",
      detail: "Temporal queries, entity resolution, cross-domain correlations.",
    },
  ],
  capTitle: "What your apps and dashboards cannot do",
  capSubtitle: "Capabilities",
  capDesc:
    "Fitness apps show today's stats. Budget apps show this month's totals. Neotoma gives your AI agents the full, versioned, cross-domain picture of your life data.",
  capabilities: [
    {
      Icon: LineChart,
      title: "Progression tracking with entity resolution",
      desc: "Track strength gains, spending trends, weight changes, and habit streaks over months. Entity resolution ensures 'Bench Press' in January and 'bench press (barbell)' in March are the same exercise.",
      tags: ["workout\u00B7v35", "entity\u00B7resolved"],
    },
    {
      Icon: History,
      title: "Temporal queries on your own life",
      desc: "Answer 'what was my financial state when I made that decision?' or 'what were my vitals when I started this supplement?' with exact historical snapshots, not today's numbers.",
      tags: ["transaction\u00B7v41 @ 2026-02-14", "replay"],
    },
    {
      Icon: Link2,
      title: "Cross-domain correlations",
      desc: "Correlate sleep quality with training performance, or spending patterns with habit changes. Neotoma links entities across domains so your agent can reason about your whole life, not just one silo.",
      tags: ["workout \u00D7 health_metric", "temporal\u00B7join"],
    },
    {
      Icon: FileText,
      title: "Full provenance for every data point",
      desc: "Every workout set, every transaction, every health reading traces to its source: which app, which session, which import. When data conflicts, you see both versions and their origins.",
      tags: ["provenance\u00B7chain", "source\u00B7linked"],
    },
  ],
  archHeadline: "Your agents talk to Neotoma. Your data stays yours.",
  archDesc:
    "Neotoma runs locally on your machine. Your AI agents (Claude, ChatGPT, Cursor) write observations via MCP; scripts and apps can use the HTTP API or CLI. The reducer computes versioned entity state. Any client can query your full personal history with temporal precision and provenance.",
  archConfig: {
    topLabel: "Your AI Agents",
    topDesc: "Claude, ChatGPT, Cursor, custom tools",
    interfaces: [
      { label: "MCP", Icon: Layers },
      { label: "HTTP API", Icon: Globe2 },
      { label: "CLI", Icon: Terminal },
    ],
    dataSources: ["Health Apps", "Bank Exports", "Habit Trackers"],
  },
  archSteps: [
    {
      label: "Observe",
      desc: "Workout logs, bank transactions, sleep data, and habit check-ins arrive as immutable observations from any connected tool or manual import.",
    },
    {
      label: "Reduce",
      desc: "Deterministic reducers resolve entities across sources and sessions. Conflicting inputs (two apps reporting different values) are surfaced, not silently merged.",
    },
    {
      label: "Serve",
      desc: "Query personal state via MCP, HTTP API, or CLI. Every response includes version metadata, temporal context, and a provenance chain to the source.",
    },
  ],
  caseStudy: {
    headline: "The personal agent stack: multiple tools, one versioned memory",
    desc:
      "AI-native individuals use multiple agents for thinking, research, and building with Neotoma as the shared memory layer underneath. Whether you use two tools or ten, every observation flows into the same versioned, queryable state.",
    featuresHeading: "What the personal agent stack does",
    features: [
      "Logs workouts, nutrition, and body metrics through conversational AI during or after sessions",
      "Tracks spending, income, and savings goals across banking and budgeting interactions",
      "Monitors sleep, energy, and health markers imported from wearables or manual entries",
      "Sets goals and habits that link to measurable outcomes across all personal data domains",
    ],
    guarantees: [
      "Every workout set, transaction, and health reading is a versioned entity with full observation history",
      "Entity resolution across tools so the same concept in different agents resolves to one entity",
      "Temporal queries answer 'what was my state on date X?' with the exact snapshot from that date",
      "Cross-domain queries correlate sleep with training, spending with habits, goals with outcomes",
    ],
    generalizesTitle: "Your data, your memory, your agents",
    generalizesDesc:
      "This is not a fitness app or a budgeting tool. It is a personal state integrity layer. Any data your AI agents observe about your life becomes versioned, queryable, and permanent. Replace 'workout' with 'recipe', 'reading list', 'medication', or 'home maintenance' and the guarantees are identical.",
  },
  ctaHeadline: "Give your personal agents",
  ctaHighlight: "a memory that lasts",
  ctaDesc:
    "Neotoma is open-source and runs locally. Your health, financial, and personal data stays on your machine with the same state integrity guarantees used in enterprise systems. Install in minutes.",
  ctaFeatures: [
    "Open-source",
    "Runs locally",
    "Cross-tool memory",
    "Schema-first extraction",
  ],
  agentLabel: "personal agent",
};

export function PersonalDataLandingPage() {
  return <VerticalLandingShell config={CONFIG} />;
}
