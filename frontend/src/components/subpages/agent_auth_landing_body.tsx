import {
  AlertTriangle,
  Aperture,
  ClipboardList,
  Clock,
  Cpu,
  EyeOff,
  FileKey,
  Globe,
  History,
  Link2,
  Network,
  Plug,
  Scale,
  Search,
  Share2,
  Shield,
  ShieldCheck,
  Terminal,
  TimerOff,
  UserCheck,
  Vote,
} from "lucide-react";
import { UseCaseLandingShell, type UseCaseConfig } from "./use_case_landing/UseCaseLandingShell";

const CONFIG: UseCaseConfig = {
  accentColor: "blue",
  badgeIcon: Shield,
  badgeText: "Neotoma for Agent Authorization",
  heroTitle: "Authorization state that survives",
  heroHighlight: "policy changes, session boundaries, and multi-agent delegation",
  heroDesc:
    "When an agent acts on behalf of a user, organization, or DAO, the authorization decision, policy inputs, delegation chain, and governance vote must be reconstructable after the fact. Neotoma versions every authorization entity so you can answer who (or which proposal) authorized what, when, and under which policy state.",
  heroTags: [
    { tag: "auth_decision", Icon: ShieldCheck },
    { tag: "agent_session", Icon: Cpu },
    { tag: "policy_evaluation", Icon: Scale },
    { tag: "consent_grant", Icon: UserCheck },
    { tag: "delegation_chain", Icon: Share2 },
    { tag: "governance_vote", Icon: Vote },
  ],
  heroFeatures: ["Open-source", "Enterprise SSO & RBAC", "Team deployment", "SOC 2 compatible"],
  analyticsPrefix: "agent_auth",
  problemTitle: "Auth logs record outcomes but not the policy state that produced them",
  problemDesc:
    "Authorization decisions depend on policy rules, user roles, delegation scopes, and consent grants, all of which change over time. When agents delegate to sub-agents across session boundaries, the original authorization context is lost. Current systems log allow/deny but not the inputs that drove the decision.",
  problemCards: [
    {
      Icon: History,
      title: "No decision reconstruction",
      desc: "Auth logs record allow or deny with a timestamp. They do not capture the policy version, role bindings, or scope constraints that produced the outcome.",
    },
    {
      Icon: EyeOff,
      title: "Silent policy drift",
      desc: "Policy updates apply to all future evaluations, but past decisions cannot be rebased to the policy version that governed them. Auditors cannot verify whether a decision was correct under the rules at the time.",
    },
    {
      Icon: TimerOff,
      title: "No consent timeline",
      desc: "Consent grants and revocations overwrite state. You cannot prove what permissions were active on a specific date or trace the sequence of grant, modification, and revocation.",
    },
    {
      Icon: Link2,
      title: "Opaque delegation chains",
      desc: "Agents delegate to sub-agents, but the chain from user consent to final action is not traceable. When a downstream agent exceeds scope, nobody can reconstruct how authority was passed.",
    },
  ],
  problemCallout: '"Agent X was authorized to do Y at time Z" is a Neotoma-shaped problem.',
  problemCalloutDesc:
    "Production agents make decisions with real consequences: transferring funds, accessing records, modifying configurations. When regulators or incident responders ask what authority an agent had and how it got it, you need versioned policy state and delegation provenance, not a search over access logs.",
  scenarios: [
    {
      category: "Authorization audit",
      human:
        "Was the billing agent authorized to initiate the $48K wire transfer to Meridian Labs on March 12?",
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
      human:
        "When did the user revoke data-sharing consent for the analytics pipeline, and what was the last action taken under that consent?",
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
      human:
        "Which active agent sessions were affected by Tuesday's update to the PII access policy?",
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
      human:
        "How did the deployment agent get authority to modify production config for the Northwind tenant?",
      fail: "The deployment agent has admin access to production configuration.",
      succeed:
        "Delegation chain for config change cfg_nw_0341: (1) Tenant admin Priya Nandakumar granted deploy scope to orchestrator-agent via consent_deploy_047 on Mar 5. (2) Orchestrator delegated config:write to deployment-agent (delegation_edge del_0129, constrained to tenant Northwind, TTL 4h). (3) Deployment-agent evaluated policy pol_config_v3, confirmed scope match, executed change at Mar 14 11:22 UTC. Each hop recorded as an observation on the delegation_chain entity. Authority expired at 15:22 UTC per TTL.",
      version: "delegation_chain\u00B7v2",
      Icon: Share2,
      failTitle: "Access level confirmed, delegation path unknown",
      failDesc:
        "The assistant confirmed the agent has access but could not trace how authority was delegated from the human admin through the orchestrator to the deployment agent, or whether the delegation was still valid at execution time.",
    },
    {
      category: "DAO governance reconstruction",
      human:
        "Who approved the $120K treasury transfer to LaunchPad Studios on April 3, and under which proposal was it authorized?",
      fail: "The DAO treasury agent executes approved proposals automatically. The transfer was successful.",
      succeed:
        "On 2026-04-03 at 17:12 UTC, treasury-agent evaluated governance_vote\u00B7v47 on proposal prop_treasury_089 (submitted Mar 28, voting window Mar 28\u2013Apr 2). Vote tally: 412 YES (84.2M token weight), 87 NO (11.1M token weight), 14 ABSTAIN. Quorum of 50M token weight met at Apr 1 22:31 UTC. Proposal passed under governance policy gov_policy\u00B7v6 (supermajority threshold 66.7%, actual 88.4%). Delegation chain: DAO snapshot space \u2192 governance-orchestrator (session sess_gov_0089) \u2192 treasury-agent (session sess_tx_0291). Authorized action: transfer 120,000 USDC to 0x7b\u2026f21 (LaunchPad Studios multisig). Full lineage at governance_vote\u00B7v47 linked to dao_proposal\u00B7v23 and auth_decision\u00B7v88.",
      version: "governance_vote\u00B7v47",
      Icon: Vote,
      failTitle: "Transfer confirmed, governance lineage missing",
      failDesc:
        "The assistant confirmed the transfer happened but could not cite the proposal, vote tally, quorum threshold, or governance policy version that authorized it.",
    },
  ],
  outcomeTitle: "From opaque access logs to reconstructable authorization state",
  outcomeSubtitle: "Before and after Neotoma",
  outcomeDesc:
    "Each scenario pairs the same question with two outcomes: one where only the current policy is visible, and one where policy versions, delegation chains, and consent timelines are first-class queryable state.",
  howTitle: "How Neotoma hardens agent authorization",
  steps: [
    {
      Icon: ClipboardList,
      title: "Capture every authorization event as an observation",
      desc: "Policy evaluations, consent grants, delegation edges, and session bindings become structured observations on typed entities. No decision overwrites a prior decision.",
      detail:
        "Append-only by default. Each policy evaluation is linked to the policy version and role bindings that produced it.",
    },
    {
      Icon: Clock,
      title: "Project authorization state through time",
      desc: "Consent timelines, policy versions, and delegation chains are queryable at any point in time. Ask what permissions an agent had on a specific date and get the exact policy inputs.",
      detail:
        "Temporal queries return the state valid at the as-of timestamp, not the latest policy.",
    },
    {
      Icon: Search,
      title: "Let agents and auditors trace the full chain",
      desc: "Authorization agents, incident responders, and compliance teams query the same versioned graph. Responses cite policy versions, delegation hops, and consent states so decisions are defensible.",
      detail:
        "Built for post-incident analysis: who authorized what, through which delegation path, under which policy version.",
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
      Icon: Share2,
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
      Icon: Aperture,
      title: "Session-scoped authorization snapshots",
      desc: "Each agent session carries a snapshot of its authorization context at creation time. Session state does not silently shift when policies update mid-flight.",
      tags: ["agent_session", "snapshot", "isolation"],
    },
    {
      Icon: Network,
      title: "Multi-agent authority graphs",
      desc: "Map the authorization relationships across agent fleets: which agents can delegate, what scope constraints apply, and how authority propagates through orchestration layers.",
      tags: ["delegation_chain", "graph", "governance"],
    },
    {
      Icon: Vote,
      title: "DAO governance lineage",
      desc: "Link every on-chain or agent-executed action to the proposal, vote tally, governance policy version, and quorum state that authorized it. Prove that a treasury transfer, parameter change, or code upgrade followed the DAO's rules at the time the vote closed, not today's rules.",
      tags: ["governance_vote", "dao_proposal", "audit"],
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
      { label: "HTTP API", Icon: Globe },
      { label: "CLI & automations", Icon: Terminal },
    ],
    dataSources: [
      "OPA / Cedar / custom policy engines",
      "OAuth / OIDC providers (Auth0, Hellō, etc.)",
      "Agent orchestrators (LangGraph, CrewAI, etc.)",
      "Consent management platforms",
      "Session and token management services",
      "DAO governance platforms (Snapshot, Tally, on-chain voting contracts)",
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
    headline: "How agent authorization teams use Neotoma as their integrity layer",
    desc:
      "Production agent authorization surfaces need durable records of which agents are bound to which subjects, under what scopes, when consent changed, and how offboarding revokes authority. Neotoma versions every binding, delegation, and policy evaluation so you can reconstruct authorization state at any point in time.",
    featuresHeading: "What agent authorization teams build",
    features: [
      "Bind software agents to subjects with explicit scopes (payments, PII, infra changes) instead of ad hoc API keys",
      "Issue, narrow, time-box, and revoke agent bindings with onboarding and offboarding lifecycle events auditors can replay",
      "Emit consent grants, revocations, and DAO governance votes as structured state for policy engines, orchestrators, and incident response",
    ],
    guarantees: [
      "Immutable observations for every binding change, consent edge, delegation hop, and policy evaluation the stack emits",
      'Temporal snapshots so "was this agent allowed to act then?" uses the consent and policy state in effect at that moment',
      "Relationship integrity between human identity, consent records, agent sessions, and downstream actions",
      "Audit-oriented exports that trace authority from the subject through each delegation hop to the acting agent",
    ],
    generalizesTitle:
      "The same integrity pattern fits any agent authorization stack",
    generalizesDesc:
      "Whether you build on decentralized identity providers, standalone authorization frameworks, custom policy engines, or DAO governance contracts, any production agent that moves money, touches PII, or changes systems needs reconstructable authorization state. Neotoma generalizes the pattern underneath.",
  },
  ctaHeadline: "Ship agents that can prove",
  ctaHighlight: "every authorization decision they made",
  ctaDesc:
    "Install Neotoma, connect your policy engine and agent orchestrator, and stop treating access logs as your audit trail.",
  ctaFeatures: [
    "Open-source",
    "Enterprise SSO & RBAC",
    "Team deployment",
    "API compatibility guarantees",
  ],
  agentLabel: "authorization agent",
};

export function AgentAuthLandingPageBody() {
  return <UseCaseLandingShell mdxShell config={CONFIG} />;
}
