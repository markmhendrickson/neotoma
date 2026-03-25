import {
  Building2,
  ClipboardList,
  FileSearch,
  Flag,
  GitBranch,
  Gavel,
  Handshake,
  History,
  Layers,
  Plug,
  Scale,
  Search,
  ShieldAlert,
  Target,
  Terminal,
  Upload,
} from "lucide-react";
import { VerticalLandingShell, type VerticalConfig } from "./vertical_landing/VerticalLandingShell";

const CONFIG: VerticalConfig = {
  accentColor: "sky",
  badgeIcon: Search,
  badgeText: "Neotoma for Due Diligence",
  heroTitle: "Diligence memory that survives",
  heroHighlight: "weeks of agents, conflicting findings, and IC votes",
  heroDesc:
    "Diligence runs for weeks across financial, legal, and technical workstreams. Neotoma versions every finding and assessment so you can reconstruct what the team believed at any decision point, not just what the latest memo says.",
  heroTags: [
    { tag: "target company", Icon: Building2 },
    { tag: "finding", Icon: FileSearch },
    { tag: "assessment", Icon: ClipboardList },
    { tag: "red flag", Icon: Flag },
    { tag: "deal", Icon: Handshake },
  ],
  heroFeatures: ["Open-source", "Enterprise SSO & RBAC", "Team deployment", "SOC 2 compatible"],
  analyticsPrefix: "diligence",
  problemTitle: 'Diligence stacks collapse weeks of work into one "current" view',
  problemDesc:
    "Multiple agents scrape filings, model revenue, interview customers, and log red flags in parallel. Traditional stores keep the last write on each field: a superseded legal finding disappears, a resolved red flag vanishes from dashboards, and nobody can reconstruct the belief state on the morning of the IC vote.",
  problemCards: [
    {
      Icon: History,
      title: "No vote-time reconstruction",
      desc: "Partners ask what the file showed when the IC approved the $180M term sheet. The workspace only returns today's memo, mixing post-vote remediation with pre-vote risk.",
    },
    {
      Icon: GitBranch,
      title: "Contradictions silently flattened",
      desc: "Two agents disagreed on Atlas Foundry's recurring revenue quality in March. The database kept one number; the losing narrative and its evidence trail were overwritten.",
    },
    {
      Icon: Flag,
      title: "Red flag timelines truncated",
      desc: 'Resolved issues drop out of reports, so later reviewers never see that customer concentration was a P0 on April 3, only that it is "closed" in May.',
    },
    {
      Icon: ShieldAlert,
      title: "Unattributed assessments",
      desc: 'IC packs cite "management quality: strong" with no link to which agent, which interview notes, or which version of the assessment entity backed that claim.',
    },
  ],
  problemCallout:
    "A billion-dollar go/no-go deserves a timestamped evidence graph, not a slide deck export.",
  problemCalloutDesc:
    "Neotoma preserves every observation, supersession, and relationship across diligence agents. You can diff belief between any two dates, list red flags as they existed on a given Monday, and bind IC materials to the exact entity versions that were live when the vote closed.",
  scenarios: [
    {
      category: "Investment committee readiness",
      human:
        "What did we know about Horizon Semiconductor when the IC voted yes on April 17, 2025?",
      fail: "Horizon Semiconductor: ARR $94M (management case), gross margin 61%, top-3 customer concentration 28%, legal clean, proceed to docs.",
      succeed:
        "IC vote Apr 17, 2025 4:12pm PT (deal\u00B7v9 snapshot): ARR case $94M with diligence-agent range $88\u2013102M; gross margin 61% per FP&A model v3 (Mar 28). Customer concentration 34% in legal-agent finding fin\u00B7v6 (Apr 2), not yet reconciled with sales-agent 28% figure from Mar 22. One open P1 red flag (supply sole-source) documented in red_flag\u00B7v4, accepted with board-level mitigation plan attached. Post-vote work (May 1\u20139) is excluded from this snapshot.",
      version: "deal\u00B7v9 @ 2025-04-17T16:12:00-07:00",
      Icon: Gavel,
      failTitle: "Current diligence memo, not vote-time state",
      failDesc:
        "The assistant blended May remediation into the answer, understating concentration and hiding an open red flag that existed at the vote.",
    },
    {
      category: "Conflicting findings",
      human:
        "Did we ever believe Meridian Bio's Phase II readout was negative before we signed the Series E?",
      fail: "Meridian Bio Phase II: positive efficacy signal; proceed with $45M Series E at $1.1B pre.",
      succeed:
        'Two concurrent findings: clinical-agent Mar 6 9:41am, "primary endpoint missed in ITT; signal in pre-specified subgroup" (finding\u00B7v3). research-agent Mar 8 2:15pm, "trend favors drug; await full CSR" (finding\u00B7v5). IC materials Mar 14 cited finding\u00B7v5 with explicit footnote that finding\u00B7v3 remains on record. Series E term sheet signed Mar 21 preserved both observations with timestamps; neither was deleted when the bull case won internally.',
      version: "finding\u00B7v5",
      Icon: GitBranch,
      failTitle: "Latest narrative only, dissent erased",
      failDesc:
        "Without versioned findings, the assistant repeated the closing thesis and implied the team was always aligned. That misstates regulatory and litigation risk.",
    },
    {
      category: "Red flag tracking",
      human:
        "Show every red flag we logged on the Blackwood Logistics acquisition, including ones we cleared.",
      fail: "Blackwood Logistics: 2 active red flags, customs broker licensing gap, ERP integration delay.",
      succeed:
        "Full timeline: (1) Feb 4 P0 revenue recognition policy mismatch, cleared Feb 19 after EY memo. (2) Feb 11 P1 environmental notice on Indianapolis facility, open at signing, escrow $3.2M. (3) Mar 2 P2 key-man risk on COO, cleared Mar 20 with retention agreement. (4) Mar 9 P1 customs broker gap, still open in latest red_flag\u00B7v11. Each row links to assessment and evidence observations; nothing removed when status flipped to resolved.",
      version: "red_flag\u00B7v11",
      Icon: Flag,
      failTitle: "Resolved flags invisible, audit trail breaks",
      failDesc:
        "Hiding cleared flags makes diligence look shallow and prevents acquirers from proving they investigated issues that later surface.",
    },
    {
      category: "Historical reconstruction",
      human: "What was our working view of target company Cobalt Rail's net debt on March 3, 2025?",
      fail: "Cobalt Rail net debt $127M (cash $41M, gross debt $168M) per latest model.",
      succeed:
        "As of 2025-03-03 close of business: net debt $134M (cash $38M, gross debt $172M) per FP&A snapshot target\u00B7v14 @ 2025-03-03, includes $6M revolver draw disclosed Mar 1. The $127M figure appears first in target\u00B7v16 (Mar 9) after receivables true-up. Point-in-time answer uses target\u00B7v14, not current target\u00B7v18.",
      version: "target\u00B7v14 @ 2025-03-03",
      Icon: History,
      failTitle: "Current model returned for an as-of date",
      failDesc:
        "Debt bridges drive purchase price adjustments. Answering with March 9 numbers for a March 3 question can shift implied equity by millions.",
    },
  ],
  outcomeTitle: "From fragile memos to defensible diligence state",
  outcomeSubtitle: "Before and after Neotoma",
  outcomeDesc:
    'Each scenario asks the same question twice: once against a stack that only knows "now," and once against versioned entities where version strings like target\u00B7v14 tie answers to evidence you can replay.',
  howTitle: "How Neotoma anchors multi-agent diligence",
  steps: [
    {
      Icon: Upload,
      title: "Ingest every agent output as an observation",
      desc: "Financial models, legal memos, expert calls, and chat transcripts become structured observations on target company, finding, assessment, red flag, and deal entities. No silent overwrite when a newer agent disagrees.",
      detail:
        "Supersession is explicit: old findings remain queryable with timestamps and source attribution.",
    },
    {
      Icon: Layers,
      title: "Project snapshots for votes, signings, and audits",
      desc: "Materialize the belief graph as it existed when the IC voted, when exclusivity dropped, or when the board deck was finalized. Diff any two snapshots to explain what changed and why.",
      detail: 'Same API for "today" and "2025-04-17 4:12pm PT." No one-off spreadsheets.',
    },
    {
      Icon: Search,
      title: "Let diligence agents cite versioned state",
      desc: "Responses include entity versions, observation IDs, and relationships so partners can trace every claim from memo bullet to underlying evidence.",
      detail: "Built for LP questions, post-close litigation, and regulator-style lookbacks.",
    },
  ],
  capTitle: "Capabilities for buy-side, sell-side, and vendor diligence",
  capSubtitle: "What you can ship",
  capDesc:
    "Model the entities your process already names, then add integrity guarantees that generic RAG and note apps cannot: contradiction preservation, red flag lifecycles, and vote-time replay.",
  capabilities: [
    {
      Icon: Target,
      title: "Vote- and signing-time snapshots",
      desc: 'Bind IC decks, fairness opinions, and disclosure schedules to exact versions of target and deal entities. Answer "what did we know when?" without reconstructing Slack exports.',
      tags: ["deal", "target", "snapshot"],
    },
    {
      Icon: GitBranch,
      title: "Contradiction-aware finding graph",
      desc: "Keep parallel agent conclusions with timestamps and REFERS_TO links to evidence. The bear case is never lost because the bull case was saved last.",
      tags: ["finding", "assessment", "provenance"],
    },
    {
      Icon: Flag,
      title: "Red flag lifecycle & resolution lineage",
      desc: "Track severity, owner, and mitigation from first log through clearance. Resolved flags stay in the graph for audit and post-close integration reviews.",
      tags: ["red_flag", "timeline", "audit"],
    },
    {
      Icon: Scale,
      title: "Assessment explainability",
      desc: "Tie qualitative scores (e.g., management, market, legal) to structured observations and reviewer identity. Replace orphan ratings with defensible trails.",
      tags: ["assessment", "compliance", "IC"],
    },
    {
      Icon: Building2,
      title: "Target company identity & subsidiary graph",
      desc: 'Normalize entities across filings, data rooms, and agent extractions so "Horizon Semi" and "Horizon Semiconductor Ltd." share one canonical target with versioned attributes.',
      tags: ["target", "entity", "graph"],
    },
    {
      Icon: History,
      title: "Point-in-time financial and risk fields",
      desc: "Replay net debt, margin cases, and concentration metrics as they were on any close date. Critical for purchase price mechanics and earn-out disputes.",
      tags: ["target", "temporal", "PPA"],
    },
  ],
  archHeadline: "Neotoma sits beneath your diligence agent mesh",
  archDesc:
    "Keep the data room, CRM, and modeling stack as sources. Neotoma is the integrity layer that remembers how multi-week agent work evolved, so IC, legal, and integration teams share one temporal source of truth instead of dueling PDFs.",
  archConfig: {
    topLabel: "Diligence operations plane",
    topDesc:
      "Humans and agents emit observations; Neotoma reduces them to authoritative snapshots for targets, findings, assessments, red flags, and deals.",
    interfaces: [
      { label: "MCP tools", Icon: Plug },
      { label: "HTTP API", Icon: Layers },
      { label: "CLI & automations", Icon: Terminal },
    ],
    dataSources: [
      "Virtual data rooms & document parsers",
      "SEC / Companies House / registry feeds",
      "Expert networks & interview transcripts",
      "FP&A and trading-comps models",
      "Legal, tax, and ESG agent outputs",
    ],
  },
  archSteps: [
    {
      label: "Normalize entities",
      desc: "Map each target company, deal, finding, assessment, and red flag into typed entities with stable IDs across tools and agents.",
    },
    {
      label: "Capture observations",
      desc: "Every model refresh, memo, agent summary, and human edit is append-only with source metadata. Contradictions remain first-class.",
    },
    {
      label: "Compute snapshots",
      desc: "Project current state or reconstruct belief at IC vote, signing, or any regulatory as-of date.",
    },
    {
      label: "Serve partners & auditors",
      desc: "Expose the same graph to diligence agents, deal teams, and compliance. No duplicate Excel bridges with divergent numbers.",
    },
  ],
  caseStudy: {
    companyName: "DiligenceIQ",
    companyUrl: "https://diligenceiq.example.com",
    companyDesc:
      "is a fictional AI-powered M&A diligence platform that orchestrates financial, legal, and technical agents for buy-side and strategic acquirers.",
    features: [
      "Parallel agents that ingest data rooms, model synergies, and surface red flags across simultaneous processes",
      "IC-ready packs generated from live diligence state with drill-down to underlying observations",
      "Vendor diligence mode for procurement teams evaluating $50M+ platform contracts",
    ],
    guarantees: [
      "Immutable observations for every agent- or analyst-generated finding and assessment",
      "Vote-time and signing-time snapshots so materials match the exact entity versions in effect",
      "Full red flag timelines including cleared issues with mitigation evidence",
      "Contradiction preservation when agents disagree, with timestamps and source links",
    ],
    generalizesTitle: "Any multi-agent diligence workflow shares the same failure modes",
    generalizesDesc:
      "Growth equity, corporate development, and vendor risk teams all run long-horizon processes where truth evolves. Neotoma generalizes the DiligenceIQ pattern: versioned entities, explicit supersession, and temporal queries for the questions that matter when checks clear.",
  },
  ctaHeadline: "Ship diligence agents that can answer",
  ctaHighlight: "what the IC actually knew",
  ctaDesc:
    "Install Neotoma, connect your data room and agent mesh, and stop treating the latest memo as the system of record.",
  ctaFeatures: [
    "Open-source",
    "Enterprise SSO & RBAC",
    "Team deployment",
    "API compatibility guarantees",
  ],
  agentLabel: "diligence agent",
};

export function DiligenceLandingPage() {
  return <VerticalLandingShell config={CONFIG} />;
}
