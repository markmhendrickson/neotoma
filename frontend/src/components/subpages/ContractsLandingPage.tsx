import {
  BellRing,
  CalendarClock,
  Clock,
  FileDiff,
  FileText,
  GitCompare,
  Handshake,
  History,
  Layers,
  Link2,
  ListChecks,
  Plug,
  Scale,
  Search,
  ShieldAlert,
  Terminal,
  Upload,
  Users,
} from "lucide-react";
import { UseCaseLandingShell, type UseCaseConfig } from "./use_case_landing/UseCaseLandingShell";

const CONFIG: UseCaseConfig = {
  accentColor: "indigo",
  badgeIcon: Scale,
  badgeText: "Neotoma for Contracts",
  heroTitle: "Contract intelligence that survives",
  heroHighlight: "negotiation, amendments, and multi-agent edits",
  heroDesc:
    "Contracts accumulate redlines, amendments, and multi-party approvals. Neotoma versions clause-level state so you can answer what the terms were on any date and what changed in each amendment.",
  heroTags: [
    { tag: "contract", Icon: FileText },
    { tag: "clause", Icon: ListChecks },
    { tag: "amendment", Icon: GitCompare },
    { tag: "obligation", Icon: BellRing },
    { tag: "counterparty", Icon: Handshake },
  ],
  heroFeatures: ["Open-source", "Enterprise SSO & RBAC", "Team deployment", "SOC 2 compatible"],
  analyticsPrefix: "contracts",
  problemTitle: "CLM tools store files; they do not preserve negotiable truth",
  problemDesc:
    "Contract terms change through negotiation. Amendments modify specific clauses while multiple agents update the same agreement in parallel. Without immutable observations and temporal snapshots, auditors and finance cannot reconstruct the terms at signature, after each amendment, or on any historical date.",
  problemCards: [
    {
      Icon: History,
      title: "No version history",
      desc: "Clause text is replaced in place. Teams cannot reconstruct what Section 5.2 said before Amendment No. 2 or who introduced the liability cap change.",
    },
    {
      Icon: Clock,
      title: "Silent clause overwrites",
      desc: "A late-night redline from the drafting agent can overwrite indemnity language without linking back to the obligation or the counterparty record that triggered the edit.",
    },
    {
      Icon: Link2,
      title: "No provenance",
      desc: "Approvals and policy checks live in separate logs. When Legal asks why a carve-out exists, there is no chain from clause to review outcome to responsible party.",
    },
    {
      Icon: ShieldAlert,
      title: "Unexplainable approvals",
      desc: 'Workflows record "approved" with a timestamp but drop reviewer rationale, model confidence, and the multi-stage review path regulators expect under SOX.',
    },
  ],
  problemCallout: 'Regulators and finance do not accept "we have the latest PDF."',
  problemCalloutDesc:
    "Material contracts drive revenue recognition, vendor spend, and risk disclosures. When an audit asks what was in effect on March 14, or whether Amendment No. 3 changed the payment schedule, you need clause-level diffs and provenance, not a search over email attachments.",
  scenarios: [
    {
      category: "Amendment tracking",
      human:
        "What changed in the latest amendment to our Harbor Ridge master services agreement with Vertex Cloud?",
      fail: "Harbor Ridge MSA with Vertex Cloud: payment net-45, liability cap $2.5M, auto-renewal 12 months, governing law Delaware.",
      succeed:
        "Amendment No. 3 (executed Apr 9, 2025) modified clause 7.3 (payment): net-45 to net-30 effective May 1; added carve-out for pass-through cloud fees in Exhibit B; left liability cap at $2.5M unchanged. Diff vs. contract\u00B7v11: \u00A77.3 lines 112\u2013118 replaced; Exhibit B rows 14\u201319 appended. Prior state preserved at contract\u00B7v11 @ 2025-04-08.",
      version: "contract\u00B7v12",
      Icon: FileDiff,
      failTitle: "Current terms only, amendment history missing",
      failDesc:
        "The assistant read the latest consolidated agreement and repeated today's terms. It could not list what Amendment No. 3 changed, which clauses were touched, or how they read the day before execution.",
    },
    {
      category: "Obligation monitoring",
      human: "What SOC2 evidence deliverables are due for Acme Analytics in the next 14 days?",
      fail: "Acme Analytics: SOC2 evidence package due Apr 22, 2025; security questionnaire due May 5.",
      succeed:
        "Acme Analytics obligation obl_soc2_pkg was due Apr 22; Amendment No. 1 (signed Mar 28) extended the deadline to May 6 via change to Schedule 4.1. Provenance: legal-agent proposal Mar 27, counterparty acceptance Mar 28 4:12pm UTC, obligation entity obs\u00B7v4. No missed date. Prior Apr 22 deadline superseded with full lineage.",
      version: "obligation\u00B7v4",
      Icon: CalendarClock,
      failTitle: "Stale deadline from the base contract",
      failDesc:
        "Without linking obligations to amendment observations, the assistant surfaced the original Apr 22 date and would have triggered a false breach alert.",
    },
    {
      category: "Decision explainability",
      human:
        "Why was clause 9.4 (data residency) approved as written in the Northwind procurement agreement?",
      fail: "Clause 9.4 was approved on March 1, 2025.",
      succeed:
        "Three-stage review Mar 1: (1) drafting agent flagged EU-only processing vs. proposed US region (risk: medium). (2) Compliance reviewer Jordan Okonkwo approved with condition: UK SCCs + DPA Exhibit C attached (11:04am). (3) VP Legal Priya Nandakumar signed off 4:47pm after confirming Exhibit C matched template v2025.01. Each step linked to clause\u00B7v6 snapshot and reviewer identity.",
      version: "clause\u00B7v6",
      Icon: Users,
      failTitle: "Approval date without reviewers or rationale",
      failDesc:
        'A timestamp proves something happened, not why it was acceptable. Under audit, "approved March 1" forces counsel to rebuild Slack threads and ticket IDs.',
    },
    {
      category: "Temporal state",
      human:
        "What were the payment terms for the Sterling Logistics order form on February 15, 2025?",
      fail: "Sterling Logistics order form: payment net-30, 1.5% monthly late fee, cap on late fees at 5% of invoice.",
      succeed:
        "As of 2025-02-15, Sterling order form OF-884 showed net-60 and no late-fee cap (clause 3.2 per contract\u00B7v7 snapshot). Amendment No. 2 (effective Feb 28) moved to net-30 and introduced the 1.5%/5% cap language you see today in contract\u00B7v9. The assistant returned the historical snapshot, not the post-amendment text.",
      version: "contract\u00B7v7 @ 2025-02-15",
      Icon: History,
      failTitle: "Current terms returned for a historical question",
      failDesc:
        "Finance asked what governed revenue triggers on the close date. Surfacing today's net-30 terms would misstate when cash was contractually due, compounding in ASC 606 memos.",
    },
  ],
  outcomeTitle: "From brittle documents to explainable contract state",
  outcomeSubtitle: "Before and after Neotoma",
  outcomeDesc:
    "Each scenario pairs the same question with two outcomes: one where only the latest text is visible, and one where amendments, obligations, and as-of snapshots are first-class queryable state.",
  howTitle: "How Neotoma hardens contract operations",
  steps: [
    {
      Icon: Upload,
      title: "Ingest every touch as an observation",
      desc: "Redlines, amendments, emails, CLM exports, and agent outputs become structured observations on contract, clause, amendment, obligation, and counterparty entities. Nothing overwrites prior state.",
      detail:
        "Immutable history by default. Snapshots are computed, not hand-curated spreadsheets.",
    },
    {
      Icon: Layers,
      title: "Project clause-level state through time",
      desc: "Amendments apply as diffs against specific clauses and schedules. Obligations inherit deadline changes when linked amendments land, with supersession edges you can traverse in one query.",
      detail: "Temporal queries return the state valid on the as-of date, not the last save.",
    },
    {
      Icon: Search,
      title: "Let agents answer with provenance",
      desc: "Drafting, review, and compliance agents read the same versioned graph. Responses cite observation IDs, reviewer roles, and amendment numbers so Legal and Finance can defend answers to auditors.",
      detail:
        "Built for SOX-style control narratives: who approved what, when, and under which clause snapshot.",
    },
  ],
  capTitle: "Capabilities built for contract risk and velocity",
  capSubtitle: "What you can ship",
  capDesc:
    "Model the entities your CLM already names, then add the integrity layer missing from file-centric workflows: lineage, diffs, and audit-friendly explanations.",
  capabilities: [
    {
      Icon: GitCompare,
      title: "Amendment lineage & clause diffs",
      desc: "Chain amendments to affected clauses and exhibits. Show side-by-side evolution from signature through each numbered amendment, including dollar caps, SLAs, and carve-outs.",
      tags: ["amendment", "clause", "diff"],
    },
    {
      Icon: BellRing,
      title: "Obligation monitoring with supersession",
      desc: "Track deliverables, renewals, and notice windows. When an amendment moves a date, obligations pick up the new deadline while preserving the prior schedule for audit.",
      tags: ["obligation", "amendment", "deadline"],
    },
    {
      Icon: Users,
      title: "Multi-stage review explainability",
      desc: "Bind reviewer identities and outcomes to clause snapshots. Reconstruct the path from first redline to final approval without scraping Slack or ticket comments.",
      tags: ["clause", "compliance", "audit"],
    },
    {
      Icon: Handshake,
      title: "Counterparty-aware contract graph",
      desc: "Relate agreements to legal entities, subsidiaries, and signing authorities. Spot when the same counterparty string masks two different entities across regions.",
      tags: ["counterparty", "contract", "graph"],
    },
    {
      Icon: FileText,
      title: "As-of and point-in-time queries",
      desc: 'Answer "what were the terms when we signed?" and "what changed in amendment 3?" with the same API. Finance, legal, and agents share one temporal model.',
      tags: ["contract", "temporal", "reporting"],
    },
    {
      Icon: ShieldAlert,
      title: "Control-friendly exports",
      desc: "Generate structured trails for internal controls testing: clause versions, approvals, and amendment events with stable identifiers for external auditors.",
      tags: ["SOX", "audit", "export"],
    },
  ],
  archHeadline: "Neotoma sits beneath your CLM and agent mesh",
  archDesc:
    "Keep DocuSign, Ironclad, or homegrown CLM as the system of record for execution. Neotoma is the integrity layer that remembers every clause change, obligation shift, and reviewer decision those tools were not designed to retain as queryable state.",
  archConfig: {
    topLabel: "Contract operations plane",
    topDesc:
      "Agents and humans emit observations; Neotoma reduces them to authoritative snapshots for contracts, clauses, amendments, obligations, and counterparties.",
    interfaces: [
      { label: "MCP tools", Icon: Plug },
      { label: "HTTP API", Icon: Layers },
      { label: "CLI & automations", Icon: Terminal },
    ],
    dataSources: [
      "DocuSign / Adobe Sign envelopes",
      "Ironclad / LinkSquares / Agiloft exports",
      "Email threads & Slack legal channels",
      "Internal Git- or SharePoint-based playbooks",
      "Agent drafting & policy engines",
    ],
  },
  archSteps: [
    {
      label: "Normalize entities",
      desc: "Map each agreement, clause, amendment, obligation, and counterparty into typed entities with stable IDs shared across tools.",
    },
    {
      label: "Capture observations",
      desc: "Every redline, approval, model summary, and human edit is stored as an append-only observation with source metadata.",
    },
    {
      label: "Compute snapshots",
      desc: "Project the latest state per entity, or reconstruct historical state for any timestamp relevant to reporting or litigation.",
    },
    {
      label: "Serve agents & auditors",
      desc: "Expose the same graph to contract agents, BI pipelines, and control testers. No duplicate spreadsheets or conflicting sources.",
    },
  ],
  caseStudy: {
    headline: "How contract intelligence teams use Neotoma as their integrity layer",
    desc:
      "AI-native contract platforms automate review, redlining, and obligation tracking for global procurement teams. Neotoma versions every clause change, amendment, and approval so you can reconstruct contract state at any close date or audit point.",
    featuresHeading: "What contract intelligence teams build",
    features: [
      "Parallel drafting and risk agents that propose clause edits across hundreds of active MSAs",
      "Continuous obligation extraction from amendments and order forms",
      'Customer-facing "explain this clause" experiences backed by live negotiation history',
    ],
    guarantees: [
      "Immutable observations for every model- or human-generated clause change",
      "Temporal snapshots so as-of answers match financial close dates, not upload dates",
      "Relationship integrity between counterparties, contracts, and downstream obligations",
      "Audit-oriented exports that list reviewers, amendments, and clause versions in one graph",
    ],
    generalizesTitle: "If you run multi-agent contract workflows, you share the same risk surface",
    generalizesDesc:
      "Any team blending generative drafting, policy bots, and human counsel needs the same guarantees: no silent overwrites, no orphan approvals, and no guessing which amendment moved a payment term. Neotoma generalizes the pattern to your stack.",
  },
  ctaHeadline: "Ship contract agents that can defend",
  ctaHighlight: "every answer they give",
  ctaDesc:
    "Install Neotoma, connect your CLM and agent mesh, and stop treating the latest PDF as the database of record.",
  ctaFeatures: [
    "Open-source",
    "Enterprise SSO & RBAC",
    "Team deployment",
    "API compatibility guarantees",
  ],
  agentLabel: "contract agent",
};

export function ContractsLandingPage() {
  return <UseCaseLandingShell config={CONFIG} />;
}
