import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OUTCOME_SCENARIOS } from "@/lib/home_marketing_copy";

/**
 * Before/after outcomes — 4 categories rendered as a simple tabs-style
 * picker. The same content lives in the legacy site's `outcomeCards` block.
 * Kept compact so the home page does not over-explain.
 */
export function OutcomesCarousel() {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = OUTCOME_SCENARIOS[activeIdx];
  if (!active) return null;
  return (
    <section
      aria-labelledby="home-outcomes-heading"
      className="space-y-4"
    >
      <h2
        id="home-outcomes-heading"
        className="text-xl font-medium tracking-tight text-foreground sm:text-[21px]"
      >
        Same question, different outcome
      </h2>
      <div className="flex flex-wrap gap-2">
        {OUTCOME_SCENARIOS.map((scenario, idx) => (
          <Button
            key={scenario.category}
            variant={idx === activeIdx ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveIdx(idx)}
          >
            {scenario.category}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-xs uppercase tracking-wide text-destructive">
              without Neotoma
            </p>
            <p className="text-sm font-medium text-foreground">{active.failTitle}</p>
            <p className="text-sm leading-6 text-muted-foreground">
              {active.failDescription}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-xs uppercase tracking-wide text-emerald-600">
              with Neotoma
            </p>
            <p className="text-sm font-medium text-foreground">{active.successTitle}</p>
            <p className="text-sm leading-6 text-muted-foreground">
              {active.successDescription}
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
