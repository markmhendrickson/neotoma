import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Brain,
  Clock,
  Database,
  GitBranch,
  Globe,
  Layers,
  LineChart,
  MessageSquare,
  Plug,
  Scale,
  Search,
  Shield,
  ShieldCheck,
  Terminal,
  TrendingUp,
  Upload,
} from "lucide-react";
import { VerticalLandingShell, type VerticalConfig } from "./vertical_landing/VerticalLandingShell";

const CONFIG: VerticalConfig = {
  accentColor: "emerald",
  badgeIcon: TrendingUp,
  badgeText: "Neotoma for Autonomous Trading",
  heroTitle: "Trading agent state that survives",
  heroHighlight: "strategy drift, analyst disagreement, and post-trade reconstruction",
  heroDesc:
    "When multiple specialist agents analyze markets, debate positions, and execute trades autonomously, the decision chain, strategy version, analyst inputs, debate resolution, and risk parameters, must be reconstructable after the fact. Neotoma versions every trading entity so you can answer what the agent knew, what each analyst recommended, and why the final call was made.",
  heroTags: [
    { tag: "trade_decision", Icon: Scale },
    { tag: "strategy", Icon: Brain },
    { tag: "analysis", Icon: BarChart3 },
    { tag: "risk_state", Icon: Shield },
    { tag: "portfolio_snapshot", Icon: LineChart },
  ],
  heroFeatures: ["Open-source", "Enterprise SSO & RBAC", "Team deployment", "SOC 2 compatible"],
  analyticsPrefix: "trading",
  problemTitle: "Trading agents log outcomes but not the reasoning chain that produced them",
  problemDesc:
    "Autonomous trading systems make high-stakes decisions every minute. Multiple analysts evaluate signals, structured debates synthesize views, and a portfolio manager commits capital. Current systems log the trade but not the full decision context: which analysts disagreed, what the strategy said at the time, or what risk limits were active when the position opened.",
  problemCards: [
    {
      Icon: Clock,
      title: "No decision reconstruction",
      desc: "Trade logs show entry price, size, and timestamp. They do not capture which analyst signals drove the decision, what the bull/bear debate concluded, or which strategy version was active.",
    },
    {
      Icon: Activity,
      title: "Silent strategy drift",
      desc: "Strategies evolve as agents adapt to market conditions. Yesterday's parameters are overwritten by today's. You cannot verify what strategy the agent was following when it opened a position that is now underwater.",
    },
    {
      Icon: AlertTriangle,
      title: "Risk state is point-in-time only",
      desc: "Position limits, drawdown caps, and kill switches change over time. When a liquidation happens at 3 AM, nobody can reconstruct whether the risk limits were already breached or just changed.",
    },
    {
      Icon: MessageSquare,
      title: "Analyst reasoning evaporates",
      desc: "Six specialists each produce assessments, but only the final OVERWEIGHT/UNDERWEIGHT survives. Which analyst's signal was wrong? Was the debate close or unanimous? The inputs are gone.",
    },
  ],
  problemCallout: '"What did the agent know when it made this trade?" is a Neotoma-shaped problem.',
  problemCalloutDesc:
    "Autonomous trading agents commit real capital based on multi-agent analysis. When a position goes wrong, regulators ask for reasoning, users want to understand the decision, and the trading system itself needs attribution data to improve. You need versioned decision state and analyst provenance, not a search over execution logs.",
  scenarios: [
    {
      category: "Trade decision audit",
      human:
        "Why did the agent go long ETH at $3,840 on March 12? The price dropped 8% in the next hour.",
      fail: "The agent's current strategy is bullish on ETH based on positive funding rates and network activity. The position was opened at $3,840.",
      succeed:
        "On 2026-03-12 at 14:23 UTC, strategy strat·v7 (momentum + on-chain hybrid, last modified Mar 10) was active. Six analysts reported: Technical OVERWEIGHT (RSI divergence, confidence 0.82), Sentiment NEUTRAL (mixed social signals), News OVERWEIGHT (ETF inflow report), Fundamentals OVERWEIGHT (TVL growth +12% WoW), Tokenomics NEUTRAL (unlock schedule neutral), Competitive UNDERWEIGHT (SOL gaining DEX share). Bull case won debate 4-2 with combined confidence 0.71. PM decision: OVERWEIGHT at trade_decision·v3. Risk state at entry: position limit 15% portfolio, drawdown cap 5%, kill switch inactive. The 8% drop triggered the drawdown cap at 15:41 UTC (risk_state·v4).",
      version: "trade_decision·v3",
      Icon: Scale,
      failTitle: "Current strategy cited, historical reasoning missing",
      failDesc:
        "The assistant used today's strategy and market view to explain a trade made under different conditions. The actual analyst scores, debate outcome, and risk parameters at trade time are unavailable.",
    },
    {
      category: "Strategy evolution",
      human:
        "How has my trading strategy changed since I created it, and which version produced the best returns?",
      fail: "Your current strategy uses momentum + sentiment signals with a 15% position limit. It was created 6 weeks ago.",
      succeed:
        "Strategy strat·v1 (Mar 1): pure momentum, 10% position limit. v2 (Mar 8): added sentiment overlay after 3 false breakout trades. v3 (Mar 15): increased position limit to 15% after paper testing. v4 (Mar 22): added on-chain metrics (TVL, active addresses). v5 (Apr 2): tightened drawdown cap from 8% to 5% after Apr 1 flash crash. Returns by version: v1 -2.1%, v2 +4.3%, v3 +6.8%, v4 +11.2%, v5 +3.1% (active). Each version preserves the exact parameter set, user edits, and agent adaptations as observations on strat·v1-v5.",
      version: "strategy·v5",
      Icon: Brain,
      failTitle: "Current parameters only, no evolution history",
      failDesc:
        "The assistant reported the current strategy but could not trace how it evolved, what prompted each change, or which version performed best. The user cannot attribute returns to specific strategy modifications.",
    },
    {
      category: "Risk state reconstruction",
      human:
        "Were my risk limits already breached when the liquidation happened at 3:42 AM on April 1?",
      fail: "Your current risk limits are: 15% position limit, 5% drawdown cap, kill switch inactive. No liquidations in the past 24 hours.",
      succeed:
        "Timeline for Apr 1 risk events: 02:15 UTC drawdown at 3.8% (risk_state·v11, within 5% cap). 02:47 UTC BTC flash crash begins, portfolio drawdown hits 4.9% (risk_state·v12, cap not yet breached). 03:12 UTC drawdown hits 5.1%, kill switch triggered (risk_state·v13). 03:14 UTC kill switch executed: all open positions flagged for closure. 03:42 UTC liquidation of ETH-PERP completed at $3,211 (execution·v8). The kill switch activated 30 minutes before liquidation. Drawdown cap was 5% (set in strategy·v5 on Apr 2, note: this was the pre-tightening 8% cap from strategy·v4 at the time). At 03:42 UTC the effective cap was 8%, not 5%.",
      version: "risk_state·v13",
      Icon: Shield,
      failTitle: "Current limits reported, event timeline missing",
      failDesc:
        "Without temporal state, the assistant reports today's 5% cap and misses that the cap was 8% on April 1. The sequence of drawdown escalation, kill switch activation, and liquidation cannot be reconstructed.",
    },
    {
      category: "Analyst attribution",
      human:
        "Which of the six analysts has been most accurate over the past month, and which one's signals did the PM override most often?",
      fail: "The agent uses six specialist analysts: Technical, Sentiment, News, Fundamentals, Tokenomics, and Competitive. All contribute to the final decision.",
      succeed:
        "Past 30 days, 47 trade decisions. Analyst accuracy (signal direction vs. 24h price move): Fundamentals 72%, Technical 68%, Tokenomics 61%, News 58%, Competitive 54%, Sentiment 49%. PM overrides (PM decision diverged from analyst recommendation): Sentiment overridden 18/47 times, Competitive 12/47, News 8/47, Technical 3/47, Fundamentals 2/47, Tokenomics 5/47. Attribution data computed from versioned analysis·v1-v47, debate·v1-v47, and trade_decision·v1-v47 entities with linked market_signal observations.",
      version: "analysis·v47",
      Icon: BarChart3,
      failTitle: "Analyst list confirmed, no performance data",
      failDesc:
        "Without versioned analyst outputs linked to trade outcomes, accuracy and override rates cannot be computed. The user has no basis for tuning analyst weights or evaluating the debate process.",
    },
  ],
  outcomeTitle: "From execution logs to reconstructable trading intelligence",
  outcomeSubtitle: "Before and after Neotoma",
  outcomeDesc:
    "Each scenario pairs the same question with two outcomes: one where only the latest trade log is visible, and one where strategy versions, analyst reasoning, debate resolutions, and risk timelines are first-class queryable state.",
  howTitle: "How Neotoma hardens autonomous trading",
  steps: [
    {
      Icon: Upload,
      title: "Capture every decision as an observation",
      desc: "Analyst assessments, debate resolutions, PM decisions, risk parameter changes, and trade executions become structured observations on typed entities. No decision overwrites a prior decision.",
      detail:
        "Append-only by default. Each trade decision links to the strategy version, analyst outputs, and risk state that produced it.",
    },
    {
      Icon: Clock,
      title: "Project trading state through time",
      desc: "Strategy versions, risk parameters, and portfolio compositions are queryable at any point in time. Ask what the agent's risk limits were at 3 AM and get the exact parameters, not today's configuration.",
      detail:
        "Temporal queries return the state valid at the as-of timestamp, not the latest strategy update.",
    },
    {
      Icon: Search,
      title: "Let agents and users trace the full chain",
      desc: "Trading agents, users, and compliance systems query the same versioned graph. Responses cite analyst scores, debate outcomes, and strategy versions so every trade is defensible.",
      detail:
        "Built for post-trade analysis: what each analyst recommended, how the debate resolved, and what risk constraints applied.",
    },
  ],
  capTitle: "Capabilities built for trading agent integrity and attribution",
  capSubtitle: "What you can ship",
  capDesc:
    "Model the entities your trading system already produces, then add the integrity layer missing from log-centric architectures: versioned strategy state, analyst provenance, and risk timelines.",
  capabilities: [
    {
      Icon: Scale,
      title: "Trade decision reconstruction",
      desc: "Link every trade backward through PM decision, debate resolution, analyst outputs, market signals, and strategy version. Reconstruct the complete reasoning chain for any historical trade.",
      tags: ["trade_decision", "debate", "provenance"],
    },
    {
      Icon: Brain,
      title: "Strategy version control",
      desc: "Track every strategy mutation, user edits, agent adaptations, and parameter changes, as versioned observations. Compare returns across strategy versions and attribute performance to specific modifications.",
      tags: ["strategy", "versioning", "attribution"],
    },
    {
      Icon: Shield,
      title: "Risk state time travel",
      desc: "Reconstruct position limits, drawdown caps, kill switch status, and spending caps at any historical timestamp. Verify what constraints were active during any market event.",
      tags: ["risk_state", "temporal", "compliance"],
    },
    {
      Icon: BarChart3,
      title: "Analyst performance attribution",
      desc: "Compute accuracy, override rates, and signal quality for each specialist analyst from versioned assessment observations linked to trade outcomes.",
      tags: ["analysis", "attribution", "optimization"],
    },
    {
      Icon: LineChart,
      title: "Portfolio state snapshots",
      desc: "Version portfolio composition, exposure by chain and asset, and unrealized P&L at any timestamp. Compare pre- and post-rebalance states with full provenance.",
      tags: ["portfolio_snapshot", "temporal", "audit"],
    },
    {
      Icon: GitBranch,
      title: "Paper-to-live fidelity verification",
      desc: "Paper and live trades share the same entity model. Verify whether paper strategies would have produced identical decisions in live mode by comparing snapshots at matching timestamps.",
      tags: ["paper_trading", "verification", "backtesting"],
    },
  ],
  archHeadline: "Neotoma sits beneath your agent orchestrator and execution layer",
  archDesc:
    "Keep your trading agent framework, specialist analysts, and wallet infrastructure as the execution plane. Neotoma is the integrity layer that remembers every analyst assessment, debate outcome, strategy version, and risk parameter change those systems were not designed to retain as queryable state.",
  archConfig: {
    topLabel: "Trading agent plane",
    topDesc:
      "Specialist analysts, debate engines, portfolio managers, and risk systems emit observations. Neotoma reduces them to authoritative snapshots for strategies, trade decisions, risk states, and portfolio positions.",
    interfaces: [
      { label: "MCP tools", Icon: Plug },
      { label: "HTTP API", Icon: Globe },
      { label: "CLI & automations", Icon: Terminal },
    ],
    dataSources: [
      "Specialist analyst agents (technical, sentiment, news, fundamentals, tokenomics, competitive)",
      "Structured debate engines (bull/bear synthesis)",
      "Portfolio manager decision agents",
      "Wallet-layer risk controls (position limits, kill switches, drawdown caps)",
      "Multi-chain execution venues (Hyperliquid, Solana DEXes, Base)",
      "Market data feeds (oracles, exchanges, on-chain metrics)",
    ],
  },
  archSteps: [
    {
      label: "Normalize entities",
      desc: "Map each strategy, analyst output, debate, trade decision, execution, risk state, and portfolio snapshot into typed entities with stable IDs across agents and chains.",
    },
    {
      label: "Capture observations",
      desc: "Every analyst assessment, debate resolution, PM decision, risk parameter change, and trade execution is stored as an append-only observation with source metadata.",
    },
    {
      label: "Compute snapshots",
      desc: "Project the latest state per entity, or reconstruct historical state for any timestamp relevant to post-trade analysis, risk audit, or strategy review.",
    },
    {
      label: "Serve agents & users",
      desc: "Expose the same graph to trading agents for context, users for trade journals, and compliance for audit trails. No conflicting logs.",
    },
  ],
  caseStudy: {
    headline: "How autonomous trading platforms use Neotoma as their integrity layer",
    desc:
      "AI-native trading co-pilots orchestrate multiple specialist analysts, structured debates, and autonomous execution across chains. Neotoma versions every analyst output, debate resolution, and risk parameter so you can reconstruct the full decision chain for any trade at any point in time.",
    featuresHeading: "What trading teams build",
    features: [
      "Multi-analyst reasoning chains with versioned assessments, confidence scores, and debate resolutions linked to every trade decision",
      "Strategy evolution tracking that attributes returns to specific parameter versions and agent adaptations over time",
      "Risk state timelines that prove what limits, caps, and kill switch states were active during any market event",
    ],
    guarantees: [
      "Immutable observations for every analyst assessment, debate outcome, PM decision, and execution event",
      "Temporal snapshots so post-trade analysis uses the strategy, risk state, and market data in effect at trade time, not current values",
      "Relationship integrity between strategies, analyst outputs, debates, decisions, executions, and portfolio states",
      "Audit-oriented exports that trace reasoning from market signal through analyst debate to final execution",
    ],
    generalizesTitle: "The same integrity pattern fits any multi-agent trading architecture",
    generalizesDesc:
      "Whether you orchestrate specialist analysts, ensemble models, or swarm-based strategies, any autonomous system that commits capital needs reconstructable decision state. Neotoma generalizes the pattern underneath.",
  },
  ctaHeadline: "Ship trading agents that can explain",
  ctaHighlight: "every decision they made and why",
  ctaDesc:
    "Install Neotoma, connect your analyst agents and execution layer, and stop treating trade logs as your audit trail.",
  ctaFeatures: [
    "Open-source",
    "Enterprise SSO & RBAC",
    "Team deployment",
    "API compatibility guarantees",
  ],
  agentLabel: "trading agent",
};

export function TradingLandingPage() {
  return <VerticalLandingShell config={CONFIG} />;
}
