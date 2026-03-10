import { Link } from "react-router-dom";
import { AlertTriangle, Check, Database, Shield } from "lucide-react";
import { SeoHead } from "../SeoHead";
import type { IcpProfile } from "../../site/site_data";

interface IcpDetailSection {
  heading: string;
  body: React.ReactNode;
}

interface IcpDetailPageProps {
  profile: IcpProfile;
  aiNeeds: string[];
  keyDifferences?: {
    comparedTo: string;
    points: string[];
  };
  deepPainPoints: IcpDetailSection[];
  solutions: IcpDetailSection[];
  dataTypeDetails: Array<{ type: string; description: string }>;
  closingStatement: string;
}

export function IcpDetailPage({
  profile,
  aiNeeds,
  keyDifferences,
  deepPainPoints,
  solutions,
  dataTypeDetails,
  closingStatement,
}: IcpDetailPageProps) {
  return (
    <>
      <SeoHead routePath={`/${profile.slug}`} />
      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-[52em] mx-auto px-4 py-10 md:py-16">
          <h1 className="text-[28px] font-medium tracking-[-0.02em] mb-2">
            {profile.name}
          </h1>
          <p className="text-[17px] leading-7 text-muted-foreground mb-10">
            {profile.tagline}
          </p>

          {/* AI Needs */}
          <section className="mb-12">
            <h2 className="text-[20px] font-medium tracking-[-0.01em] mb-4">
              AI needs
            </h2>
            <p className="text-[15px] leading-7 text-muted-foreground mb-4">
              What this user segment needs from their AI tools — and what current tools don't provide.
            </p>
            <ul className="list-none pl-0 space-y-2">
              {aiNeeds.map((need) => (
                <li key={need} className="flex items-start gap-2.5 text-[14px] leading-6">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" aria-hidden />
                  <span className="text-foreground">{need}</span>
                </li>
              ))}
            </ul>
          </section>

          {keyDifferences && keyDifferences.points.length > 0 && (
            <section className="mb-12">
              <h2 className="text-[20px] font-medium tracking-[-0.01em] mb-4">
                Key differences
              </h2>
              <p className="text-[15px] leading-7 text-muted-foreground mb-4">
                How this ICP differs from {keyDifferences.comparedTo}.
              </p>
              <ul className="list-none pl-0 space-y-2">
                {keyDifferences.points.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-[14px] leading-6">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" aria-hidden />
                    <span className="text-foreground">{point}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Problems */}
          <section className="mb-12">
            <h2 className="text-[20px] font-medium tracking-[-0.01em] mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4.5 w-4.5 text-rose-400" aria-hidden />
              Problems
            </h2>
            <div className="space-y-3">
              {profile.painPoints.map((point) => (
                <div
                  key={point}
                  className="flex items-start gap-2.5 text-[14px] leading-6"
                >
                  <span className="text-rose-400 shrink-0 mt-0.5" aria-hidden>×</span>
                  <span className="text-foreground">{point}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-3">
              <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                Failure modes without a memory guarantee
              </p>
              {profile.failureModes.map((mode) => (
                <div
                  key={mode}
                  className="rounded-lg border border-rose-500/15 bg-rose-500/5 px-4 py-2.5 text-[13px] text-rose-700 dark:text-rose-300"
                >
                  {mode}
                </div>
              ))}
            </div>

            {deepPainPoints.length > 0 && (
              <div className="mt-8 space-y-6">
                {deepPainPoints.map((section) => (
                  <div key={section.heading}>
                    <h3 className="text-[16px] font-medium mb-2">{section.heading}</h3>
                    <div className="text-[14px] leading-7 text-muted-foreground">
                      {section.body}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Solutions with Neotoma */}
          <section className="mb-12">
            <h2 className="text-[20px] font-medium tracking-[-0.01em] mb-4 flex items-center gap-2">
              <Shield className="h-4.5 w-4.5 text-emerald-500" aria-hidden />
              How Neotoma solves this
            </h2>
            <p className="text-[15px] leading-7 text-muted-foreground mb-6">
              {profile.solutionSummary}
            </p>

            <div className="space-y-4">
              {solutions.map((sol) => (
                <div
                  key={sol.heading}
                  className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3"
                >
                  <p className="text-[14px] font-medium text-foreground flex items-center gap-2 mb-1">
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" aria-hidden />
                    {sol.heading}
                  </p>
                  <div className="text-[13px] leading-6 text-muted-foreground pl-5.5">
                    {sol.body}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {profile.schemaHotSpots.map((schema) => (
                <span
                  key={schema}
                  className="rounded border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-[11px] font-mono text-emerald-600 dark:text-emerald-400"
                >
                  {schema}
                </span>
              ))}
            </div>
          </section>

          {/* Data Types */}
          <section className="mb-12">
            <h2 className="text-[20px] font-medium tracking-[-0.01em] mb-4 flex items-center gap-2">
              <Database className="h-4.5 w-4.5 text-muted-foreground" aria-hidden />
              Data types for better remembrance
            </h2>
            <p className="text-[15px] leading-7 text-muted-foreground mb-4">
              The entity types most commonly stored by this user segment.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {dataTypeDetails.map((dt) => (
                <div
                  key={dt.type}
                  className="rounded-lg border border-border bg-card px-4 py-3"
                >
                  <p className="text-[13px] font-mono font-medium text-foreground mb-0.5">
                    {dt.type}
                  </p>
                  <p className="text-[12px] leading-5 text-muted-foreground">{dt.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Closing */}
          <section className="mb-8 rounded-lg border border-border bg-muted/30 px-6 py-5">
            <p className="text-[15px] leading-7 text-foreground">{closingStatement}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to="/quick-start"
                className="inline-flex items-center rounded-md border border-foreground bg-foreground px-4 py-2 text-[14px] font-medium text-background no-underline hover:bg-foreground/90 transition-colors"
              >
                Install in 5 minutes
              </Link>
              <Link
                to="/architecture"
                className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
              >
                View architecture →
              </Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
