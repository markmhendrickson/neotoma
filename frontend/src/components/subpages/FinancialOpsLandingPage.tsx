import {
  AlertTriangle,
  ArrowLeftRight,
  BookOpen,
  Building2,
  Calendar,
  CalendarOff,
  FileText,
  GitBranch,
  Landmark,
  Layers,
  ListChecks,
  Plug,
  RefreshCw,
  RouteOff,
  Scale,
  Search,
  ShieldCheck,
  Terminal,
  Upload,
  Waypoints,
} from "lucide-react";
import { UseCaseLandingShell, type UseCaseConfig } from "./use_case_landing/UseCaseLandingShell";

const CONFIG: UseCaseConfig = {
  accentColor: "teal",
  badgeIcon: Scale,
  badgeText: "Neotoma for Financial Ops",
  heroTitle: "Financial operations that survive",
  heroHighlight: "reconciliation, close, and audit",
  heroDesc:
    "Bank feeds, invoices, and GL entries disagree daily while agents auto-match and categorize. Neotoma versions every reconciliation entry and ledger state so you can answer what the books showed on the audit date or at month-end close.",
  heroTags: [
    { tag: "transaction", Icon: ArrowLeftRight },
    { tag: "account", Icon: Landmark },
    { tag: "reconciliation entry", Icon: ListChecks },
    { tag: "ledger", Icon: BookOpen },
    { tag: "invoice", Icon: FileText },
  ],
  heroFeatures: ["Open-source", "Enterprise SSO & RBAC", "Team deployment", "SOC 2 compatible"],
  analyticsPrefix: "financial_ops",
  problemTitle: "ERP and bank tools store balances; they do not preserve reconcilable truth",
  problemDesc:
    'Reconciliation entries change when feeds refresh. Agents overwrite categorization without linking prior states. Month-end close often means "what we have now," not a frozen snapshot of tie-outs and exceptions. SOX and external audit demand temporal state reconstruction.',
  problemCards: [
    {
      Icon: CalendarOff,
      title: "No close-date snapshots",
      desc: "Close packages export PDFs and spreadsheets that drift the next morning. Teams cannot query the reconciliation grid as it stood on Mar 31 at 11:59pm ET.",
    },
    {
      Icon: RefreshCw,
      title: "Silent reconciliation overwrites",
      desc: "A bank-feed refresh or matching agent can replace an exception row in place. The $14,227.18 variance you investigated Tuesday disappears without a trace.",
    },
    {
      Icon: RouteOff,
      title: "No transaction provenance",
      desc: "GL postings show a journal ID and amount but not the chain from bank line to categorization agent to approval. Finance cannot explain why rent hit 6200 instead of 6210.",
    },
    {
      Icon: AlertTriangle,
      title: "Unexplainable adjustments",
      desc: 'Manual JE #ADJ-2025-0412 clears a recon difference with a memo field that says "reclass." No structured link to the invoice, the feed line, or the agent suggestion that misclassified the spend.',
    },
  ],
  problemCallout: 'Auditors do not accept "we reconciled it in the tool."',
  problemCalloutDesc:
    "They ask whether a liability existed on the audit date, how month-end tie-outs looked at close, and how a specific balance rolled forward. When reconciliation state lives only in the latest UI, you rebuild history from exports and tickets.",
  scenarios: [
    {
      category: "Audit date verification",
      human:
        "Did accrued bonus liability ACC-LIAB-4411 exist in our books on the audit date December 31, 2024, and what was its balance?",
      fail: "Accrued bonus liability ACC-LIAB-4411: current balance $388,420.00 as of today; last updated by payroll accrual batch.",
      succeed:
        "As of 2024-12-31 (audit date), ACC-LIAB-4411 snapshot shows balance $412,900.00 per ledger\u00B7v18 @ 2024-12-31T23:59:00-05:00, sourced from JE-2024-12-30-884 (payroll close) and recon entry rec\u00B7v3 tying to Workday accrual export hash a3f9\u20262c1. Post-audit true-up JE-2025-01-15-102 reduced the balance to $388,420.00, preserved as ledger\u00B7v21 with full provenance. The assistant returned point-in-time state, not current GL.",
      version: "ledger\u00B7v18 @ 2024-12-31",
      Icon: ShieldCheck,
      failTitle: "Current liability balance, audit date indistinguishable",
      failDesc:
        "Without as-of reconstruction, the assistant reports today's $388k and implies it was always true, understating the Dec 31 accrual auditors must tie to.",
    },
    {
      category: "Reconciliation conflicts",
      human:
        "Why does Chase operating ****4521 show $18,940.22 while Invoice INV-2024-9918 from CloudNine SaaS shows $18,905.22 for the same December cycle?",
      fail: "Chase ****4521 ending balance $842,110.44; latest matched invoice INV-2024-9918 amount $18,905.22. Reconciliation status cleared.",
      succeed:
        'Conflict preserved: bank feed line chg_9k2\u2026 posted $18,940.22 on 2024-12-28 06:12 UTC (source: Plaid txn_id \u2026); AP system INV-2024-9918 shows $18,905.22 booked Dec 27. Reconciliation entry rec\u00B7v4 holds both amounts with timestamps; exception exc\u00B7v2 notes $35.00 FX fee assessed by issuer on Dec 29. Latest-only view would have collapsed to "matched" after a silent overwrite. Here both sides and sources remain queryable.',
      version: "rec\u00B7v4",
      Icon: AlertTriangle,
      failTitle: "Latest cleared state, both sides of the conflict lost",
      failDesc:
        "When the recon grid keeps only the winning match, the $35 variance and its provenance vanish. Audit wants to see how the exception was identified and resolved.",
    },
    {
      category: "Month-end close",
      human:
        "What was the reconciliation state for cash account 1000-CASH-01 at March 2025 month-end close?",
      fail: "Account 1000-CASH-01: book $2,884,120.33 vs. bank $2,884,118.91; two outstanding deposits; status in progress in the recon workspace.",
      succeed:
        "Close snapshot close\u00B7mar2025 @ 2025-03-31T23:59:59-04:00: book $2,881,004.55, bank $2,881,004.55 per recon entry rec\u00B7v9; zero open exceptions; tie-out signed by controller user id ctrl_m_nguyen @ 2025-04-01T01:14Z. Today's $2,884,120.33 reflects April activity, explicitly not returned as March close state.",
      version: "close\u00B7mar2025",
      Icon: Calendar,
      failTitle: "Today's book vs. bank, frozen close snapshot missing",
      failDesc:
        "Finance asked for March close. Surfacing April-adjusted balances misstates what the sub-certification attested to.",
    },
    {
      category: "Transaction lineage",
      human:
        "Where did GL line JE-2025-03-08-441 for $7,842.50 to expense account 6200-TRAVEL originate?",
      fail: "JE-2025-03-08-441: $7,842.50 Dr 6200-TRAVEL; memo: imported from bank feed.",
      succeed:
        "Lineage: Chase feed line chg_m4p\u2026 $7,842.50 2025-03-07 (MCC 4722, payee Delta Air Lines); categorization agent cat\u00B7v2 proposed 6200-TRAVEL @ 2025-03-07T19:03Z (confidence 0.94); human approver fin_ops@corp approved @ 2025-03-08T09:41Z; GL posting JE-2025-03-08-441 created @ 2025-03-08T09:42Z linking txn\u00B7v5 to je\u00B7v1. Full chain with dates and actor IDs.",
      version: "txn\u00B7v5",
      Icon: GitBranch,
      failTitle: "Import memo only, no agent or approval chain",
      failDesc:
        'SOX reviews need to know whether an agent, a rule, or a person placed spend in 6200. "Imported from bank feed" is not a control narrative.',
    },
  ],
  outcomeTitle: "From rolling balances to explainable financial state",
  outcomeSubtitle: "Before and after Neotoma",
  outcomeDesc:
    "Each scenario pairs the same question with two outcomes: one where only the latest reconciliation or GL view is visible, and one where audit dates, conflicts, close snapshots, and transaction chains are first-class queryable state.",
  howTitle: "How Neotoma hardens financial operations",
  steps: [
    {
      Icon: Upload,
      title: "Ingest every feed and post as an observation",
      desc: "Bank files, invoice extracts, ERP journals, and agent outputs become structured observations on transaction, account, reconciliation entry, ledger, and invoice entities. Nothing overwrites prior tie-outs.",
      detail:
        "Immutable history by default. Close and as-of views are computed from observations, not re-keyed spreadsheets.",
    },
    {
      Icon: Layers,
      title: "Project reconciliation and GL state through time",
      desc: "Month-end close freezes recon grids and material balances. Conflicting bank vs. AP amounts stay addressable with both timestamps and source system IDs until explicitly resolved with lineage.",
      detail:
        "Temporal queries return the state valid on the audit or close timestamp, not the last sync job.",
    },
    {
      Icon: Search,
      title: "Let finance agents answer with provenance",
      desc: "Reconciliation, categorization, and close agents read the same versioned graph. Responses cite observation IDs, feed hashes, and approvers so Controllers and external audit can defend the trail.",
      detail:
        "Built for SOX-style narratives: who matched what, when, and under which snapshot of the account.",
    },
  ],
  capTitle: "Capabilities built for close, recon, and audit",
  capSubtitle: "What you can ship",
  capDesc:
    "Model the entities your ERP and bank stack already imply, then add the integrity layer missing from feed-centric workflows: close snapshots, conflict preservation, and transaction lineage.",
  capabilities: [
    {
      Icon: ShieldCheck,
      title: "Audit-date and as-of balances",
      desc: "Reconstruct liabilities, accruals, and cash positions on any calendar date with ledger and account snapshots tied to journal and recon observations.",
      tags: ["ledger", "audit", "temporal"],
    },
    {
      Icon: AlertTriangle,
      title: "Reconciliation conflict preservation",
      desc: "Keep both sides when bank and invoice disagree, with ingest timestamps, source IDs, and exception lifecycle until a documented resolution links forward.",
      tags: ["reconciliation", "bank", "invoice"],
    },
    {
      Icon: Calendar,
      title: "Month-end close snapshots",
      desc: "Freeze tie-out state at close datetime including cleared vs. outstanding lines, preparer and reviewer attestations, and material account exceptions.",
      tags: ["close", "snapshot", "control"],
    },
    {
      Icon: GitBranch,
      title: "Transaction lineage to GL",
      desc: "Trace bank line to agent proposal to human approval to journal line with stable entity IDs for every hop regulators ask about.",
      tags: ["transaction", "provenance", "SOX"],
    },
    {
      Icon: Waypoints,
      title: "Multi-agent recon and categorization",
      desc: "Finance agents share one graph: matching bots, categorization models, and exception workflows emit observations that never replace history in place.",
      tags: ["agents", "reconciliation", "categorization"],
    },
    {
      Icon: Building2,
      title: "Control-friendly exports",
      desc: "Emit structured trails for internal and external audit: close packages, recon versions, and adjustment memos with graph links instead of flat PDFs only.",
      tags: ["audit", "export", "compliance"],
    },
  ],
  archHeadline: "Neotoma sits beneath your ERP, bank feeds, and finance agents",
  archDesc:
    "Keep NetSuite, SAP, Workday, or your GL as the system of record for posting. Neotoma is the integrity layer that remembers every reconciliation version, close snapshot, and transaction hop those tools were not designed to retain as queryable state.",
  archConfig: {
    topLabel: "Financial operations plane",
    topDesc:
      "Feeds, invoices, journals, and agents emit observations; Neotoma reduces them to authoritative snapshots for transactions, accounts, recon entries, ledgers, and invoices.",
    interfaces: [
      { label: "MCP tools", Icon: Plug },
      { label: "HTTP API", Icon: Layers },
      { label: "CLI & automations", Icon: Terminal },
    ],
    dataSources: [
      "Bank feeds (Plaid, SFTP BAI2, direct core)",
      "AP / invoice platforms (Coupa, Bill.com, SAP Ariba)",
      "ERP GL and subledger exports",
      "Payroll and accrual batch files",
      "Reconciliation and close workbooks",
      "Finance categorization and matching agents",
    ],
  },
  archSteps: [
    {
      label: "Normalize entities",
      desc: "Map each transaction, account, reconciliation entry, ledger slice, and invoice into typed entities with stable IDs across tools.",
    },
    {
      label: "Capture observations",
      desc: "Every feed refresh, match, agent suggestion, approval, and JE is stored append-only with source metadata and hashes where available.",
    },
    {
      label: "Compute snapshots",
      desc: "Project latest state per entity, or reconstruct historical state for audit dates, close datetimes, and investigation windows.",
    },
    {
      label: "Serve agents & auditors",
      desc: "Expose the same graph to recon bots, controllers, and external audit. No conflicting spreadsheets.",
    },
  ],
  caseStudy: {
    headline: "How financial operations teams use Neotoma as their integrity layer",
    desc:
      "AI-native financial close and reconciliation platforms automate bank tie-outs, exception routing, and GL posting for mid-market and enterprise finance teams. Neotoma versions every match decision, journal proposal, and recon entry so you can reconstruct close state at any audit date.",
    featuresHeading: "What financial operations teams build",
    features: [
      "Continuous bank-to-ledger matching with agent-proposed categorization across thousands of daily transactions",
      "Close calendars that orchestrate recon sign-offs and material account certifications",
      "CFO-facing narratives that summarize variance drivers with drill-down to source lines",
    ],
    guarantees: [
      "Immutable observations for every feed ingest, match decision, and agent-generated journal proposal",
      "Temporal snapshots so audit-date and month-end answers match attested close, not today's workspace",
      "Relationship integrity between transactions, invoices, reconciliation entries, and GL lines",
      "Audit-oriented exports that list versions, conflicts, and lineage in one graph",
    ],
    generalizesTitle: "If you run agent-assisted close and recon, you share the same risk surface",
    generalizesDesc:
      "Any team blending bank feeds, ERP, and autonomous matching or categorization needs the same guarantees: no silent recon overwrites, no orphan adjustments, and no guessing which snapshot was live on Dec 31. Neotoma generalizes the pattern to your stack.",
  },
  ctaHeadline: "Ship finance agents that can defend",
  ctaHighlight: "every balance they explain",
  ctaDesc:
    "Install Neotoma, connect feeds, ERP, and your agent mesh, and stop treating the latest recon grid as the database of record.",
  ctaFeatures: [
    "Open-source",
    "Enterprise SSO & RBAC",
    "Team deployment",
    "API compatibility guarantees",
  ],
  agentLabel: "finance agent",
};

export function FinancialOpsLandingPage() {
  return <UseCaseLandingShell config={CONFIG} />;
}
