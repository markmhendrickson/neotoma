import {
  AlertTriangle,
  BookOpen,
  Briefcase,
  ClipboardCheck,
  Database,
  DollarSign,
  Eye,
  Globe2,
  History,
  Layers,
  LineChart,
  Link2,
  Network,
  PieChart,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { MdxSitePage } from "./MdxSitePage";
import { UseCaseLandingShell, type UseCaseConfig } from "./use_case_landing/UseCaseLandingShell";

const CONFIG: UseCaseConfig = {
  accentColor: "violet",
  badgeIcon: PieChart,
  badgeText: "Neotoma for Portfolio Monitoring",
  heroTitle: "Portfolio intelligence that survives",
  heroHighlight: "marks, milestones, and every board narrative",
  heroDesc:
    "Portfolio state shifts daily with new marks, board materials, and cap table events. Neotoma versions every entity so LP reports and IC decisions reference the state as recorded by quarter end or follow-on, not today's dashboard.",
  heroTags: [
    { tag: "portfolio company", Icon: Briefcase },
    { tag: "investment", Icon: TrendingUp },
    { tag: "valuation", Icon: DollarSign },
    { tag: "milestone", Icon: Target },
    { tag: "board update", Icon: BookOpen },
    { tag: "LP commitment", Icon: Users },
  ],
  heroFeatures: ["Open-source", "Privacy-first", "Team deployment", "No vendor lock-in"],
  analyticsPrefix: "portfolio",
  problemTitle: 'Portfolio systems optimize for "now"; IC and LPs ask for the record by a date',
  problemDesc:
    "Valuations refresh, cap tables rebalance, and board decks contradict market data. Follow-on decisions need the mark that justified the wire. LP reporting and fund audits need the portfolio exactly as recorded by quarter end, not reconstructed from email attachments.",
  problemCards: [
    {
      Icon: History,
      title: "No authoritative record by date",
      desc: "Spreadsheets and BI tools show today's roll-up. Teams cannot replay the ownership, basis, and last approved valuation recorded by the day the IC signed the follow-on, or by June 30 for the LP letter.",
    },
    {
      Icon: Eye,
      title: "Latest mark hides decision context",
      desc: "A new comp-driven mark overwrites narrative in Slack. When partners ask what valuation backed the August wire, only the November refresh remains visible.",
    },
    {
      Icon: ClipboardCheck,
      title: 'LP packs built from accidental "now"',
      desc: "Analysts pull cap tables the morning after a SAFE conversion. The Q2 deck ships with July dilution baked in because nothing pins entities to quarter close.",
    },
    {
      Icon: AlertTriangle,
      title: "Conflicting signals collapse to one story",
      desc: 'Board materials stay bullish while external comps turn cautious. Tools that keep a single "outlook" field drop the tension auditors and partners need to see preserved.',
    },
  ],
  problemCallout:
    "LP reporting and fund audits require temporal snapshots, not a live feed mislabeled as history.",
  problemCalloutDesc:
    "When counsel or the admin asks what the portfolio looked like on March 31, answering with whatever the CRM shows today fails LP agreements and audit sampling. You need investment- and company-level state tied to observation time.",
  scenarios: [
    {
      category: "Valuation intelligence",
      human:
        "What was Northstar Analytics's last board-approved pre-money valuation when Meridian Growth Fund IV approved the $4.2M follow-on on August 14, 2024?",
      fail: "Northstar Analytics: last mark $210M post (Nov 2025 comp refresh); fully diluted cap table reflects the Oct 2025 secondaries block.",
      succeed:
        "IC memo Aug 14, 2024 (Meridian Growth Fund IV): follow-on $4.2M on $118M post, implied pre-money $113.8M per valuation obs linked to investment meridian_ns_series_b_plus\u00B7v3 and portfolio_co\u00B7v14 snapshot @ 2024-08-14. Nov 2025 mark is a separate observation; the assistant returned the figure recorded by then that backed the wire, not today's comp.",
      version: "portfolio_co\u00B7v14",
      Icon: DollarSign,
      failTitle: "Current mark returned, follow-on context missing",
      failDesc:
        "The assistant echoed the latest post-money from the comp cycle. IC and risk teams cannot reconstruct why the follow-on cleared at that price.",
    },
    {
      category: "LP reporting",
      human:
        "For Aurora Capital Partners II's Q2 2025 quarterly letter, what had we recorded for our fully diluted ownership and cost basis in CloudVector by June 30, 2025?",
      fail: "CloudVector: 17.1% fully diluted, $11.4M cost basis. Reflects the July 8, 2025 SAFE conversion and updated option pool.",
      succeed:
        "As recorded by 2025-06-30 23:59 UTC (portfolio_state\u00B7q2-2025): 18.4% FD, $12.1M invested basis, last mark 1.35x per valuation memo VAL-CV-2025-Q2. The July SAFE and pool refresh were written after that cutoff, so they are not in this snapshot.",
      version: "portfolio_state\u00B7q2-2025",
      Icon: PieChart,
      failTitle: "Today's cap table substituted for quarter end",
      failDesc:
        "LPs and the fund admin expect the picture recorded by June 30. Surfacing July dilution makes IRR and ownership tables wrong for the signed quarterly.",
    },
    {
      category: "Milestone tracking",
      human:
        "Which revenue and security milestones had been recorded for Helio Robotics by the time the Series B term sheet arrived, March 3, 2025?",
      fail: "Helio Robotics: ARR $9.2M (Aug 2025), SOC2 Type II complete, 42 enterprise logos, EU entity live. Aligned with current fundraising narrative.",
      succeed:
        "As recorded by 2025-03-03: ARR crossed $4.0M (obs Jan 18, 2025), SOC2 Type II in progress (completion was recorded in Apr 2025, after the cutoff), 9 enterprise logos (not 42), no EU entity recorded. Series B term sheet snapshot milestone_ms\u00B7pre_b shows only achievements with observation timestamps before Mar 3. Full timeline preserved for diligence.",
      version: "milestone_ms\u00B7pre_b",
      Icon: Target,
      failTitle: "Post-deal milestones mixed into pre-term-sheet question",
      failDesc:
        "The assistant blended later achievements into the story of what had been recorded at term sheet. That misstates representation risk.",
    },
    {
      category: "Conflicting signals",
      human:
        "For Relay API, how did the March 2025 board deck and the April 2025 external comp packet characterize 2025 revenue outlook?",
      fail: 'Relay API 2025 outlook: "Cautious. Sector multiples compressed 22% QoQ; plan to 40% YoY growth under review." (single consolidated field from latest analyst note)',
      succeed:
        'Two preserved observations: (1) Board deck Mar 12, 2025: management forecast "re-acceleration to 85% YoY" with pipeline coverage 3.1x. (2) External comp packet Apr 4, 2025: median SaaS forward multiple down 22% QoQ; footnote flags Relay peer group dispersion. Neotoma retains both outlook_board\u00B7v2 and outlook_market\u00B7v1 without last-write-wins collapse.',
      version: "outlook_relay\u00B7dual",
      Icon: AlertTriangle,
      failTitle: "Only the latest narrative survives",
      failDesc:
        "Investment committees need the tension between board optimism and market caution. Dropping the board view in favor of the newest PDF loses that record.",
    },
  ],
  outcomeTitle: "From rolling dashboards to defensible portfolio state",
  outcomeSubtitle: "Before and after Neotoma",
  outcomeDesc:
    "Each scenario pairs the same question with two outcomes: one where only the latest valuation or narrative is visible, and one where investments, companies, and milestones stay queryable in time.",
  howTitle: "How Neotoma hardens portfolio operations",
  steps: [
    {
      Icon: Database,
      title: "Ingest every portfolio touch as an observation",
      desc: "Board decks, IC memos, Carta exports, analyst marks, LP notices, and agent summaries become structured observations on company, investment, valuation, milestone, and commitment entities. Nothing overwrites prior state.",
      detail: "Immutable history by default. Quarter-end and IC dates are first-class query axes.",
    },
    {
      Icon: Layers,
      title: "Project ownership and marks through time",
      desc: "Cap table events, follow-on wires, and valuation memos chain with supersession where appropriate. Reconstruct fully diluted ownership and last approved mark for any close date the fund names.",
      detail: "Temporal queries return the state as recorded by the cutoff time, not the last ETL run.",
    },
    {
      Icon: Search,
      title: "Let agents answer with provenance",
      desc: "Portfolio and IR agents read the same versioned graph. Responses cite observation IDs, memo dates, and snapshot keys so partners can defend answers to LPs and auditors.",
      detail: "Built for fund audits: which mark, which board pack, which quarter close.",
    },
  ],
  capTitle: "Capabilities built for VC, PE, and asset allocators",
  capSubtitle: "What you can ship",
  capDesc:
    "Model the entities your CRM and cap-table tools already imply, then add the integrity layer missing from file- and row-centric workflows: lineage across marks, milestones, and narratives.",
  capabilities: [
    {
      Icon: LineChart,
      title: "Valuation & ownership as recorded",
      desc: "Bind follow-on decisions and LP letters to valuation and cap-table snapshots. Show implied pre- and post-money as recorded by the wire, not after the next comp cycle.",
      tags: ["valuation", "investment", "temporal"],
    },
    {
      Icon: PieChart,
      title: "Quarter-end and IC snapshots",
      desc: "Freeze portfolio state for any fund-defined close: basis, ownership, marks, and commitments as recorded by that close, not as later writes changed them.",
      tags: ["LP", "reporting", "audit"],
    },
    {
      Icon: Target,
      title: "Milestone chronology for diligence",
      desc: 'Answer "what had been recorded before term sheet?" with ordered achievements and evidence links. Separate pre-close facts from post-close operating metrics.',
      tags: ["milestone", "diligence", "Series B"],
    },
    {
      Icon: ShieldCheck,
      title: "Multi-source narrative integrity",
      desc: 'Retain board outlook, management forecast, and external comp signals as distinct observations. No forced merge into a single "sentiment" field.',
      tags: ["board", "market", "governance"],
    },
    {
      Icon: Network,
      title: "Fund- and deal-level graph",
      desc: "Relate investments to companies, follow-ons, syndicate partners, and LP commitments. Traverse from a single company to every fund position and mark that touched it.",
      tags: ["portfolio", "graph", "syndicate"],
    },
    {
      Icon: ClipboardCheck,
      title: "Audit-oriented exports",
      desc: "Generate structured trails for fund admins: snapshot IDs, observation timestamps, and valuation memo references in one graph suitable for sampling.",
      tags: ["audit", "export", "compliance"],
    },
  ],
  archHeadline: "Neotoma sits beneath your IR stack and agent mesh",
  archDesc:
    "Keep Carta, Affinity, and your data room as systems of capture. Neotoma is the integrity layer that remembers every mark, milestone, and board narrative those tools were not designed to retain as unified, queryable state across funds and vintages.",
  archConfig: {
    topLabel: "Portfolio operations plane",
    topDesc:
      "Humans and agents emit observations; Neotoma reduces them to authoritative snapshots for companies, investments, valuations, milestones, board updates, and LP commitments.",
    interfaces: [
      { label: "MCP tools", Icon: Link2 },
      { label: "HTTP API", Icon: Globe2 },
      { label: "CLI & automations", Icon: Zap },
    ],
    dataSources: [
      "Carta / Cap-table and 409A exports",
      "Affinity / CRM deal and partner records",
      "Board decks & IC memos (PDF, Slides, Notion)",
      "Market comps & analyst valuation packets",
      "LP reporting templates & admin closes",
      "Portfolio monitoring agents & research bots",
    ],
  },
  archSteps: [
    {
      label: "Normalize entities",
      desc: "Map each company, investment, valuation event, milestone, board update, and commitment into typed entities with stable IDs across tools and vintages.",
    },
    {
      label: "Capture observations",
      desc: "Every mark, deck revision, agent summary, and human note is stored append-only with source metadata and fund context.",
    },
    {
      label: "Compute snapshots",
      desc: "Project latest state for monitoring, or reconstruct portfolio and company views as recorded up to any timestamp IC, LP, or audit requires.",
    },
    {
      label: "Serve partners & agents",
      desc: "Expose the same graph to portfolio agents, IR workflows, and external reporting. No duplicate spreadsheets or conflicting sources.",
    },
  ],
  caseStudy: {
    headline: "How portfolio intelligence teams use Neotoma as their integrity layer",
    desc:
      "AI portfolio intelligence platforms for venture capital unify marks, milestones, and LP-ready narratives across funds and portfolio companies. Neotoma versions every valuation, board signal, and cap-table event so you can reconstruct portfolio state as recorded up to any quarter close or wire date.",
    featuresHeading: "What portfolio intelligence teams build",
    features: [
      "Natural-language portfolio Q&A across IC history, board packs, and cap-table events",
      "Automated quarter-end snapshot packaging for allocator reporting",
      "Conflict-aware views that preserve management vs. external comp perspectives",
    ],
    guarantees: [
      "Immutable observations for every valuation, milestone, and board-derived signal",
      "Temporal snapshots so answers as recorded by quarter close and wire dates, not export dates",
      "Relationship integrity between funds, investments, companies, and LP commitments",
      "Audit-friendly exports that list snapshot keys, memos, and observation lineage in one graph",
    ],
    generalizesTitle: "If you run multi-agent portfolio workflows, you share the same risk surface",
    generalizesDesc:
      'Any team blending research agents, IR automation, and human partners needs the same guarantees: no silent mark overwrites, no LP letter built from the wrong day\'s cap table, and no single flattened "outlook" when board and market disagree. Neotoma generalizes the pattern to your stack.',
  },
  ctaHeadline: "Ship portfolio agents that can defend",
  ctaHighlight: "every mark and milestone they cite",
  ctaDesc:
    "Install Neotoma, connect your cap-table, CRM, and board workflows, and stop treating the latest export as the database of record.",
  ctaFeatures: ["Open-source", "Privacy-first", "Team deployment", "No vendor lock-in"],
  agentLabel: "portfolio agent",
};

export function PortfolioLandingPageBody() {
  return <UseCaseLandingShell mdxShell config={CONFIG} />;
}

export function PortfolioLandingPage() {
  return <MdxSitePage canonicalPath="/portfolio" shell="bare" />;
}
