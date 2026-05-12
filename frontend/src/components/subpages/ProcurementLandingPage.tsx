import {
  BadgeCheck,
  BarChart3,
  Building2,
  ClipboardList,
  FileStack,
  GitCompare,
  Gavel,
  History,
  Layers,
  Link2,
  Plug,
  Scale,
  Search,
  ShieldAlert,
  Terminal,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";
import { MdxSitePage } from "./MdxSitePage";
import { UseCaseLandingShell, type UseCaseConfig } from "./use_case_landing/UseCaseLandingShell";

const CONFIG: UseCaseConfig = {
  accentColor: "orange",
  badgeIcon: Scale,
  badgeText: "Neotoma for Procurement",
  heroTitle: "Procurement truth that survives",
  heroHighlight: "sourcing rounds, spec churn, and multi-agent bids",
  heroDesc:
    "Bids, specs, and approvals live in different systems and rot after award. Neotoma versions every sourcing entity so you can reconstruct the competing offers at selection, the spec the approval referenced, and how supplier risk has moved since onboarding.",
  heroTags: [
    { tag: "supplier", Icon: Building2 },
    { tag: "purchase order", Icon: ClipboardList },
    { tag: "bid", Icon: Gavel },
    { tag: "approval", Icon: BadgeCheck },
    { tag: "specification", Icon: FileStack },
  ],
  heroFeatures: ["Open-source", "Enterprise SSO & RBAC", "Team deployment", "SOC 2 compatible"],
  analyticsPrefix: "procurement",
  problemTitle: "P2P and sourcing tools store artifacts; they do not preserve award-time truth",
  problemDesc:
    'Suppliers change risk profiles mid-contract. Specs drift between engineering releases and PO line items. Bid tabs rot in spreadsheets. Approvals collapse to "approved" in workflow logs. Without temporal snapshots, "what did we actually select and why?" becomes a reconstruction project.',
  problemCards: [
    {
      Icon: History,
      title: "No bid history",
      desc: "At selection time you had three scored bids; six months later only the winner's quote is indexed. Teams cannot replay competing prices, delivery SLAs, or model-generated score breakdowns.",
    },
    {
      Icon: GitCompare,
      title: "Silent spec changes",
      desc: "Engineering publishes spec rev C while Procurement issues PO-2025-4418 against rev B. Nobody links the PO line to the exact revision the approver saw until a quality dispute exposes the gap.",
    },
    {
      Icon: Link2,
      title: "No approval provenance",
      desc: 'Workflows stamp "approved" without binding approvers to the bid packet, spec hash, or delegation chain. When Legal asks who had authority for a $1.2M award, the answer is a name in email.',
    },
    {
      Icon: ShieldAlert,
      title: "Invisible supplier risk changes",
      desc: 'Onboarding cleared Apex Components at "low" financial risk, but a mid-contract credit downgrade and sanctions-screen hit never flow back to the PO or category owner.',
    },
  ],
  problemCallout:
    'Public sector and enterprise procurement do not accept "we picked the best vendor" without evidence.',
  problemCalloutDesc:
    "Bid protests, SOX-style controls, and AI-driven sourcing all need the same thing: competing offers, specification versions, and approvals frozen at decision time. Neotoma preserves that graph so agents and humans can explain awards without rebuilding folders.",
  scenarios: [
    {
      category: "Bid comparison",
      human:
        "What were the competing bids when we selected Meridian Steel for the Q2 structural steel package, and what spec did the approval reference?",
      fail: "Meridian Steel was awarded the structural steel package at $1,184,000 with 14-week delivery; approval status: completed.",
      succeed:
        "At award snapshot 2025-03-18 16:02 UTC: (1) Meridian Steel bid\u00B7v3, $1,184,000, score 87.4, submitted Mar 12 9:41am; (2) Harbor Forge bid\u00B7v2, $1,205,500, score 82.1, Mar 11 4:18pm; (3) Summit Alloys bid\u00B7v4, $1,098,000, score 78.6 (penalized for 18-week lead), Mar 13 11:05am. Approval approval\u00B7v5 linked specification\u00B7v7 (Rev C, hash a3f9\u20262c1) and explicitly cited Exhibit B tensile requirements, not today's Rev D.",
      version: "award\u00B7snapshot\u00B72025-03-18",
      Icon: BarChart3,
      failTitle: "Winner only, competing bids and spec context missing",
      failDesc:
        "The assistant repeated the awarded vendor and amount but could not list losing bids, scores, or which specification revision sat behind the approval.",
    },
    {
      category: "Specification drift",
      human:
        "What spec version was PO-2025-4418 for Apex Components based on when it was approved?",
      fail: "Current specification for custom bracket assembly: Rev D (effective Apr 2, 2025), torque test 45 N\u00B7m, coating Class III.",
      succeed:
        "PO-2025-4418 was approved Mar 21, 2025 against specification\u00B7v6 (Rev B): torque test 40 N\u00B7m, coating Class II. Rev C and Rev D landed Apr 2 and Apr 18 respectively; purchase_order\u00B7v4 observation binds lines 3\u20136 to spec\u00B7v6, not spec\u00B7v9. Drift vs. current Rev D is explicit in the graph.",
      version: "purchase_order\u00B7v4",
      Icon: FileStack,
      failTitle: "Current spec returned, PO lineage to approval-time revision missing",
      failDesc:
        "Without PO-to-spec edges at approval time, the assistant answered with today's Rev D and would misstate contractual requirements during a supplier dispute.",
    },
    {
      category: "Supplier risk change",
      human:
        "Has supplier risk for Apex Components changed since we onboarded them for PO-2025-4418?",
      fail: "Apex Components was approved for procurement spend on March 21, 2025.",
      succeed:
        'Onboarding (Jan 8, 2025): supplier\u00B7v2 risk tier "low," D&B 2A1, no sanctions hits. Timeline: Feb 26, credit watch (supplier\u00B7v5); Mar 14, mid-contract flag "review required" after OFAC secondary-screen match cleared with false positive (supplier\u00B7v6); Apr 9, tier raised to "medium," covenant breach noted in 8-K (supplier\u00B7v8). PO-2025-4418 still references onboarding snapshot unless a formal re-approval observation exists. None linked.',
      version: "supplier\u00B7v8",
      Icon: TrendingUp,
      failTitle: 'Static "approved," no risk trajectory',
      failDesc:
        "Stakeholders need to see risk motion across the contract life, not a binary onboarding flag. Missing timeline data hides the mid-contract alert that should have been escalated.",
    },
    {
      category: "Approval reconstruction",
      human: "Who approved PO-2025-4418 and what did they base the decision on?",
      fail: "Approved by procurement lead.",
      succeed:
        "Four-stage chain Mar 21, 2025: (1) Buyer Dana Okonkwo submitted PO-2025-4418 ($287,400) with bid packet refs bid\u00B7v2\u2013v4. (2) Category manager Luis Ortega approved spend tier L2 10:14am. (3) Finance delegate Priya Shah (standing delegation from CFO per deleg\u00B7v3) approved budget line BRK-OPS-19 11:02am. (4) VP Ops Elena Voss final approval 2:47pm with note citing specification\u00B7v6 and Meridian benchmark pricing. Full identity + artifact links in approval\u00B7v5 graph.",
      version: "approval\u00B7v5",
      Icon: Users,
      failTitle: "Generic approver label, no stages or artifacts",
      failDesc:
        "Regulators and internal controls need delegation and rationale, not a role string. Without structured approvers and links, reconstructing authority takes weeks.",
    },
  ],
  outcomeTitle: "From scattered sourcing artifacts to explainable award state",
  outcomeSubtitle: "Before and after Neotoma",
  outcomeDesc:
    "Each scenario pairs the same question with two outcomes: one where only the latest document or status is visible, and one where bids, specs, risk events, and approvals are first-class queryable state.",
  howTitle: "How Neotoma hardens procurement operations",
  steps: [
    {
      Icon: Upload,
      title: "Ingest every sourcing touch as an observation",
      desc: "RFP responses, score models, spec releases, PO amendments, and agent-generated comparisons become structured observations on supplier, bid, specification, purchase order, and approval entities.",
      detail:
        "Immutable history by default. Award-time snapshots are computed, not recreated from email attachments.",
    },
    {
      Icon: Layers,
      title: "Link awards to bids, specs, and risk timelines",
      desc: "Bind approvals to the exact bid rows and specification revision the approver saw. Supplier risk observations stack over time so mid-contract flags are visible next to open POs.",
      detail: "Temporal queries return decision-time state, not the last upload in the P2P tool.",
    },
    {
      Icon: Search,
      title: "Let procurement agents answer with provenance",
      desc: "Sourcing and policy agents read the same versioned graph. Responses cite observation IDs, bid versions, and delegation edges so reviewers can defend awards.",
      detail:
        "Built for protest defense and control narratives: who approved what, against which spec and competing offers.",
    },
  ],
  capTitle: "Capabilities built for sourcing velocity and audit defense",
  capSubtitle: "What you can ship",
  capDesc:
    "Model the entities your stack already names, then add the integrity layer missing from file- and ticket-centric procurement: lineage across bids, specs, POs, and approvals.",
  capabilities: [
    {
      Icon: Gavel,
      title: "Award-time bid reconstruction",
      desc: "Replay competing offers with scores, timestamps, and evaluator notes as they existed at selection. Not just the contracted winner's PDF.",
      tags: ["bid", "supplier", "award"],
    },
    {
      Icon: FileStack,
      title: "Specification lineage on PO lines",
      desc: "Tie each purchase order line to the spec revision effective at approval; surface drift when engineering releases a new rev after award.",
      tags: ["specification", "purchase order", "drift"],
    },
    {
      Icon: BadgeCheck,
      title: "Multi-stage approval & delegation graphs",
      desc: "Represent category, finance, and exec approvals with delegation chains and links to bid packets and caps tables.",
      tags: ["approval", "delegation", "controls"],
    },
    {
      Icon: ShieldAlert,
      title: "Supplier risk timelines",
      desc: "Stack credit, sanctions, ESG, and performance signals across the contract life; flag when risk tier moves after onboarding.",
      tags: ["supplier", "risk", "compliance"],
    },
    {
      Icon: ClipboardList,
      title: "PO and receipt provenance",
      desc: "Chain POs to requisitions, bids, and goods receipts for three-way match narratives and audit sampling.",
      tags: ["purchase order", "receipt", "audit"],
    },
    {
      Icon: BarChart3,
      title: "Agent-friendly sourcing analytics",
      desc: "Expose the same graph to RFP automation, bid-scoring agents, and dashboards. Stable IDs across human and model writers.",
      tags: ["RFP", "agent", "analytics"],
    },
  ],
  archHeadline: "Neotoma sits beneath your sourcing stack and agent mesh",
  archDesc:
    "Keep Coupa, SAP Ariba, Jaggaer, or homegrown P2P as the system of record for transactions. Neotoma is the integrity layer that remembers every competing bid, spec revision, risk event, and approval those tools were not designed to retain as queryable state.",
  archConfig: {
    topLabel: "Procurement operations plane",
    topDesc:
      "Humans and AI agents emit observations; Neotoma reduces them to authoritative snapshots for suppliers, bids, specifications, purchase orders, and approvals.",
    interfaces: [
      { label: "MCP tools", Icon: Plug },
      { label: "HTTP API", Icon: Layers },
      { label: "CLI & automations", Icon: Terminal },
    ],
    dataSources: [
      "Coupa / SAP Ariba / Jaggaer sourcing events",
      "ERP PO and receipt feeds",
      "Engineering spec repositories",
      "Supplier risk and sanctions screening APIs",
      "Agent RFP drafting and bid-scoring outputs",
    ],
  },
  archSteps: [
    {
      label: "Normalize entities",
      desc: "Map suppliers, bids, specs, POs, and approvals into typed entities with stable IDs shared across ERP, CLM, and agent tools.",
    },
    {
      label: "Capture observations",
      desc: "Every RFP response, score run, spec release, workflow action, and model comparison is stored append-only with source metadata.",
    },
    {
      label: "Compute snapshots",
      desc: "Project current state per entity, or reconstruct award-time and as-of views for protests, audits, and dispute response.",
    },
    {
      label: "Serve agents & reviewers",
      desc: "Expose one graph to sourcing agents, category managers, and control testers. No conflicting spreadsheets or winner-only exports.",
    },
  ],
  caseStudy: {
    headline: "How procurement teams use Neotoma as their integrity layer",
    desc:
      "AI procurement intelligence platforms for enterprise sourcing automate RFP assembly, supplier comparison, and bid scoring across global categories. Neotoma versions every score, specification change, and approval so you can reconstruct award decisions at any audit point.",
    featuresHeading: "What procurement teams build",
    features: [
      "Autonomous RFP drafting with clause libraries synced to live specification entities",
      "Side-by-side bid scoring with explainable weights and scenario what-if runs",
      "Continuous supplier risk monitoring piped into category dashboards",
    ],
    guarantees: [
      "Immutable observations for every model-generated score and human override",
      "Temporal snapshots so award answers reference March's bids, not June's folder",
      "Relationship integrity between bids, specs, POs, and multi-stage approvals",
      "Audit-oriented exports suitable for public-sector and enterprise control testing",
    ],
    generalizesTitle: "If you run AI-assisted sourcing, you share the same evidentiary bar",
    generalizesDesc:
      "Any team blending generative RFPs, automated scoring, and human approvers needs the same guarantees: no silent spec drift, no orphan approvals, and no guessing which competing offer justified the award. Neotoma generalizes the pattern to your stack.",
  },
  ctaHeadline: "Ship procurement agents that can defend",
  ctaHighlight: "every award they support",
  ctaDesc:
    "Install Neotoma, connect sourcing systems and agents, and stop treating the latest PO PDF as the database of record.",
  ctaFeatures: [
    "Open-source",
    "Enterprise SSO & RBAC",
    "Team deployment",
    "API compatibility guarantees",
  ],
  agentLabel: "procurement agent",
};

export function ProcurementLandingPageBody() {
  return <UseCaseLandingShell mdxShell config={CONFIG} />;
}

export function ProcurementLandingPage() {
  return <MdxSitePage canonicalPath="/procurement" shell="bare" />;
}
