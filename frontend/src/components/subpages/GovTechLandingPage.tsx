import {
  AlertTriangle,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  Clock,
  FileText,
  History,
  Landmark,
  Layers,
  Link2,
  Plug,
  Scale,
  Shield,
  Terminal,
  Upload,
  UserCheck,
} from "lucide-react";
import { UseCaseLandingShell, type UseCaseConfig } from "./use_case_landing/UseCaseLandingShell";

const CONFIG: UseCaseConfig = {
  accentColor: "slate",
  badgeIcon: Landmark,
  badgeText: "Neotoma for Public Sector",
  heroTitle: "Government decision state that survives",
  heroHighlight: "policy updates, eligibility changes, and inter-agency workflows",
  heroDesc:
    "Eligibility determinations, permit decisions, and benefits adjudications depend on rules that change quarterly and data that arrives from multiple agencies. Neotoma versions every entity so you can reconstruct which policy and evidence governed a decision on any date.",
  heroTags: [
    { tag: "determination", Icon: CheckSquare },
    { tag: "policy_version", Icon: FileText },
    { tag: "applicant", Icon: UserCheck },
    { tag: "case_record", Icon: ClipboardList },
    { tag: "agency", Icon: Landmark },
  ],
  heroFeatures: ["Open-source", "FedRAMP-compatible architecture", "Team deployment", "SOC 2 compatible"],
  analyticsPrefix: "govtech",
  problemTitle: "Case management systems store outcomes; they do not preserve the rules that produced them",
  problemDesc:
    "Government decisions are governed by statute, regulation, and policy guidance that change on legislative cycles. When an agent determines eligibility or routes a case, it evaluates a specific rule version against specific evidence. Current systems record the outcome but not the policy state and inputs that justified it.",
  problemCards: [
    {
      Icon: Clock,
      title: "No rule-version binding",
      desc: "Eligibility systems apply current rules to all queries. When policy changed on January 1, cases decided in December cannot be re-evaluated against the rules in effect at decision time.",
    },
    {
      Icon: Link2,
      title: "Broken evidence chains",
      desc: "Supporting documents arrive from applicants, other agencies, and automated checks. The determination record shows approved or denied but not which specific documents and data were evaluated.",
    },
    {
      Icon: AlertTriangle,
      title: "Inter-agency state gaps",
      desc: "Data from tax, labor, health, and identity agencies arrives at different times. When one agency updates a record after a decision, the original determination context is lost.",
    },
    {
      Icon: Scale,
      title: "Unexplainable automated decisions",
      desc: "Constituents and oversight bodies ask why a benefits claim was denied. Without temporal state, the answer is the current rule set, not the rule and evidence that applied when the decision was made.",
    },
  ],
  problemCallout: "Inspectors general, courts, and constituents require explainable, auditable government decisions.",
  problemCalloutDesc:
    "FOIA requests, administrative appeals, and IG investigations all ask the same question: under which rules and evidence was this decision made? Current systems answer with today's policy and the latest case file, not the state at determination time.",
  scenarios: [
    {
      category: "Eligibility audit",
      human: "Under which policy version was the Rodriguez family's SNAP eligibility determined on November 3?",
      fail: "Rodriguez household SNAP case SC-2024-88712: eligible, benefit amount $487/mo based on current income thresholds.",
      succeed:
        "Determination det\u00B7v3 on 2024-11-03: evaluated under policy pol_snap_fy2024_q4 (effective Oct 1, 2024). Household income $2,840/mo (wage data from state labor dept received Oct 28, wage\u00B7v2). Household size 4 (verified via cross-match with vital records Oct 15). Income threshold for HH-4 under that policy version: $3,007/mo. Result: ELIGIBLE, benefit $487/mo per allotment table v2024.4. Policy pol_snap_fy2025_q1 (effective Jan 1, 2025) raised the threshold to $3,142, but was not in effect at determination time.",
      version: "det\u00B7v3",
      Icon: CheckSquare,
      failTitle: "Current eligibility confirmed, policy version unlinked",
      failDesc:
        "An administrative law judge reviewing the case needs to know which income thresholds applied in November, not the current ones. Applying January's rules retroactively would misstate the determination basis.",
    },
    {
      category: "Permit decision reconstruction",
      human: "What environmental data was available when the county approved the Riverside industrial permit on August 15?",
      fail: "Riverside industrial permit PER-2024-3301: approved August 15, 2024. Current environmental assessment: satisfactory.",
      succeed:
        "Permit decision det\u00B7riverside_v2 on 2024-08-15: evaluated against: (1) Phase I ESA submitted Jul 22 (env_assessment\u00B7v1, no recognized environmental conditions). (2) Air quality index for zone 4: 68 (AQI reading Jul 30, env_data\u00B7v3). (3) Stormwater plan rev B filed Aug 1 (plan\u00B7v2). Phase II ESA (env_assessment\u00B7v3, flagging soil contamination in parcel NW quadrant) was submitted Sep 12, after approval. Zoning variance ZV-2024-018 referenced in approval was still under the pre-amendment code \u00A714.3.2.",
      version: "det\u00B7riverside_v2 @ 2024-08-15",
      Icon: FileText,
      failTitle: "Current permit status with post-decision data",
      failDesc:
        "The Phase II ESA that found contamination came after the approval. Mixing pre- and post-decision evidence in the record would misrepresent what the agency knew when it approved the permit.",
    },
    {
      category: "Benefits appeal",
      human: "Why was Mr. Okonkwo's unemployment extension denied on January 12, and what changed since his initial approval?",
      fail: "Mr. Okonkwo unemployment claim UC-2024-55190: extension denied January 12, 2025. Reason: income threshold exceeded.",
      succeed:
        "Initial approval det\u00B7v1 (Oct 5, 2024): eligible under pol_ui_extended_v3, no reported earnings. Extension review det\u00B7v4 (Jan 12, 2025): cross-match with IRS quarterly data (received Jan 8, income\u00B7v3) showed $4,200 1099 income Q4 2024, exceeding the $3,500 earnings disqualification threshold under pol_ui_extended_v3 \u00A77.2(b). Agent recommendation: DENY extension, confidence 0.94. Reviewer Kim confirmed Jan 12 14:30. Change from initial: no income data existed at Oct 5 determination. Full lineage at case_record\u00B7okonkwo_v4.",
      version: "case_record\u00B7okonkwo_v4",
      Icon: History,
      failTitle: "Denial reason given, evidence timeline missing",
      failDesc:
        "The appeal board needs to see that the income data was not available at initial approval and only arrived via cross-match in January. Without the timeline, the denial looks inconsistent with the original approval.",
    },
    {
      category: "Inter-agency reconciliation",
      human: "Which agencies contributed data to the Jenkins household's Medicaid redetermination, and when did each record arrive?",
      fail: "Jenkins household Medicaid case MC-2025-12044: redetermined eligible February 28, 2025.",
      succeed:
        "Redetermination det\u00B7v6 (Feb 28, 2025) assembled data from 4 sources: (1) State labor dept wage data received Feb 10 (income\u00B7v5, $3,100/mo). (2) SSA disability status received Feb 14 (benefit\u00B7v2, SSDI active $1,420/mo). (3) Tax dept 1099 cross-match received Feb 18 (income\u00B7v6, $800 Q4 gig earnings). (4) Vital records household update received Feb 22 (household\u00B7v3, household size changed 3 \u2192 4 after birth of child). Policy applied: pol_medicaid_fy2025_q1. Income calculated as $3,100 + $800/3 = $3,367/mo against modified adjusted gross income threshold for HH-4. Each source linked to observation with agency ID and receipt timestamp.",
      version: "det\u00B7v6",
      Icon: Landmark,
      failTitle: "Eligibility confirmed, agency data provenance absent",
      failDesc:
        "IG reviews of cross-agency determinations need to know which data arrived from which agency and when. A single \"eligible\" record does not support inter-agency reconciliation or fraud detection.",
    },
  ],
  outcomeTitle: "From opaque determinations to explainable government decisions",
  outcomeSubtitle: "Before and after Neotoma",
  outcomeDesc:
    "Each scenario pairs the same question with two outcomes: one where only the current status is visible, and one where policy versions, evidence timelines, and inter-agency data are first-class queryable state.",
  howTitle: "How Neotoma hardens government operations",
  steps: [
    {
      Icon: Upload,
      title: "Ingest every input as an observation",
      desc: "Applicant submissions, cross-agency data feeds, agent evaluations, and reviewer decisions become structured observations on determination, policy, applicant, and case record entities.",
      detail: "Append-only by default. No determination or policy change overwrites prior state.",
    },
    {
      Icon: Layers,
      title: "Project determination state through time",
      desc: "Link each decision to the policy version and evidence records available at determination time. Reconstruct what was known on any date without mixing pre- and post-decision data.",
      detail: "Temporal queries return the state valid at the as-of date, not the latest case file update.",
    },
    {
      Icon: Shield,
      title: "Let agents and reviewers answer with provenance",
      desc: "Eligibility agents, appeals officers, and IG investigators query the same versioned graph. Responses cite policy versions, evidence sources, and agency data timestamps.",
      detail: "Built for FOIA, administrative appeals, and IG investigations: which rules, which evidence, which agency, when.",
    },
  ],
  capTitle: "Capabilities built for government accountability and decision integrity",
  capSubtitle: "What you can ship",
  capDesc:
    "Model the entities your case management system already names, then add the integrity layer those systems never had: policy-version binding, inter-agency provenance, and temporal evidence chains.",
  capabilities: [
    {
      Icon: CheckSquare,
      title: "Policy-version-bound determinations",
      desc: "Bind each eligibility or permit decision to the exact policy version, threshold table, and regulatory guidance in effect at decision time. Reconstruct any past determination against its original rules.",
      tags: ["determination", "policy", "audit"],
    },
    {
      Icon: Landmark,
      title: "Inter-agency data provenance",
      desc: "Track which agency contributed which data record and when it arrived. Support cross-agency reconciliation, fraud detection, and IG review without manual data assembly.",
      tags: ["agency", "data", "provenance"],
    },
    {
      Icon: History,
      title: "Evidence timeline reconstruction",
      desc: "Show the sequence of applicant submissions, cross-matches, and verifications that led to a determination. Separate what was available before vs. after the decision.",
      tags: ["evidence", "temporal", "appeal"],
    },
    {
      Icon: Scale,
      title: "Automated decision explainability",
      desc: "When an agent recommends approve or deny, capture the rule path, input values, confidence level, and human reviewer confirmation as linked observations.",
      tags: ["determination", "agent", "transparency"],
    },
    {
      Icon: CalendarClock,
      title: "Point-in-time case state",
      desc: "Answer what the case record showed on any date relevant to an appeal, FOIA request, or legislative inquiry. Essential when policy changed between determination and review.",
      tags: ["case_record", "temporal", "FOIA"],
    },
    {
      Icon: UserCheck,
      title: "Constituent-facing audit trails",
      desc: "Generate structured explanations for applicants: which documents were evaluated, which rules applied, and what would need to change for a different outcome.",
      tags: ["applicant", "transparency", "export"],
    },
  ],
  archHeadline: "Neotoma sits beneath your case management and eligibility systems",
  archDesc:
    "Keep your existing case management platform, eligibility engine, and inter-agency data exchange as systems of workflow. Neotoma is the integrity layer that remembers every policy version, evidence record, and decision input those systems were not designed to retain as queryable state.",
  archConfig: {
    topLabel: "Government operations plane",
    topDesc:
      "Agents, caseworkers, and inter-agency feeds emit observations. Neotoma reduces them to authoritative snapshots for determinations, policies, applicants, case records, and agencies.",
    interfaces: [
      { label: "MCP tools", Icon: Plug },
      { label: "HTTP API", Icon: Layers },
      { label: "CLI & automations", Icon: Terminal },
    ],
    dataSources: [
      "Case management systems (Salesforce Gov, Appian, custom)",
      "Eligibility engines and rules platforms",
      "Inter-agency data exchanges (IRS, SSA, state labor, vital records)",
      "Applicant portals and document upload systems",
      "Agent evaluation and recommendation engines",
    ],
  },
  archSteps: [
    {
      label: "Normalize entities",
      desc: "Map each determination, policy version, applicant, case record, and contributing agency into typed entities with stable IDs shared across systems.",
    },
    {
      label: "Capture observations",
      desc: "Every applicant submission, cross-agency record, agent evaluation, and reviewer decision is stored as an append-only observation with source metadata.",
    },
    {
      label: "Compute snapshots",
      desc: "Project the latest determination state per entity, or reconstruct historical state for any timestamp relevant to an appeal, audit, or legislative review.",
    },
    {
      label: "Serve agents & reviewers",
      desc: "Expose the same graph to eligibility agents, appeals officers, and IG teams. No duplicate case extracts or conflicting spreadsheets.",
    },
  ],
  caseStudy: {
    headline: "How government technology teams use Neotoma as their integrity layer",
    desc:
      "AI platforms for government agencies automate eligibility screening, cross-agency data reconciliation, and constituent communication for benefits programs. Neotoma versions every evaluation, policy application, and determination so you can reconstruct the evidence and rules that governed each decision.",
    featuresHeading: "What government technology teams build",
    features: [
      "Eligibility agents that evaluate multi-program rules (SNAP, Medicaid, TANF) against real-time cross-agency data feeds",
      "Automated redetermination scheduling with evidence gap detection and applicant outreach",
      "Constituent-facing explanation generation for denial letters and appeal guidance",
    ],
    guarantees: [
      "Immutable observations for every cross-agency data receipt, agent evaluation, and reviewer decision",
      "Temporal snapshots so appeals reference the policy version and evidence available at determination time",
      "Relationship integrity between applicants, case records, agency data sources, and determination outcomes",
      "Audit-oriented exports that trace decisions from rule version through evidence inputs to final outcome",
    ],
    generalizesTitle: "If agents make government decisions, you need reconstructable determination state",
    generalizesDesc:
      "Any agency deploying agents for eligibility, permitting, or benefits adjudication faces the same requirement: prove which rules and evidence governed each decision. Neotoma generalizes the pattern to your government stack.",
  },
  ctaHeadline: "Ship government agents that can defend",
  ctaHighlight: "every determination they make",
  ctaDesc:
    "Install Neotoma, connect your eligibility engine and inter-agency data feeds, and stop treating the latest case file as the audit trail.",
  ctaFeatures: ["Open-source", "FedRAMP-compatible architecture", "Team deployment", "API compatibility guarantees"],
  agentLabel: "eligibility agent",
};

export function GovTechLandingPage() {
  return <UseCaseLandingShell config={CONFIG} />;
}
