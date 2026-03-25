import {
  AlertTriangle,
  FileKey,
  Fingerprint,
  GitBranch,
  History,
  Key,
  Layers,
  Link2,
  Lock,
  Plug,
  RefreshCw,
  Shield,
  ShieldCheck,
  Terminal,
  Upload,
  UserCheck,
  Users,
} from "lucide-react";
import { VerticalLandingShell, type VerticalConfig } from "./vertical_landing/VerticalLandingShell";

const CONFIG: VerticalConfig = {
  accentColor: "blue",
  badgeIcon: Shield,
  badgeText: "Neotoma for Agent Authorization",
  heroTitle: "Authorization state that survives",
  heroHighlight: "policy changes, session boundaries, and multi-agent delegation",
  heroDesc:
    "When an agent acts on behalf of a user, the authorization decision, policy inputs, and delegation chain must be reconstructable after the fact. Neotoma versions every authorization entity so you can answer who authorized what, when, and under which policy state.",
  heroTags: [
    { tag: "auth_decision", Icon: ShieldCheck },
    { tag: "agent_session", Icon: Key },
    { tag: "policy_evaluation", Icon: FileKey },
    { tag: "consent_grant", Icon: UserCheck },
    { tag: "delegation_chain", Icon: GitBranch },
  ],
  heroFeatures: ["Open-source", "Enterprise SSO & RBAC", "Team deployment", "SOC 2 compatible"],
  analyticsPrefix: "agent_auth",
  problemTitle: "Auth logs record outcomes; they do not preserve the policy state that produced them",
  problemDesc:
    "Authorization decisions depend on policy rules, user roles, delegation scopes, and consent grants, all of which change over time. When agents delegate to sub-agents across session boundaries, the original authorization context is lost. Current systems log allow/deny but not the inputs that drove the decision.",
  problemCards: [
    {
      Icon: History,
      title: "No decision reconstruction",
      desc: "Auth logs record allow or deny with a timestamp. They do not capture the policy version, role bindings, or scope constraints that produced the outcome.",
    },
    {
      Icon: RefreshCw,
      title: "Silent policy drift",
      desc: "Policy updates apply to all future evaluations, but past decisions cannot be rebased to the policy version that governed them. Auditors cannot verify whether a decision was correct under the rules at the time.",
    },
    {
      Icon: Fingerprint,
      title: "No consent timeline",
      desc: "Consent grants and revocations overwrite state. You cannot prove what permissions were active on a specific date or trace the sequence of grant, modification, and revocation.",
    },
    {
      Icon: Link2,
      title: "Opaque delegation chains",
      desc: "Agents delegate to sub-agents, but the chain from user consent to final action is not traceable. When a downstream agent exceeds scope, nobody can reconstruct how authority was passed.",
    },
  ],
  problemCallout: "\"Agent X was authorized to do Y at time Z\" is a Neotoma-shaped problem.",
  problemCalloutDesc:
    "Production agents make decisions with real consequences: transferring funds, accessing records, modifying configurations. When regulators or incident responders ask what authority an agent had and how it got it, you need versioned policy state and delegation provenance, not a search over access logs.",
  scenarios: [
    {
      category: "Authorization audit",
      human: "Was the billing agent authorized to initiate the $48K wire transfer to Meridian Labs on March 12?",
      fail: "The billing agent has permission to initiate wire transfers up to $50K. The transfer to Meridian Labs was within policy.",
      succeed:
        "On 2025-03-12 at 14:23 UTC, billing-agent evaluated policy pol_wire_v7 (effective Feb 1). Role binding: service-account-billing with scope finance:wire:initiate, limit $50K. Delegation chain: user Jordan Oakes \u2192 orchestrator-agent (session sess_0412) \u2192 billing-agent (session sess_0413). Consent grant consent_wire_032 active since Mar 10, no revocation. Decision: ALLOW. All inputs preserved at auth_decision\u00B7v3.",
      version: "auth_decision\u00B7v3",
      Icon: ShieldCheck,
      failTitle: "Current policy confirms access, history missing",
      failDesc:
        "The assistant checked today's policy and confirmed the agent has the right permission level. It could not show which policy version was in effect on March 12, who delegated authority, or whether the consent grant was active at the time.",
    },
    {
      category: "Consent lifecycle",
      human: "When did the user revoke data-sharing consent for the analytics pipeline, and what was the last action taken under that consent?",
      fail: "Data-sharing consent for the analytics pipeline is currently revoked. The user can re-enable it in settings.",
      succeed:
        "Consent grant consent_analytics_019 was active from Jan 15 to Mar 8, 2025. Revocation recorded Mar 8 at 09:41 UTC via user portal (observation obs_c019_rev). Last action under this consent: analytics-agent read user engagement metrics at Mar 8 08:55 UTC (auth_decision\u00B7v12, policy pol_data_share_v4). Timeline: granted Jan 15 \u2192 scope narrowed Feb 2 (removed location data) \u2192 revoked Mar 8. Full lineage at consent_grant\u00B7v4.",
      version: "consent_grant\u00B7v4",
      Icon: UserCheck,
      failTitle: "Current revocation status without timeline",
      failDesc:
        "The assistant confirmed the consent is currently revoked but could not trace when it was granted, how the scope changed over time, or what the last authorized action was before revocation.",
    },
    {
      category: "Policy change impact",
      human: "Which active agent sessions were affected by Tuesday's update to the PII access policy?",
      fail: "The PII access policy was updated Tuesday. All agents now follow the new rules.",
      succeed:
        "Policy pol_pii_access_v9 replaced v8 on Tue Mar 18 at 16:00 UTC. 14 active sessions held auth decisions evaluated under v8. Of those, 3 sessions had scope that would be denied under v9 (added restriction: no PII access for agents without explicit user presence). Affected: data-enrichment-agent (sess_0891), reporting-agent (sess_0894), onboarding-agent (sess_0902). Each session's prior auth_decision snapshots are preserved for comparison. No retroactive revocation; v9 applies to new evaluations only.",
      version: "policy\u00B7v9",
      Icon: FileKey,
      failTitle: "Policy update confirmed, no session impact analysis",
      failDesc:
        "The assistant confirmed the policy was updated but could not identify which sessions held decisions under the old version or which agents would now be denied under the new rules.",
    },
    {
      category: "Delegation reconstruction",
      human: "How did the deployment agent get authority to modify production config for the Northwind tenant?",
      fail: "The deployment agent has admin access to production configuration.",
      succeed:
        "Delegation chain for config change cfg_nw_0341: (1) Tenant admin Priya Nandakumar granted deploy scope to orchestrator-agent via consent_deploy_047 on Mar 5. (2) Orchestrator delegated config:write to deployment-agent (delegation_edge del_0129, constrained to tenant Northwind, TTL 4h). (3) Deployment-agent evaluated policy pol_config_v3, confirmed scope match, executed change at Mar 14 11:22 UTC. Each hop recorded as an observation on the delegation_chain entity. Authority expired at 15:22 UTC per TTL.",
      version: "delegation_chain\u00B7v2",
      Icon: GitBranch,
      failTitle: "Access level confirmed, delegation path unknown",
      failDesc:
        "The assistant confirmed the agent has access but could not trace how authority was delegated from the human admin through the orchestrator to the deployment agent, or whether the delegation was still valid at execution time.",
    },
  ],
  outcomeTitle: "From opaque access logs to reconstructable authorization state",
  outcomeSubtitle: "Before and after Neotoma",
  outcomeDesc:
    "Each scenario pairs the same question with two outcomes: one where only the current policy is visible, and one where policy versions, delegation chains, and consent timelines are first-class queryable state.",
  howTitle: "How Neotoma hardens agent authorization",
  steps: [
    {
      Icon: Upload,
      title: "Capture every authorization event as an observation",
      desc: "Policy evaluations, consent grants, delegation edges, and session bindings become structured observations on typed entities. No decision overwrites a prior decision.",
      detail: "Append-only by default. Each policy evaluation is linked to the policy version and role bindings that produced it.",
    },
    {
      Icon: Layers,
      title: "Project authorization state through time",
      desc: "Consent timelines, policy versions, and delegation chains are queryable at any point in time. Ask what permissions an agent had on a specific date and get the exact policy inputs.",
      detail: "Temporal queries return the state valid at the as-of timestamp, not the latest policy.",
    },
    {
      Icon: Lock,
      title: "Let agents and auditors trace the full chain",
      desc: "Authorization agents, incident responders, and compliance teams query the same versioned graph. Responses cite policy versions, delegation hops, and consent states so decisions are defensible.",
      detail: "Built for post-incident analysis: who authorized what, through which delegation path, under which policy version.",
    },
  ],
  capTitle: "Capabilities built for authorization integrity and auditability",
  capSubtitle: "What you can ship",
  capDesc:
    "Model the entities your auth system already evaluates, then add the integrity layer missing from log-centric architectures: versioned policy state, delegation provenance, and consent timelines.",
  capabilities: [
    {
      Icon: ShieldCheck,
      title: "Versioned policy evaluation records",
      desc: "Bind each authorization decision to the policy version, role bindings, and scope constraints that produced it. Reconstruct any past decision against its original inputs.",
      tags: ["auth_decision", "policy", "audit"],
    },
    {
      Icon: UserCheck,
      title: "Consent lifecycle tracking",
      desc: "Track grants, scope modifications, and revocations as a timeline. Prove what permissions were active on any date and identify the last action taken under a given consent.",
      tags: ["consent_grant", "timeline", "compliance"],
    },
    {
      Icon: GitBranch,
      title: "Delegation chain reconstruction",
      desc: "Record each hop from user consent through orchestrator to downstream agent. Trace authority back to its human origin with TTLs, scope constraints, and session bindings at each step.",
      tags: ["delegation_chain", "agent_session", "provenance"],
    },
    {
      Icon: AlertTriangle,
      title: "Policy change impact analysis",
      desc: "When a policy version is updated, query which active sessions hold decisions evaluated under the prior version. Identify agents whose scope would change under the new rules.",
      tags: ["policy", "session", "impact"],
    },
    {
      Icon: Fingerprint,
      title: "Session-scoped authorization snapshots",
      desc: "Each agent session carries a snapshot of its authorization context at creation time. Session state does not silently shift when policies update mid-flight.",
      tags: ["agent_session", "snapshot", "isolation"],
    },
    {
      Icon: Users,
      title: "Multi-agent authority graphs",
      desc: "Map the authorization relationships across agent fleets: which agents can delegate, what scope constraints apply, and how authority propagates through orchestration layers.",
      tags: ["delegation_chain", "graph", "governance"],
    },
  ],
  archHeadline: "Neotoma sits beneath your auth layer and agent orchestrator",
  archDesc:
    "Keep your existing authorization service (OPA, Cedar, custom policy engine) as the decision point. Neotoma is the integrity layer that remembers every decision, policy version, consent state, and delegation path those systems were not designed to retain as queryable state.",
  archConfig: {
    topLabel: "Agent authorization plane",
    topDesc:
      "Agents and policy engines emit observations. Neotoma reduces them to authoritative snapshots for auth decisions, consent grants, policy evaluations, delegation chains, and sessions.",
    interfaces: [
      { label: "MCP tools", Icon: Plug },
      { label: "HTTP API", Icon: Layers },
      { label: "CLI & automations", Icon: Terminal },
    ],
    dataSources: [
      "OPA / Cedar / custom policy engines",
      "OAuth / OIDC providers (Auth0, Hellō, etc.)",
      "Agent orchestrators (LangGraph, CrewAI, etc.)",
      "Consent management platforms",
      "Session and token management services",
    ],
  },
  archSteps: [
    {
      label: "Normalize entities",
      desc: "Map each authorization decision, policy version, consent grant, delegation edge, and agent session into typed entities with stable IDs shared across tools.",
    },
    {
      label: "Capture observations",
      desc: "Every policy evaluation, consent change, delegation hop, and session binding is stored as an append-only observation with source metadata.",
    },
    {
      label: "Compute snapshots",
      desc: "Project the latest authorization state per entity, or reconstruct historical state for any timestamp relevant to incident response or audit.",
    },
    {
      label: "Serve agents & auditors",
      desc: "Expose the same graph to authorization agents, incident responders, and compliance teams. No duplicate logs or conflicting access records.",
    },
  ],
  caseStudy: {
    companyName: "AAuth",
    companyUrl: "https://aauth.dev",
    companyDesc:
      "builds authorization infrastructure for production agent systems, handling policy evaluation, delegation scoping, and consent management across multi-agent workflows.",
    features: [
      "Policy evaluation engine serving hundreds of agent sessions with real-time scope checks",
      "Delegation chain management for multi-hop agent orchestration with TTL and scope constraints",
      "Consent lifecycle management integrating with OAuth/OIDC providers like Hellō for onboarding and offboarding events",
    ],
    guarantees: [
      "Immutable observations for every policy evaluation, delegation edge, and consent state change",
      "Temporal snapshots so authorization audits reference the policy version in effect at decision time, not today's rules",
      "Relationship integrity between users, consent grants, delegation chains, and downstream agent actions",
      "Audit-oriented exports that trace authority from human consent through every orchestration hop to final agent action",
    ],
    generalizesTitle: "If agents make decisions with real consequences, you need reconstructable authorization state",
    generalizesDesc:
      "Any team running production agents that transfer funds, access PII, modify configurations, or act on behalf of users faces the same question: what authority did this agent have, and how did it get it? Neotoma generalizes the AAuth pattern to your authorization stack.",
  },
  ctaHeadline: "Ship agents that can prove",
  ctaHighlight: "every authorization decision they made",
  ctaDesc:
    "Install Neotoma, connect your policy engine and agent orchestrator, and stop treating access logs as your audit trail.",
  ctaFeatures: ["Open-source", "Enterprise SSO & RBAC", "Team deployment", "API compatibility guarantees"],
  agentLabel: "authorization agent",
};

export function AgentAuthLandingPage() {
  return <VerticalLandingShell config={CONFIG} />;
}
