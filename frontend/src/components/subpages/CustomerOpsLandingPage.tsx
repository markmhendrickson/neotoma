import {
  ArrowLeftRight,
  CalendarClock,
  Clock,
  FileText,
  GitCompare,
  Headphones,
  History,
  Layers,
  Link2,
  MessageSquare,
  Plug,
  RefreshCw,
  Terminal,
  Upload,
  UserCheck,
  Users,
} from "lucide-react";
import { UseCaseLandingShell, type UseCaseConfig } from "./use_case_landing/UseCaseLandingShell";

const CONFIG: UseCaseConfig = {
  accentColor: "pink",
  badgeIcon: Headphones,
  badgeText: "Neotoma for Customer Ops",
  heroTitle: "Support and CX state that survives",
  heroHighlight: "escalations, routing decisions, and multi-agent resolution chains",
  heroDesc:
    "Customer issues pass through triage agents, routing logic, human reps, and follow-up bots. Neotoma versions every interaction entity so you can reconstruct why a case was routed, escalated, or resolved the way it was.",
  heroTags: [
    { tag: "ticket", Icon: FileText },
    { tag: "routing_decision", Icon: ArrowLeftRight },
    { tag: "customer", Icon: UserCheck },
    { tag: "interaction", Icon: MessageSquare },
    { tag: "escalation", Icon: Users },
  ],
  heroFeatures: ["Open-source", "Enterprise SSO & RBAC", "Team deployment", "SOC 2 compatible"],
  analyticsPrefix: "customer_ops",
  problemTitle: "Helpdesks store tickets; they do not preserve routing rationale or resolution context",
  problemDesc:
    "Support tickets move through triage, routing, specialist queues, and resolution. At each stage, agents and humans add context, change priority, reroute, or escalate. When a customer complains about their experience or an ops lead investigates CSAT drops, the reasoning behind each handoff is gone.",
  problemCards: [
    {
      Icon: Clock,
      title: "No routing decision history",
      desc: "Tickets show current assignment and queue. They do not capture why the triage agent chose billing over technical, or which queue state and customer signals drove the routing.",
    },
    {
      Icon: Link2,
      title: "Broken escalation chains",
      desc: "Escalations lose the context that triggered them. The receiving agent sees the ticket but not the failed resolution attempt, the sentiment shift, or the policy exception that forced the escalation.",
    },
    {
      Icon: RefreshCw,
      title: "Silent priority changes",
      desc: "Priority and SLA tier update in place. When a VIP flag was added at 2pm but the response missed the 1-hour window, there is no record of when the priority actually changed.",
    },
    {
      Icon: GitCompare,
      title: "Conflicting agent responses",
      desc: "Multiple agents touch the same case across shifts and channels. When the customer received contradictory answers, nobody can trace which agent said what based on which state of the ticket.",
    },
  ],
  problemCallout: "\"Why was my issue handled this way?\" requires temporal state, not a current ticket summary.",
  problemCalloutDesc:
    "SLA reporting, CSAT root cause analysis, and customer escalation reviews all need the same thing: a reconstructable chain from first contact through every routing decision, agent interaction, and resolution attempt. Current helpdesk exports show the final state, not the path.",
  scenarios: [
    {
      category: "Routing investigation",
      human: "Why was the Patel account's outage ticket routed to billing instead of infrastructure?",
      fail: "Ticket TK-2025-44891 for Patel account: currently assigned to infrastructure team. Priority: critical.",
      succeed:
        "Initial routing decision routing\u00B7v1 at 2025-03-10 09:14 UTC: triage agent classified as billing (confidence 0.71) based on: (1) customer message mentioned \"invoice\" and \"charges\" (NLP classification), (2) account had open billing dispute BD-4401 (customer\u00B7patel snapshot showed dispute active). Rerouted to infrastructure at 09:42 (routing\u00B7v2) after human rep Jasmine Torres identified the \"charges\" reference was about overage from the outage, not a billing error. Escalation trigger: customer reply at 09:38 included \"my servers are down.\" Full routing chain: triage \u2192 billing queue (28min) \u2192 infrastructure. Prior context at ticket\u00B7v1 through v3.",
      version: "ticket\u00B7v3",
      Icon: ArrowLeftRight,
      failTitle: "Current assignment visible, routing reasoning lost",
      failDesc:
        "The ticket now sits in the right queue, but ops cannot explain the 28-minute misroute. Without the triage agent's classification inputs and the reroute trigger, the same pattern will repeat.",
    },
    {
      category: "SLA breach analysis",
      human: "When did the Meridian Enterprise ticket actually become P1, and did we meet the SLA from that point?",
      fail: "Ticket TK-2025-52003 for Meridian Enterprise: P1, SLA response target 1hr, first response sent 45 min after creation.",
      succeed:
        "Ticket created 2025-03-14 14:00 as P2 (ticket\u00B7v1, auto-classified by triage agent). Upgraded to P1 at 15:22 (ticket\u00B7v3) after account manager flagged VIP status and customer called in (escalation\u00B7v1). First substantive response from specialist at 16:45 (interaction\u00B7v4). From P1 timestamp (15:22) to first response (16:45): 83 minutes, exceeding the 60-minute P1 SLA by 23 minutes. From ticket creation (14:00) to first response: 165 minutes. The 45-minute figure in the dashboard measures from the auto-generated acknowledgment at 14:02, not from a human or specialist response.",
      version: "ticket\u00B7v3",
      Icon: CalendarClock,
      failTitle: "SLA reported as met, priority change timeline missing",
      failDesc:
        "The dashboard counted the auto-ack as first response and measured from creation, not from the P1 upgrade. Without priority change timestamps, SLA reporting masks real response gaps.",
    },
    {
      category: "Contradictory answers",
      human: "Customer Nguyen says they were told refund was approved on Tuesday, but Wednesday's agent denied it. What happened?",
      fail: "Customer Nguyen refund request: denied per current refund policy. No active refund.",
      succeed:
        "Tuesday interaction\u00B7v2 (Mar 11 11:20): agent Maya Lin reviewed ticket with product return within 30-day window (order\u00B7v4 shipped Feb 12, return requested Mar 11). Agent approved per policy pol_refund_v8 \u00A73.1 (within window). Wednesday interaction\u00B7v4 (Mar 12 09:15): agent Derek Cho saw the return had not been received in warehouse (return_status\u00B7v1: in transit). Cho applied pol_refund_v8 \u00A73.4 (refund issued on warehouse receipt, not on approval). Both agents were correct under different policy subsections. Lin committed to refund eligibility; Cho flagged the processing hold. Neither statement was wrong, but the customer experienced a contradiction. Full chain at ticket\u00B7nguyen_v4.",
      version: "ticket\u00B7nguyen_v4",
      Icon: MessageSquare,
      failTitle: "Current denial visible, Tuesday's approval context erased",
      failDesc:
        "Without both interactions linked to the policy subsections each agent applied, the resolution team cannot explain the contradiction to the customer or fix the process gap.",
    },
    {
      category: "Escalation reconstruction",
      human: "What triggered the executive escalation on the Brightforge account, and what had already been tried?",
      fail: "Brightforge account: executive escalation active, assigned to VP of Customer Success.",
      succeed:
        "Escalation chain for Brightforge: (1) Initial ticket TK-2025-48201 opened Feb 24, P2 integration failure (ticket\u00B7v1). (2) Specialist attempted fix Feb 25, config patch applied (interaction\u00B7v3). (3) Customer reported recurrence Feb 27 (interaction\u00B7v5), ticket upgraded to P1. (4) Engineering escalation Mar 1 after second fix failed (escalation\u00B7v2, linked to incident INC-0891). (5) Customer CEO emailed your CEO Mar 3 (escalation\u00B7v4, source: executive_inbox_monitor). Each step captured with agent/human identity, attempted resolution, and outcome. Three distinct fix attempts preceded the executive escalation.",
      version: "escalation\u00B7v4",
      Icon: Users,
      failTitle: "Executive escalation visible, prior attempts invisible",
      failDesc:
        "The VP needs the full resolution history before the exec call. Without the chain of attempts and failures, the response team starts from scratch and risks repeating failed approaches.",
    },
  ],
  outcomeTitle: "From closed tickets to reconstructable support operations",
  outcomeSubtitle: "Before and after Neotoma",
  outcomeDesc:
    "Each scenario pairs the same question with two outcomes: one where only the current ticket state is visible, and one where routing decisions, escalation chains, and interaction timelines are first-class queryable state.",
  howTitle: "How Neotoma hardens customer operations",
  steps: [
    {
      Icon: Upload,
      title: "Ingest every support event as an observation",
      desc: "Triage classifications, routing decisions, agent responses, priority changes, and escalation triggers become structured observations on ticket, customer, interaction, and escalation entities.",
      detail: "Append-only by default. No ticket update overwrites prior routing or resolution context.",
    },
    {
      Icon: Layers,
      title: "Project support state through time",
      desc: "Link routing decisions to queue state and customer signals. Trace escalations back to failed resolution attempts. Reconstruct SLA timelines against actual priority change timestamps.",
      detail: "Temporal queries return the state valid at the as-of timestamp, not the latest ticket update.",
    },
    {
      Icon: Headphones,
      title: "Let agents and ops leads answer with provenance",
      desc: "Support agents, CSAT analysts, and ops leads query the same versioned graph. Responses cite routing inputs, agent identities, and interaction timestamps so answers are defensible.",
      detail: "Built for SLA audits, CSAT investigations, and executive escalation reviews: who did what, when, and why.",
    },
  ],
  capTitle: "Capabilities built for support integrity and operational visibility",
  capSubtitle: "What you can ship",
  capDesc:
    "Model the entities your helpdesk already names, then add the integrity layer those systems never had: routing rationale, escalation lineage, and interaction-level provenance.",
  capabilities: [
    {
      Icon: ArrowLeftRight,
      title: "Routing decision provenance",
      desc: "Capture the classification inputs, queue state, and customer signals that drove each routing decision. Explain misroutes and optimize triage without guessing.",
      tags: ["routing_decision", "triage", "audit"],
    },
    {
      Icon: Users,
      title: "Escalation chain reconstruction",
      desc: "Link every escalation to the prior resolution attempts, failure reasons, and trigger events. Give receiving agents the full context without re-reading the entire thread.",
      tags: ["escalation", "resolution", "provenance"],
    },
    {
      Icon: CalendarClock,
      title: "SLA timeline accuracy",
      desc: "Track priority changes, assignment shifts, and response timestamps as a versioned timeline. Measure SLA compliance against actual priority state, not ticket creation time.",
      tags: ["ticket", "SLA", "temporal"],
    },
    {
      Icon: MessageSquare,
      title: "Interaction-level answer tracing",
      desc: "Bind each agent response to the ticket state and policy version at the time of the interaction. Trace contradictory answers to the specific inputs each agent evaluated.",
      tags: ["interaction", "policy", "consistency"],
    },
    {
      Icon: History,
      title: "Point-in-time ticket state",
      desc: "Answer what the ticket showed at any moment: priority, assignment, open interactions, and customer sentiment. Essential for CSAT root cause analysis.",
      tags: ["ticket", "temporal", "reporting"],
    },
    {
      Icon: UserCheck,
      title: "Customer journey exports",
      desc: "Generate structured trails of the full resolution path: from first contact through routing, escalation, and resolution with agent identities and timestamps at each step.",
      tags: ["customer", "journey", "export"],
    },
  ],
  archHeadline: "Neotoma sits beneath your helpdesk and CX automation layer",
  archDesc:
    "Keep Zendesk, Intercom, Salesforce Service Cloud, or your custom helpdesk as the system of record. Neotoma is the integrity layer that remembers every routing decision, escalation chain, and interaction context those tools were not designed to retain as queryable state.",
  archConfig: {
    topLabel: "Customer operations plane",
    topDesc:
      "Triage agents, support reps, and CX bots emit observations. Neotoma reduces them to authoritative snapshots for tickets, customers, interactions, routing decisions, and escalations.",
    interfaces: [
      { label: "MCP tools", Icon: Plug },
      { label: "HTTP API", Icon: Layers },
      { label: "CLI & automations", Icon: Terminal },
    ],
    dataSources: [
      "Helpdesk platforms (Zendesk, Intercom, Freshdesk)",
      "CRM and account management systems",
      "Chat and voice channel transcripts",
      "Triage and routing agent outputs",
      "CSAT/NPS survey responses and sentiment feeds",
    ],
  },
  archSteps: [
    {
      label: "Normalize entities",
      desc: "Map each ticket, customer, interaction, routing decision, and escalation into typed entities with stable IDs shared across channels.",
    },
    {
      label: "Capture observations",
      desc: "Every triage classification, routing change, agent response, priority update, and escalation trigger is stored as an append-only observation with source metadata.",
    },
    {
      label: "Compute snapshots",
      desc: "Project the latest ticket state per entity, or reconstruct historical state for any timestamp relevant to an SLA review, CSAT investigation, or escalation debrief.",
    },
    {
      label: "Serve agents & ops leads",
      desc: "Expose the same graph to support agents, quality analysts, and operations leads. No conflicting ticket exports or stale escalation summaries.",
    },
  ],
  caseStudy: {
    headline: "How customer operations teams use Neotoma as their integrity layer",
    desc:
      "AI-native customer operations platforms automate triage, routing, and multi-channel resolution for SaaS and e-commerce support teams. Neotoma versions every routing decision, priority change, and interaction so you can reconstruct support state at any SLA audit or CSAT investigation point.",
    featuresHeading: "What customer operations teams build",
    features: [
      "Triage agents that classify and route tickets across billing, technical, and account queues with real-time queue balancing",
      "Multi-channel interaction management spanning chat, email, voice, and social with unified customer context",
      "Escalation prediction and proactive intervention before CSAT scores deteriorate",
    ],
    guarantees: [
      "Immutable observations for every routing decision, priority change, and agent interaction",
      "Temporal snapshots so SLA audits and CSAT investigations reference the ticket state at the time in question",
      "Relationship integrity between customers, tickets, interactions, and escalation chains",
      "Audit-oriented exports that trace the full resolution path from first contact through every handoff to closure",
    ],
    generalizesTitle: "If agents route, respond, and escalate, you need reconstructable support state",
    generalizesDesc:
      "Any team running support agents for triage, routing, or resolution faces the same requirement: explain why a case was handled the way it was. Neotoma generalizes the pattern to your CX stack.",
  },
  ctaHeadline: "Ship support agents that can explain",
  ctaHighlight: "every routing and resolution decision",
  ctaDesc:
    "Install Neotoma, connect your helpdesk and CX automation layer, and stop treating the latest ticket state as the full story.",
  ctaFeatures: ["Open-source", "Enterprise SSO & RBAC", "Team deployment", "API compatibility guarantees"],
  agentLabel: "support agent",
};

export function CustomerOpsLandingPage() {
  return <UseCaseLandingShell config={CONFIG} />;
}
