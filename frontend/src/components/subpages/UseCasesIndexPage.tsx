import { ArrowRight, Bot } from "lucide-react";
import { Link } from "react-router-dom";
import { PRODUCT_NAV_SOURCES } from "@/utils/analytics";
import { SeoHead } from "../SeoHead";
import { TrackedProductLink } from "../TrackedProductNav";
import { USE_CASES } from "@/site/use_cases_data";
import type { UseCaseCard } from "@/site/use_cases_data";
import { getSkillBySlug } from "@/site/skills_catalog";

export type { UseCaseCard };
export { USE_CASES };

export function UseCasesIndexPage() {
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
              use cases where that matters most.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {USE_CASES.map((v) => {
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

                    {v.skills.length > 0 && (
                      <div className="flex items-center gap-1.5 pt-1">
                        <Bot className="h-3 w-3 text-muted-foreground/60" />
                        <div className="flex flex-wrap gap-1">
                          {v.skills.map((slug) => {
                            const skill = getSkillBySlug(slug);
                            return (
                              <span
                                key={slug}
                                className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/70"
                              >
                                {skill?.name ?? slug}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-16 rounded-xl border border-border bg-muted/30 p-8 text-center space-y-4">
            <h3 className="text-[20px] font-medium text-foreground">
              The pattern is the same across all use cases
            </h3>
            <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl mx-auto">
              Replace &ldquo;vendor&rdquo; with &ldquo;contract&rdquo;,
              &ldquo;portfolio company&rdquo;, or &ldquo;case&rdquo; and the
              guarantees are identical: versioned entity state, conflict
              detection, temporal queries, and auditable provenance. Neotoma is
              the state integrity layer underneath.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <TrackedProductLink
                to="/install"
                navTarget="install"
                navSource={PRODUCT_NAV_SOURCES.useCasesIndexInstall}
                className="inline-flex items-center gap-1.5 rounded-md border border-foreground bg-foreground px-5 py-2.5 text-[14px] font-medium text-background no-underline hover:opacity-90 transition-opacity"
              >
                Install Neotoma
              </TrackedProductLink>
              <Link
                to="/skills"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-5 py-2.5 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
              >
                Skills
              </Link>
              <Link
                to="/build-vs-buy"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-5 py-2.5 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
              >
                Build vs Buy
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
