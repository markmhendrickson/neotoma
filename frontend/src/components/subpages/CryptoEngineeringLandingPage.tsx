import {
  AlertTriangle,
  Bot,
  Clock,
  Cpu,
  Database,
  FileCheck,
  FileSearch,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Globe,
  KeyRound,
  Layers,
  Plug,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Upload,
  Users,
} from "lucide-react";
import { VerticalLandingShell, type VerticalConfig } from "./vertical_landing/VerticalLandingShell";

const CONFIG: VerticalConfig = {
  accentColor: "orange",
  badgeIcon: Cpu,
  badgeText: "Neotoma for crypto & security-sensitive engineering",
  heroTitle: "AI-assisted crypto engineering",
  heroHighlight: "that keeps humans in the seat where it counts - and out of the way where it doesn't",
  heroDesc:
    "Bridge, signer, and admin-key code always needs a human reviewer. Most of the rest doesn't. Neotoma keeps both true at once.",
  heroTags: [
    { tag: "agent_session", Icon: Bot },
    { tag: "commit", Icon: GitCommit },
    { tag: "review", Icon: FileCheck },
    { tag: "security_finding", Icon: ShieldAlert },
    { tag: "bounty_report", Icon: FileSearch },
  ],
  heroFeatures: ["Open-source", "Enterprise SSO & RBAC", "Self-host", "SOC 2 compatible"],
  analyticsPrefix: "crypto_engineering",
  problemTitle: "AI lifts throughput until it hits a codebase where a skip costs you the treasury",
  problemDesc:
    "Two kinds of code: a few surfaces where a missed check drains the treasury, and a lot of supporting code where AI can ship fast. Today's pipelines treat both the same.",
  problemCards: [
    {
      Icon: ShieldAlert,
      title: "AI silently skips or assumes on high-stakes surfaces",
      desc: "\"AI just skipped them or assumed something that was wrong\" is the failure mode teams actually report. Without session replay, the reviewer can't see what the model considered or ignored.",
      learnMoreHref: "/silent-mutation-risk",
    },
    {
      Icon: Clock,
      title: "Human review is the throughput ceiling - by design",
      desc: "\"The slowest part is the review, but we still catch things the AI doesn't.\" The gate can't be removed - the cost per reviewer-hour can.",
      learnMoreHref: "/agent-auth",
    },
    {
      Icon: AlertTriangle,
      title: "Bounty queues fill with AI-generated slop",
      desc: "Bug-bounty tickets \"are all AI-generated, they're flawed.\" With no submitter-agent provenance, every one of them gets line-by-line reading.",
    },
    {
      Icon: GitBranch,
      title: "No agent-to-commit attribution",
      desc: "Which model wrote this line? Under what prompt? With which rules and docs in context? When something lands in production, there's no durable record of who - or what - authored it.",
      learnMoreHref: "/agent-auth",
    },
  ],
  problemCallout: '"Could someone steal millions if we miss this?" is the line between autonomous and reviewed.',
  problemCalloutDesc:
    "Neotoma doesn't try to erase the ceiling. It gives reviewers cheaper instruments above it, full agent autonomy below it, and a single provenance graph across both.",
  scenarios: [
    {
      category: "Bridge / signer change audit",
      human:
        "The bridge PR that landed on March 14 changed the fee-accumulator logic. Why did the agent propose it that way, and what did it check?",
      fail: "The current fee-accumulator logic caps per-epoch fees at the parameter you're now running in production. I can't tell you why a prior version looked different.",
      succeed:
        "On 2026-03-14 at 09:12 UTC, agent_session·v184 (Claude Opus 4.5, repo rules bridge/CLAUDE.md v7, context: bridge-fee-discussion·v3 + audit-report-2025-q4·v2) opened PR #3218. The model surfaced three invariants it considered - per-epoch cap, cross-chain replay guard, and timelock-aware refund path - and explicitly dropped the replay-guard check, citing a comment block added in commit abc123 on 2025-11-04 that said \"handled upstream in relay.\" Review·v3218 by the on-call reviewer added the replay-guard re-check after the Claude review harness flagged the exact skip. Merged at 14:47 UTC as commit·d4e7f8a, linked to security_finding·v412 (resolved).",
      version: "agent_session·v184",
      Icon: ShieldCheck,
      failTitle: "Current logic cited, reasoning chain evaporated",
      failDesc:
        "Without session capture, the reasoning chain evaporates - today's code is all the assistant can see.",
      learnMoreHref: "/replayable-timeline",
      learnMoreLabel: "How session replay works",
    },
    {
      category: "Review-cost reduction",
      human:
        "Our reviewer is about to audit a 14-file PR touching the relayer. Show them what Claude already checked and what it didn't, so they don't re-run the whole review from scratch.",
      fail: "Here's the diff. The author ran Claude Code and Copilot before opening the PR.",
      succeed:
        "review_prep·v889 for PR #3471: agent_session·v512 (Claude Opus 4.5) produced this diff over 37 steps across 6 files. Claude's self-review (claude_review·v512) flagged 2 concerns (both addressed in commits·e4·e5). It explicitly verified 14 invariants: reentrancy guards on 3 payable paths, append-only storage layout, event emission on state transitions, external-call-last pattern on 4 surfaces. It explicitly did NOT verify: cross-contract role delegation on the new admin path (out of session context), fee rounding on minimum-token edge cases (flagged as \"consider manual check\"), or the fuzz test suite. Reviewer focus: the 3 unverified surfaces, not the 14 verified ones.",
      version: "review_prep·v889",
      Icon: Search,
      failTitle: "Diff visible, verification surface invisible",
      failDesc:
        "Without a structured record of what the agent checked, reviewers re-walk covered ground and may miss the surfaces the model punted on.",
    },
    {
      category: "Bounty-report triage",
      human:
        "We got 14 bug-bounty tickets this morning about the new custody contract. Which ones are AI-generated slop and which might be real?",
      fail: "14 tickets flagged for the custody contract. You'll need to read through them to assess severity.",
      succeed:
        "14 bounty_report·v3201-v3214 received 2026-04-23. Provenance scoring: 9 reports match a submitter-agent signature previously flagged across 87 prior reports with 0 accepted findings - low-priority triage (v3201, v3203-v3207, v3209, v3211, v3214). 3 reports cite storage slots that do not exist in the deployed contract (contradicted by deployment·v91) - closed-invalid (v3202, v3208, v3213). 2 reports (v3210, v3212) reference real function selectors, propose PoC transactions against the current ABI, and include call-traces consistent with the testnet deployment - route to human review first.",
      version: "triage_batch·v3201-3214",
      Icon: FileSearch,
      failTitle: "No provenance, line-by-line triage",
      failDesc:
        "Without submitter-agent fingerprinting, every ticket gets equal attention. The two plausible reports sit behind nine slop ones.",
    },
    {
      category: "Agent-to-commit attribution",
      human:
        "We shipped a regression in the relayer last Thursday. Which commits were agent-authored vs. human-authored, which model, and what was in context when the agent-authored ones went in?",
      fail: "Last Thursday's deploy included 7 commits from one engineer and 3 from another across the relayer package.",
      succeed:
        "Deploy·v141 shipped on 2026-04-17 contained 10 commits. Attribution: 6 agent-authored commits (3 Claude Opus 4.5 via Claude Code, 2 Codex via CLI, 1 Cursor auto-edit) linked to agent_session·v578-v584, and 4 human-authored commits. The regression traces to commit·9a3bfc2 (agent_session·v581, Codex, context included ./docs/relayer.md v3 but NOT ./docs/invariants/must-reject-double-spend.md). That invariant doc had been renamed the prior week in commit·4f1a2e8 and the renamed path was not yet in the Codex system prompt - the agent never saw the invariant. Fix: re-add to prompt rules; regression is behavioral, not logical.",
      version: "attribution_report·v141",
      Icon: Bot,
      failTitle: "Commits listed by human author, agent context lost",
      failDesc:
        "Git shows the human who opened the PR. Without sessions linked to commits, the real root cause - a doc renamed out of the agent's scope - stays invisible.",
      learnMoreHref: "/agent-auth",
      learnMoreLabel: "See agent attribution",
    },
  ],
  outcomeTitle: "From opaque AI-assisted pipelines to reviewable agent engineering",
  outcomeSubtitle: "Before and after Neotoma",
  outcomeDesc:
    "Same question, two outcomes: reasoning that evaporates on merge, or queryable state alongside every commit.",
  howTitle: "How Neotoma fits a pipeline with a real stakes ceiling",
  steps: [
    {
      Icon: Upload,
      title: "Capture every agent session as structured state",
      desc: "Every connected agent (Claude Code, Codex, Cursor, OpenClaw) emits one session observation: model, prompt, rules, context, tool calls, invariants checked, invariants skipped.",
      detail: "Sessions link to commits, reviews, and findings - append-only.",
      learnMoreHref: "/replayable-timeline",
    },
    {
      Icon: Shield,
      title: "Keep humans in the seat above the ceiling - with better instruments",
      desc: "Bridge, signer, custody, and admin-path code still get a human reviewer. The reviewer now sees what the agent considered, verified, and skipped.",
      detail: "The ceiling is not erased. The cost of maintaining it is.",
      learnMoreHref: "/agent-auth",
    },
    {
      Icon: GitBranch,
      title: "Let agents run below the ceiling with audit trails, not trust falls",
      desc: "For the 80%+ that isn't a stakes surface - internal tooling, dashboards, CI glue, docs, dev-env, migrations - agents ship with full session provenance.",
      detail: "Autonomy with replay is safer than autonomy without - and cheaper than review.",
      learnMoreHref: "/auditable-change-log",
    },
    {
      Icon: FileSearch,
      title: "Triage AI-generated bounty reports by provenance, not prose",
      desc: "Score incoming bug-bounty tickets against deployment state and submitter-agent fingerprints. Triage time collapses to the reports that might be real.",
      detail:
        "Deployment snapshots + submitter-agent fingerprints + function-selector graphs = triage by provenance.",
    },
  ],
  capTitle: "Capabilities built for codebases where the ceiling is real",
  capSubtitle: "What engineering teams ship",
  capDesc:
    "Keep your AI-coding stack. Neotoma adds the review, replay, and provenance layer it was never designed to produce. Start below the ceiling, expand upward.",
  capabilities: [
    {
      Icon: Bot,
      title: "Agent-session replay",
      desc: "Every agent session becomes a versioned entity - model, prompt, rules, context, tool calls, verification claims. Replay what the agent did (and didn't do) months after the PR lands.",
      tags: ["agent_session", "replay", "provenance"],
      learnMoreHref: "/replayable-timeline",
    },
    {
      Icon: FileCheck,
      title: "Review-cost reduction above the ceiling",
      desc: "Surface what the agent verified and what it punted on. Reviewers move from \"re-walk the whole diff\" to \"audit the three unverified surfaces.\"",
      tags: ["review", "reviewer_experience", "throughput"],
    },
    {
      Icon: GitCommit,
      title: "Agent-to-commit attribution",
      desc: "Every commit links to the session that produced it - model, context in scope, and the human who approved the merge. Regression root-cause traces to a missing doc or drifted rule, not just a commit hash.",
      tags: ["commit", "attribution", "root_cause"],
      learnMoreHref: "/agent-auth",
    },
    {
      Icon: FileSearch,
      title: "Bounty-report provenance & triage",
      desc: "Score incoming reports against deployment state, submitter-agent fingerprints, and historical slop patterns. Throughput goes up; signal stays.",
      tags: ["bounty_report", "triage", "security"],
    },
    {
      Icon: ShieldCheck,
      title: "Invariant coverage ledger",
      desc: "Every session declares which invariants it checked. Over time, a coverage map emerges - what's continuously re-checked, what's drifted out of context, what only humans enforce.",
      tags: ["invariant", "coverage", "audit"],
      learnMoreHref: "/schema-constraints",
    },
    {
      Icon: Layers,
      title: "Deployment state snapshots",
      desc: "Version every deploy with storage layout, ABI surface, active roles, and invariant coverage at the moment of deploy. Post-incident questions resolve in seconds.",
      tags: ["deployment", "temporal", "post_incident"],
      learnMoreHref: "/versioned-history",
    },
  ],
  archHeadline: "Neotoma sits between your AI-coding tools and your review & security pipelines",
  archDesc:
    "The entity and observation layer beneath your existing stack - recording the state your tools produce but don't retain.",
  archConfig: {
    topLabel: "AI-assisted engineering plane",
    topDesc:
      "Coding agents, reviewers, and bounty pipelines emit observations. Neotoma reduces them to authoritative snapshots.",
    interfaces: [
      { label: "MCP tools", Icon: Plug },
      { label: "HTTP API", Icon: Globe },
      { label: "CLI & CI hooks", Icon: Terminal },
    ],
    dataSources: [
      "Coding agents (Claude Code, Codex, Cursor, OpenClaw, Copilot)",
      "Review agents (reviewer LLMs, invariant scanners, CI bots)",
      "Human reviewer annotations and merge-gate tooling",
      "Bug-bounty platform inputs and internal security findings",
      "Deployment records (mainnet + testnet, multi-chain)",
      "Repo rules and context manifests (CLAUDE.md, AGENTS.md, .cursor/rules)",
    ],
  },
  archSteps: [
    {
      label: "Normalize entities",
      desc: "Typed entities - sessions, commits, reviews, deploys, findings, bounty reports - with stable IDs across agents, repos, and chains.",
    },
    {
      label: "Capture observations",
      desc: "Every prompt, rule set, context manifest, tool call, verification claim, and deploy event stored as an append-only observation.",
    },
    {
      label: "Compute snapshots",
      desc: "Project current state or reconstruct what the agent knew, checked, and skipped at any historical timestamp.",
    },
    {
      label: "Serve agents, reviewers, and security",
      desc: "One graph - context for agents, review-prep for reviewers, provenance for bounty triage, and a paper trail for compliance.",
    },
  ],
  caseStudy: {
    headline: "How crypto-infra teams use Neotoma to ship faster below the ceiling and review faster above it",
    desc:
      "Teams building security-sensitive software run AI-assisted pipelines with a hard human-review gate on high-blast-radius surfaces. Neotoma lets them mandate AI adoption without losing the gate that makes the mandate responsible.",
    disclaimer: "Illustrative; patterns drawn from customer-development conversations with engineering managers at crypto and fintech teams.",
    featuresHeading: "What crypto-engineering teams build",
    features: [
      "Full agent-session capture across every MCP-connected coding tool, with model, prompt, rules, and context on every session",
      "Review-prep that surfaces what the agent verified and skipped, so reviewers attack the unverified surfaces",
      "Agent-to-commit attribution - root-cause traces to missing docs, drifted rules, or context-window misses",
      "Bounty-report triage by submitter-agent provenance and deployment-state cross-check - slop sinks to the bottom",
    ],
    guarantees: [
      "Immutable observations for every session, commit, review, deploy, and finding",
      "Temporal snapshots so audit and incident questions resolve against the state at the moment of the event",
      "Relationship integrity across sessions, commits, reviews, deploys, and bounty reports - across agents, repos, and chains",
      "Export-ready provenance bundles for external audit firms, regulators, and ecosystem partners",
    ],
    generalizesTitle: "The same pattern fits any codebase with a real stakes ceiling",
    generalizesDesc:
      "Fintech clearing, healthcare, critical infrastructure, voting, enterprise identity - anywhere a missed check is catastrophic. Neotoma makes the human cheaper and the agents safer, in the same graph.",
  },
  ctaHeadline: "Let your agents fly beneath the ceiling",
  ctaHighlight: "and give your reviewers better instruments above it",
  ctaDesc:
    "Install Neotoma, connect your coding agents and review pipeline, and stop treating agent reasoning as disposable.",
  ctaFeatures: [
    "Open-source",
    "Enterprise SSO & RBAC",
    "Self-host on-prem or VPC",
    "API compatibility guarantees",
  ],
  agentLabel: "coding agent",
};

export function CryptoEngineeringLandingPage() {
  return <VerticalLandingShell config={CONFIG} />;
}
