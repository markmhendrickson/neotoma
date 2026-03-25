import {
  Activity,
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  Clock,
  FileText,
  Heart,
  History,
  Layers,
  Link2,
  Plug,
  Stethoscope,
  Terminal,
  Upload,
  UserCheck,
  Users,
} from "lucide-react";
import { VerticalLandingShell, type VerticalConfig } from "./vertical_landing/VerticalLandingShell";

const CONFIG: VerticalConfig = {
  accentColor: "rose",
  badgeIcon: Heart,
  badgeText: "Neotoma for Healthcare",
  heroTitle: "Clinical and operational state that survives",
  heroHighlight: "handoffs, revisions, and multi-agent care coordination",
  heroDesc:
    "Patient records, treatment plans, and prior authorizations change through every shift, consult, and agent action. Neotoma versions entity state so you can answer what was known about a patient at any point in their care timeline.",
  heroTags: [
    { tag: "patient", Icon: UserCheck },
    { tag: "encounter", Icon: Stethoscope },
    { tag: "care_plan", Icon: ClipboardList },
    { tag: "authorization", Icon: FileText },
    { tag: "provider", Icon: Users },
  ],
  heroFeatures: [
    "Open-source",
    "HIPAA-compatible architecture",
    "Team deployment",
    "SOC 2 compatible",
  ],
  analyticsPrefix: "healthcare",
  problemTitle: "EHR systems store records; they do not preserve decision context",
  problemDesc:
    "Clinical decisions depend on what was known at the time: lab results, imaging reads, specialist notes, and prior auth status. When multiple agents and clinicians update the same patient record across shifts and referrals, the inputs that drove a specific decision get overwritten by the next update.",
  problemCards: [
    {
      Icon: Clock,
      title: "No decision-time reconstruction",
      desc: "The EHR shows current vitals and active orders. It cannot reconstruct which labs and notes were available when the night-shift agent recommended a dosage change at 3am.",
    },
    {
      Icon: Link2,
      title: "Broken care plan lineage",
      desc: "Treatment plans update in place. When a specialist revises a recommendation, the original rationale and the evidence it was based on are no longer queryable.",
    },
    {
      Icon: AlertTriangle,
      title: "Authorization state drift",
      desc: "Prior auth approvals, denials, and appeals overwrite each other. Billing cannot prove what authorization status existed when a procedure was performed.",
    },
    {
      Icon: Activity,
      title: "Opaque handoff context",
      desc: "Shift changes and referrals lose the reasoning trail. The receiving team sees current orders but not why a previous clinician or agent chose a specific path.",
    },
  ],
  problemCallout:
    "Regulators, payers, and malpractice review boards need temporal evidence, not current state.",
  problemCalloutDesc:
    "HIPAA audits, payer disputes, and quality reviews all ask the same question: what was known, and what was the basis for the decision at the time it was made? Current EHR snapshots answer what is true now, not what was true then.",
  scenarios: [
    {
      category: "Clinical decision audit",
      human:
        "What information was available when the agent recommended switching Mrs. Chen to IV antibiotics at 3:12am on March 8?",
      fail: "Mrs. Chen is currently on IV ceftriaxone 2g daily, started March 8. Culture results show E. coli sensitive to ceftriaxone.",
      succeed:
        'At 2025-03-08 03:12 UTC, the clinical agent evaluated: (1) temp 39.4\u00B0C at 02:45 (vitals\u00B7v18), (2) oral amoxicillin started Mar 6 (order\u00B7v3), (3) preliminary urine culture "gram-negative rods" at 01:30 (lab\u00B7v7, final sensitivity not yet available). Agent recommendation: escalate to IV ceftriaxone, confidence 0.87, reasoning linked to sepsis protocol SP-2024.3 \u00A74.2. Attending Dr. Okafor confirmed 03:28. Culture final (E. coli, ceftriaxone sensitive) arrived 11:40, after the decision. Full inputs at encounter\u00B7v18 @ 2025-03-08T03:12.',
      version: "encounter\u00B7v18",
      Icon: Stethoscope,
      failTitle: "Current treatment confirmed, decision inputs missing",
      failDesc:
        "The assistant confirmed today's regimen but could not show what the agent knew at 3am. The culture sensitivity that justifies the choice was not available until 8 hours later.",
    },
    {
      category: "Prior authorization dispute",
      human:
        "What was the authorization status for Mr. Reeves' cardiac MRI when it was performed on February 20?",
      fail: "Mr. Reeves' cardiac MRI (order ORD-8891) has prior auth status: denied. Appeal submitted February 25.",
      succeed:
        "As of 2025-02-20 10:00 (procedure start), auth\u00B7v4 showed status APPROVED (auto-approved Feb 18 via payer portal, ref PA-2025-44102). Denial auth\u00B7v6 posted Feb 22 after retrospective review. Appeal filed Feb 25 (auth\u00B7v7). The procedure was performed under a valid approval. Timeline: requested Feb 16 \u2192 approved Feb 18 \u2192 performed Feb 20 \u2192 retro-denied Feb 22 \u2192 appeal Feb 25. Snapshot auth\u00B7v4 @ 2025-02-20 confirms approval was active at procedure time.",
      version: "auth\u00B7v4 @ 2025-02-20",
      Icon: FileText,
      failTitle: "Current denial status returned for a historical question",
      failDesc:
        "Billing sees the denial and assumes the procedure lacked authorization. The temporal record shows it was approved when performed, which is the fact that matters for the appeal.",
    },
    {
      category: "Care plan evolution",
      human:
        "How has the diabetes management plan for patient Alvarez changed since her last A1C result?",
      fail: "Patient Alvarez diabetes plan: metformin 1000mg BID, GLP-1 weekly, target A1C < 7.0.",
      succeed:
        "Last A1C result: 7.8% received 2025-01-14 (lab\u00B7v12). Plan changes since: (1) Jan 16, endocrine agent recommended adding GLP-1 agonist (care_plan\u00B7v5, citing A1C trend 7.2 \u2192 7.8 over 6mo). (2) Jan 18, Dr. Patel approved with modification: weekly semaglutide 0.5mg start, titrate at 4wk (care_plan\u00B7v6). (3) Feb 15, agent flagged weight loss > 5% and recommended holding titration (care_plan\u00B7v7). Prior plan (care_plan\u00B7v4): metformin monotherapy, target < 7.0. Each version linked to triggering lab or clinical observation.",
      version: "care_plan\u00B7v7",
      Icon: ClipboardList,
      failTitle: "Current regimen listed, evolution and reasoning invisible",
      failDesc:
        "The current plan says what medications are active. It does not show why the GLP-1 was added, what triggered the titration hold, or how the plan evolved in response to lab results.",
    },
    {
      category: "Handoff reconstruction",
      human:
        "What was communicated during the 7pm shift handoff for bed 12 in the ICU on March 15?",
      fail: "Bed 12 ICU: patient Davis, 68M, post-CABG day 2, hemodynamically stable, on heparin drip.",
      succeed:
        "Handoff snapshot encounter\u00B7davis_icu @ 2025-03-15T19:00: outgoing RN Martinez flagged: (1) heparin drip adjusted 16:30 from 1200 to 1400 units/hr after PTT 42 (target 60\u201380), (2) chest tube output 180mL over 4hr (trending down from 320mL prior shift), (3) family meeting scheduled Mar 16 09:00 per Dr. Nakamura. Agent-generated summary included all 3 items plus pending AM labs. Incoming RN acknowledged 19:08. Subsequent PTT at 22:00 was 58 (lab\u00B7v9). No items from this handoff were in the prior shift's note.",
      version: "encounter\u00B7davis_icu @ 2025-03-15T19:00",
      Icon: Users,
      failTitle: "Current patient summary, not shift-specific handoff",
      failDesc:
        "The current summary reflects the latest state. If a post-handoff complication occurs, the care team needs to know exactly what was communicated at 7pm, not what the chart says now.",
    },
  ],
  outcomeTitle: "From overwritten charts to reconstructable clinical state",
  outcomeSubtitle: "Before and after Neotoma",
  outcomeDesc:
    "Each scenario pairs the same question with two outcomes: one where only the current record is visible, and one where clinical decisions, authorizations, and handoffs are queryable in time.",
  howTitle: "How Neotoma hardens healthcare operations",
  steps: [
    {
      Icon: Upload,
      title: "Ingest every clinical touch as an observation",
      desc: "Lab results, orders, notes, agent recommendations, auth decisions, and handoff summaries become structured observations on patient, encounter, care plan, and authorization entities.",
      detail: "Append-only by default. No clinical input overwrites a prior observation.",
    },
    {
      Icon: Layers,
      title: "Project clinical state through time",
      desc: "Link care plan changes to triggering labs, orders to authorizations, and handoff items to shift boundaries. Reconstruct what was known at any moment in the care timeline.",
      detail:
        "Temporal queries return the state valid at the as-of instant, not the last EHR sync.",
    },
    {
      Icon: Stethoscope,
      title: "Let agents and clinicians answer with provenance",
      desc: "Clinical agents, quality reviewers, and billing teams query the same versioned graph. Responses cite observation IDs, clinician identities, and timestamps so answers are defensible.",
      detail:
        "Built for payer audits, quality reviews, and malpractice defense: what was known, by whom, and when.",
    },
  ],
  capTitle: "Capabilities built for clinical integrity and operational auditability",
  capSubtitle: "What you can ship",
  capDesc:
    "Model the entities your EHR and care coordination systems already name, then add the integrity layer those systems never had: decision context, temporal lineage, and audit-ready provenance.",
  capabilities: [
    {
      Icon: Stethoscope,
      title: "Clinical decision reconstruction",
      desc: "Bind agent and clinician decisions to the labs, vitals, and notes available at decision time. Reconstruct the inputs for any order, recommendation, or escalation.",
      tags: ["encounter", "decision", "audit"],
    },
    {
      Icon: FileText,
      title: "Authorization lifecycle tracking",
      desc: "Track prior auth requests, approvals, denials, and appeals as a timeline. Prove what authorization status existed when a procedure was performed.",
      tags: ["authorization", "payer", "billing"],
    },
    {
      Icon: ClipboardList,
      title: "Care plan version lineage",
      desc: "Link every plan revision to the clinical observation that triggered it. Show the path from lab result to medication change to outcome, with each step timestamped.",
      tags: ["care_plan", "treatment", "provenance"],
    },
    {
      Icon: Users,
      title: "Shift handoff snapshots",
      desc: "Capture what was communicated at each handoff with incoming/outgoing identities and acknowledgment timestamps. Separate from the current chart summary.",
      tags: ["encounter", "handoff", "safety"],
    },
    {
      Icon: History,
      title: "Point-in-time patient state",
      desc: "Answer what was the diagnosis, medication list, and active orders at any historical moment. Essential for quality reviews, incident investigations, and payer disputes.",
      tags: ["patient", "temporal", "reporting"],
    },
    {
      Icon: CalendarClock,
      title: "Compliance-ready exports",
      desc: "Generate structured trails for HIPAA audits, quality committees, and payer reviews: clinical decisions, authorization states, and care plan changes with provenance chains.",
      tags: ["HIPAA", "audit", "export"],
    },
  ],
  archHeadline: "Neotoma sits beneath your EHR, care coordination, and payer integration layers",
  archDesc:
    "Keep Epic, Cerner, or your homegrown clinical systems as systems of record. Neotoma is the integrity layer that remembers every clinical decision, authorization change, and handoff context those systems were not designed to retain as queryable state.",
  archConfig: {
    topLabel: "Healthcare operations plane",
    topDesc:
      "Clinicians, agents, and payer systems emit observations. Neotoma reduces them to authoritative snapshots for patients, encounters, care plans, authorizations, and providers.",
    interfaces: [
      { label: "MCP tools", Icon: Plug },
      { label: "HTTP API", Icon: Layers },
      { label: "CLI & automations", Icon: Terminal },
    ],
    dataSources: [
      "EHR systems (Epic, Cerner, Allscripts)",
      "Payer portals and prior auth APIs",
      "Lab and imaging result feeds (HL7 / FHIR)",
      "Clinical agent outputs and recommendation engines",
      "Care coordination and discharge planning tools",
    ],
  },
  archSteps: [
    {
      label: "Normalize entities",
      desc: "Map each patient, encounter, care plan, authorization, and provider into typed entities with stable IDs shared across systems.",
    },
    {
      label: "Capture observations",
      desc: "Every lab result, order, note, agent recommendation, and auth decision is stored as an append-only observation with source metadata.",
    },
    {
      label: "Compute snapshots",
      desc: "Project the latest clinical state per entity, or reconstruct historical state for any timestamp relevant to a quality review, audit, or dispute.",
    },
    {
      label: "Serve agents & reviewers",
      desc: "Expose the same graph to clinical agents, quality teams, and billing reviewers. No conflicting chart extracts or stale printouts.",
    },
  ],
  caseStudy: {
    companyName: "CareGraph",
    companyUrl: "https://caregraph.example.com",
    companyDesc:
      "is a fictional AI-native care coordination platform that automates clinical documentation, prior auth management, and shift handoff summaries for hospital systems.",
    features: [
      "Clinical agents that generate shift summaries and flag deterioration patterns across ICU and med-surg units",
      "Automated prior authorization submission and appeal tracking with payer portal integration",
      "Patient timeline views that synthesize EHR data, agent recommendations, and clinician notes",
    ],
    guarantees: [
      "Immutable observations for every clinical input, agent recommendation, and authorization state change",
      'Temporal snapshots so "what was known at decision time" uses the chart state at that moment, not the latest update',
      "Relationship integrity between patients, encounters, care plans, and authorization records",
      "Audit-oriented exports that trace clinical decisions from triggering observation through agent recommendation to clinician action",
    ],
    generalizesTitle: "If agents touch clinical data, you need reconstructable healthcare state",
    generalizesDesc:
      "Any team deploying clinical agents for documentation, triage, prior auth, or care coordination faces the same requirement: prove what was known when a decision was made. Neotoma generalizes the CareGraph pattern to your clinical stack.",
  },
  ctaHeadline: "Ship clinical agents that can defend",
  ctaHighlight: "every decision they supported",
  ctaDesc:
    "Install Neotoma, connect your EHR and care coordination layer, and stop treating the latest chart extract as the record of truth.",
  ctaFeatures: [
    "Open-source",
    "HIPAA-compatible architecture",
    "Team deployment",
    "API compatibility guarantees",
  ],
  agentLabel: "clinical agent",
};

export function HealthcareLandingPage() {
  return <VerticalLandingShell config={CONFIG} />;
}
