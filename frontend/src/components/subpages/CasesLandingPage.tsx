import {
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  Clock,
  FileText,
  FileWarning,
  Gavel,
  GitCompare,
  HelpCircle,
  History,
  Layers,
  Link2,
  PackageSearch,
  Plug,
  Search,
  Terminal,
  Upload,
  UserSearch,
  Users,
} from "lucide-react";
import { UseCaseLandingShell, type UseCaseConfig } from "./use_case_landing/UseCaseLandingShell";

const CONFIG: UseCaseConfig = {
  accentColor: "cyan",
  badgeIcon: Briefcase,
  badgeText: "Neotoma for Case Management",
  heroTitle: "Case intelligence that survives",
  heroHighlight: "filings, investigations, and evolving claims",
  heroDesc:
    "Legal proceedings and insurance claims depend on timing: what evidence existed at filing, when counsel first learned about a witness, how assessments diverged. Neotoma versions case state so you can reconstruct the record at any point in the matter timeline.",
  heroTags: [
    { tag: "case", Icon: Briefcase },
    { tag: "evidence", Icon: PackageSearch },
    { tag: "party", Icon: Users },
    { tag: "filing", Icon: FileText },
    { tag: "assessment", Icon: ClipboardCheck },
    { tag: "ruling", Icon: Gavel },
  ],
  heroFeatures: ["Open-source", "Enterprise SSO & RBAC", "Team deployment", "SOC 2 compatible"],
  analyticsPrefix: "cases",
  problemTitle: "Matter tools store documents; they do not preserve evidentiary time",
  problemDesc:
    'Cases advance through motions, discovery, expert reports, and carrier investigations. Exhibits get re-labeled, analysts revise opinions, and strategy memos overwrite earlier drafts. Without as-of snapshots, "what was in the record on March 4?" becomes a scavenger hunt through drives and email.',
  problemCards: [
    {
      Icon: Clock,
      title: "No temporal evidence tracking",
      desc: "Teams see the current exhibit index but cannot prove which items were attached to the motion filed on Feb 14, or whether Exhibit C was added before the hearing.",
    },
    {
      Icon: FileWarning,
      title: "Silent exhibit updates",
      desc: "A revised PDF replaces the prior hash with no link to the version served on opposing counsel, erasing the chain needed for sanctions motions or coverage disputes.",
    },
    {
      Icon: Link2,
      title: "No decision provenance",
      desc: "Reserve recommendations and liability calls live in slide decks and chat. When two analysts disagree, there is no structured record of both conclusions with source and timestamp.",
    },
    {
      Icon: HelpCircle,
      title: "Unexplainable case strategy",
      desc: 'Leadership asks why posture shifted before mediation. Without observation-level history, the answer is "we updated the memo," not which new fact or ruling triggered the change.',
    },
  ],
  problemCallout: 'Courts, carriers, and boards do not accept "we have the latest binder."',
  problemCalloutDesc:
    "Motions turn on what was known when they were filed. Claims turn on investigation milestones. When discovery or SIU asks for the first mention of a witness or the state of the file on a coverage date, you need timestamps and provenance.",
  scenarios: [
    {
      category: "Evidence timeline",
      human:
        "What evidence was available when we filed the motion to compel in Rivera v. Northlake Logistics?",
      fail: "Current evidence list for Rivera v. Northlake Logistics (N.D. Cal. 3:24-cv-01882): depositions (5), expert reports (2), business records (12), correspondence bundle.",
      succeed:
        "As of filing date 2025-01-22 4:00pm PT (docket entry DE 47), the motion to compel referenced exhibits A\u2013F only: depo transcripts Chen, Okoro, Vance; custodian affidavit; ESI protocol email thread through Jan 18; privilege log v3. Exhibit G (forensic image hash log) was first observed Jan 24, after filing. Snapshot case\u00B7v11 @ 2025-01-22T16:00:00-08:00 matches the clerk's PDF stamp.",
      version: "case\u00B7v11",
      Icon: History,
      failTitle: "Current evidence list, no filing-time slice",
      failDesc:
        "The assistant listed everything in the matter workspace today, including items added after the motion. Opposing counsel could challenge the record.",
    },
    {
      category: "Witness discovery",
      human:
        "When did we first learn about Maria Santos as a witness in the Meridian fire investigation?",
      fail: "Maria Santos is on the witness list for Meridian fire (claim CLM-2024-7712).",
      succeed:
        'First observation: 2024-09-03 09:41 UTC, field notes PDF uploaded by adjuster Dana Whitfield (source: carrier portal upload id up_9k2m). Context: "neighbor statement re: secondary ignition." Prior mentions: none in case graph before that timestamp. Linked party entity party\u00B7santos_m with observation chain obs\u00B7v1..v3.',
      version: "party\u00B7santos_m",
      Icon: UserSearch,
      failTitle: "Witness on file, no first-learned date",
      failDesc:
        "Knowing someone is listed now does not answer when SIU or counsel first had notice. That is the core question for late-witness motions and spoliation arguments.",
    },
    {
      category: "Conflicting assessments",
      human:
        "Why do we have two different reserve recommendations for the Harbison bodily injury file?",
      fail: "Latest reserve recommendation for Harbison BI (claim CLM-2023-4401): $1.85M.",
      succeed:
        "Two assessments preserved: (1) assessment\u00B7v4 by analyst Priya Menon, 2024-11-12, $2.4M, cited IME report Dr. Lowell and future surgery schedule. (2) assessment\u00B7v6 by analyst Eric Voss, 2025-01-08, $1.85M, weighted new surveillance stills and mediation bracket. Neither supersedes without explicit edge; both linked to evidence obs with provenance. Final accounting uses v6 for reporting but v4 remains queryable.",
      version: "assessment\u00B7v6",
      Icon: GitCompare,
      failTitle: "Only final number, divergent analysis erased",
      failDesc:
        "Regulators and reinsurers increasingly ask how reserves moved. Showing only the current figure hides the analytical fork that justified a change.",
    },
    {
      category: "Case state reconstruction",
      human: "What was our case posture on the Apex IP litigation as of October 1, 2024?",
      fail: "Apex IP Ltd. v. BrightForge Inc. (S.D.N.Y. 1:23-cv-08814): active litigation; claim construction hearing set; settlement authority $4.2M.",
      succeed:
        'Point-in-time snapshot case\u00B7apex @ 2024-10-01: Markman order not yet issued (issued Oct 18). Posture: pursuing narrow construction for term "distributed ledger node"; no settlement authority on file (authority memo obs dated Oct 9 not yet observed). Docket through DE 112 only; DE 119 (Daubert) not filed until Oct 4. Diff vs. current case\u00B7v14: authority, expert challenges, and hearing dates all post-date the as-of date.',
      version: "case\u00B7apex @ 2024-10-01",
      Icon: CalendarClock,
      failTitle: "Current posture returned for historical date",
      failDesc:
        "Board decks and coverage letters often need the strategy as it stood on a specific day. Mixing today's settlement band with last quarter's claim position misstates risk.",
    },
  ],
  outcomeTitle: "From static binders to explainable case state",
  outcomeSubtitle: "Before and after Neotoma",
  outcomeDesc:
    "Each scenario pairs the same question with two outcomes: one where only the latest list or number is visible, and one where filings, witnesses, assessments, and posture are queryable in time.",
  howTitle: "How Neotoma hardens case and claims operations",
  steps: [
    {
      Icon: Upload,
      title: "Ingest every touch as an observation",
      desc: "Filings, exhibits, adjuster notes, expert addenda, and agent summaries become structured observations on case, evidence, party, filing, assessment, and ruling entities. Nothing overwrites prior state.",
      detail:
        "Immutable history by default. Exhibit and opinion lineage survives re-uploads and re-labels.",
    },
    {
      Icon: Layers,
      title: "Project matter state through time",
      desc: "Link evidence to docket events and coverage milestones. Reconstruct exhibit sets as of any filing date, hearing, or reserve meeting without rebuilding folders by hand.",
      detail:
        "Temporal queries return the state valid on the as-of instant, not the last sync from the DMS.",
    },
    {
      Icon: Search,
      title: "Let agents answer with provenance",
      desc: "Litigation and claims agents read the same versioned graph. Responses cite first-seen timestamps, analyst IDs, and docket anchors so counsel and SIU can defend the answer.",
      detail:
        "Built for hearings, carrier exams, and internal investigations: who knew what, when, and from which source.",
    },
  ],
  capTitle: "Capabilities built for dockets, investigations, and claims",
  capSubtitle: "What you can ship",
  capDesc:
    "Model the entities your matter system already names, then add the integrity layer file shares never had: timelines, forks, and audit-friendly explanations.",
  capabilities: [
    {
      Icon: History,
      title: "Evidence timelines & filing-time slices",
      desc: "Bind exhibits to motions, discovery responses, and carrier reports. Answer what was in the record when a pleading was filed, with clerk timestamps and hash lineage.",
      tags: ["evidence", "filing", "temporal"],
    },
    {
      Icon: UserSearch,
      title: "Witness & party first-seen tracing",
      desc: "Record the first observation of a person or entity, upload source, and surrounding context. Separate from whether they appear on a current witness list.",
      tags: ["party", "witness", "provenance"],
    },
    {
      Icon: GitCompare,
      title: "Forked assessments with lineage",
      desc: "Preserve divergent reserve or liability opinions with analyst, model version, and evidence links. Final numbers stay authoritative without deleting the fork.",
      tags: ["assessment", "claims", "audit"],
    },
    {
      Icon: CalendarClock,
      title: "Point-in-time case posture",
      desc: "Reconstruct strategy, authority, and open issues as of any date relevant to mediation, coverage, or board reporting.",
      tags: ["case", "strategy", "as-of"],
    },
    {
      Icon: Gavel,
      title: "Ruling and order linkage",
      desc: "Connect orders to downstream shifts in theory of case, experts, and settlement bands. Each tied to ruling observations and docket IDs.",
      tags: ["ruling", "docket", "graph"],
    },
    {
      Icon: PackageSearch,
      title: "Investigation-grade exports",
      desc: "Emit structured trails for SIU, special master, or regulator review: exhibit versions, analyst conclusions, and chronological fact development.",
      tags: ["investigation", "export", "compliance"],
    },
  ],
  archHeadline: "Neotoma sits beneath your DMS, e-discovery stack, and claims core",
  archDesc:
    "Keep Relativity, iManage, or Guidewire as systems of workflow. Neotoma is the integrity layer that remembers every exhibit version, assessment branch, and posture change those tools were not built to retain as queryable state.",
  archConfig: {
    topLabel: "Case & claims operations plane",
    topDesc:
      "Humans and agents emit observations; Neotoma reduces them to authoritative snapshots for cases, evidence, parties, filings, assessments, and rulings.",
    interfaces: [
      { label: "MCP tools", Icon: Plug },
      { label: "HTTP API", Icon: Layers },
      { label: "CLI & automations", Icon: Terminal },
    ],
    dataSources: [
      "ECM / DMS exports (iManage, NetDocuments, SharePoint)",
      "E-discovery loads & privilege logs",
      "Court e-filing feeds and docket monitors",
      "Claims adjuster systems & SIU case files",
      "Internal investigation notebooks & agent research runs",
    ],
  },
  archSteps: [
    {
      label: "Normalize entities",
      desc: "Map each matter, exhibit, party, filing, assessment, and ruling into typed entities with stable IDs shared across tools.",
    },
    {
      label: "Capture observations",
      desc: "Every upload, redline, analyst memo, and model summary is stored as an append-only observation with source metadata.",
    },
    {
      label: "Compute snapshots",
      desc: "Project the latest authoritative view, or reconstruct historical state for any timestamp relevant to a motion, hearing, or coverage date.",
    },
    {
      label: "Serve agents & reviewers",
      desc: "Expose the same graph to litigation agents, claims copilots, and human reviewers. No duplicate binders or conflicting lists.",
    },
  ],
  caseStudy: {
    headline: "How case management teams use Neotoma as their integrity layer",
    desc:
      "AI litigation and claims platforms unify docket data, discovery, and strategy analytics across complex commercial and insurance defense teams. Neotoma versions every exhibit, assessment, and analyst output so you can reconstruct case state at any filing date or mediation prep point.",
    featuresHeading: "What case management teams build",
    features: [
      "Matter agents that summarize posture across parallel cases and coverage towers",
      "Continuous ingestion of filings, transcripts, and carrier correspondence",
      'Partner-facing "state of the file on date X" experiences for mediation prep',
    ],
    guarantees: [
      "Immutable observations for every exhibit version and analyst output",
      "Temporal snapshots so filing-time and as-of answers match the record, not upload order",
      "Relationship integrity between parties, evidence, and docket events",
      "Audit-oriented exports that list divergent assessments and first-seen witnesses in one graph",
    ],
    generalizesTitle:
      "If you run multi-agent case or claims workflows, you share the same risk surface",
    generalizesDesc:
      "Any team blending human counsel, adjusters, and generative research needs the same guarantees: no silent exhibit swaps, no orphaned opinions, and no guessing when a witness first surfaced. Neotoma generalizes the pattern to your stack.",
  },
  ctaHeadline: "Ship case agents that can defend",
  ctaHighlight: "every answer they give",
  ctaDesc:
    "Install Neotoma, connect your matter and claims data, and stop treating the latest export as the database of record.",
  ctaFeatures: [
    "Open-source",
    "Enterprise SSO & RBAC",
    "Team deployment",
    "API compatibility guarantees",
  ],
  agentLabel: "case agent",
};

export function CasesLandingPage() {
  return <UseCaseLandingShell config={CONFIG} />;
}
