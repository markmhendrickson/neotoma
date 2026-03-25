import {
  ArrowRight,
  Briefcase,
  Building2,
  DollarSign,
  FileText,
  Gavel,
  Search,
  Shield,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import { SeoHead } from "../SeoHead";

interface VerticalCard {
  href: string;
  icon: typeof ShieldCheck;
  label: string;
  title: string;
  tagline: string;
  entityExamples: string[];
  thenQuestion: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
}

const VERTICALS: VerticalCard[] = [
  {
    href: "/compliance",
    icon: ShieldCheck,
    label: "Compliance",
    title: "Vendor risk & compliance",
    tagline: "Version control for vendor risk profiles",
    entityExamples: ["vendor", "assessment", "screening", "questionnaire"],
    thenQuestion: "What did we know about this vendor when we approved them?",
    accent: "text-amber-600 dark:text-amber-400",
    accentBg: "bg-amber-500/5",
    accentBorder: "border-amber-500/20",
  },
  {
    href: "/crm",
    icon: Building2,
    label: "CRM",
    title: "Next-generation CRM",
    tagline: "The state layer for AI-native CRM platforms",
    entityExamples: ["contact", "deal", "account", "engagement"],
    thenQuestion: "Who should I loop in on the Meridian renewal?",
    accent: "text-emerald-600 dark:text-emerald-400",
    accentBg: "bg-emerald-500/5",
    accentBorder: "border-emerald-500/20",
  },
  {
    href: "/contracts",
    icon: FileText,
    label: "Contracts",
    title: "Contract lifecycle management",
    tagline: "Version control for every clause, amendment, and obligation",
    entityExamples: ["contract", "clause", "amendment", "obligation"],
    thenQuestion: "What were the terms when we signed? What changed in amendment 3?",
    accent: "text-indigo-600 dark:text-indigo-400",
    accentBg: "bg-indigo-500/5",
    accentBorder: "border-indigo-500/20",
  },
  {
    href: "/diligence",
    icon: Search,
    label: "Due Diligence",
    title: "M&A and investment diligence",
    tagline: "Know exactly what was known when the decision was made",
    entityExamples: ["target company", "finding", "red flag", "assessment"],
    thenQuestion: "What did we know about the target when the IC voted?",
    accent: "text-sky-600 dark:text-sky-400",
    accentBg: "bg-sky-500/5",
    accentBorder: "border-sky-500/20",
  },
  {
    href: "/portfolio",
    icon: TrendingUp,
    label: "Portfolio",
    title: "Portfolio monitoring",
    tagline: "Versioned state for every portfolio company and LP commitment",
    entityExamples: ["portfolio company", "valuation", "milestone", "LP commitment"],
    thenQuestion: "What was the valuation when we made the follow-on?",
    accent: "text-violet-600 dark:text-violet-400",
    accentBg: "bg-violet-500/5",
    accentBorder: "border-violet-500/20",
  },
  {
    href: "/cases",
    icon: Gavel,
    label: "Case Management",
    title: "Legal & investigation cases",
    tagline: "Reconstruct what was known at any point in a case timeline",
    entityExamples: ["case", "evidence", "filing", "party"],
    thenQuestion: "What evidence was available when we filed the motion?",
    accent: "text-cyan-600 dark:text-cyan-400",
    accentBg: "bg-cyan-500/5",
    accentBorder: "border-cyan-500/20",
  },
  {
    href: "/financial-ops",
    icon: DollarSign,
    label: "Financial Ops",
    title: "Financial operations & reconciliation",
    tagline: "Deterministic state for every ledger entry and reconciliation",
    entityExamples: ["transaction", "reconciliation", "ledger", "invoice"],
    thenQuestion: "Did this liability exist in our books on the audit date?",
    accent: "text-teal-600 dark:text-teal-400",
    accentBg: "bg-teal-500/5",
    accentBorder: "border-teal-500/20",
  },
  {
    href: "/procurement",
    icon: Briefcase,
    label: "Procurement",
    title: "Procurement & sourcing",
    tagline: "Full audit trail for bids, approvals, and supplier decisions",
    entityExamples: ["supplier", "bid", "purchase order", "approval"],
    thenQuestion: "What were the competing bids when we selected this supplier?",
    accent: "text-orange-600 dark:text-orange-400",
    accentBg: "bg-orange-500/5",
    accentBorder: "border-orange-500/20",
  },
  {
    href: "/agent-auth",
    icon: Shield,
    label: "Agent Auth",
    title: "Agent authorization & governance",
    tagline: "Versioned policy state, consent timelines, and delegation provenance",
    entityExamples: ["auth_decision", "consent_grant", "delegation_chain", "policy_evaluation"],
    thenQuestion: "Was this agent authorized for this action at this time, and under which policy?",
    accent: "text-blue-600 dark:text-blue-400",
    accentBg: "bg-blue-500/5",
    accentBorder: "border-blue-500/20",
  },
];

export function VerticalsIndexPage() {
  return (
    <>
      <SeoHead />
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-6xl px-6 py-20 md:px-12 lg:px-16">
          <div className="space-y-4 mb-12">
            <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              Use cases
            </p>
            <h1 className="text-[32px] md:text-[40px] font-medium tracking-[-0.02em] leading-tight">
              Any workflow where{" "}
              <span className="text-foreground/80 italic">
                &ldquo;what did the agent know then?&rdquo;
              </span>{" "}
              matters
            </h1>
            <p className="text-[17px] leading-8 text-muted-foreground max-w-3xl">
              Neotoma is a deterministic state layer. It fits anywhere AI agents
              update entities over time and you need versioned history, conflict
              detection, temporal queries, and auditable provenance. Here are the
              verticals where that matters most.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {VERTICALS.map((v) => {
              const Icon = v.icon;
              return (
                <Link
                  key={v.href}
                  to={v.href}
                  className="group relative rounded-xl border border-border bg-card p-6 no-underline transition-all hover:border-border/80 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${v.accentBorder} ${v.accentBg}`}>
                        <Icon className={`h-3.5 w-3.5 ${v.accent}`} />
                        <span className={`text-[12px] font-medium ${v.accent}`}>
                          {v.label}
                        </span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                    </div>

                    <div className="space-y-1.5">
                      <h2 className="text-[18px] font-medium text-foreground">
                        {v.title}
                      </h2>
                      <p className="text-[14px] leading-6 text-muted-foreground">
                        {v.tagline}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {v.entityExamples.map((e) => (
                        <span
                          key={e}
                          className="rounded border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-mono text-muted-foreground"
                        >
                          {e}
                        </span>
                      ))}
                    </div>

                    <p className="text-[13px] italic leading-5 text-muted-foreground/80">
                      &ldquo;{v.thenQuestion}&rdquo;
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-16 rounded-xl border border-border bg-muted/30 p-8 text-center space-y-4">
            <h3 className="text-[20px] font-medium text-foreground">
              The pattern is the same across all verticals
            </h3>
            <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl mx-auto">
              Replace &ldquo;vendor&rdquo; with &ldquo;contract&rdquo;,
              &ldquo;portfolio company&rdquo;, or &ldquo;case&rdquo; and the
              guarantees are identical: versioned entity state, conflict
              detection, temporal queries, and auditable provenance. Neotoma is
              the state integrity layer underneath.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Link
                to="/install"
                className="inline-flex items-center gap-1.5 rounded-md border border-foreground bg-foreground px-5 py-2.5 text-[14px] font-medium text-background no-underline hover:opacity-90 transition-opacity"
              >
                Install Neotoma
              </Link>
              <Link
                to="/architecture"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-5 py-2.5 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
              >
                Architecture
              </Link>
              <Link
                to="/memory-guarantees"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-5 py-2.5 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
              >
                Memory guarantees
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
