import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DIFFERENTIATORS } from "@/lib/home_marketing_copy";

/**
 * Four-card "how is this different from X?" strip. Each card has a one-line
 * claim; the anchor IDs are linked from the hero chips so users can jump
 * directly to a comparison. Addresses the #1 evaluator-reported confusion
 * ("how does this compare to Claude/ChatGPT/Cursor memory?") and the
 * stack-redundancy fear surfaced in landing-page feedback.
 */
export function DifferentiatorStrip() {
  return (
    <section
      aria-labelledby="home-diff-heading"
      className="space-y-4"
    >
      <h2
        id="home-diff-heading"
        className="text-xl font-medium tracking-tight text-foreground sm:text-[21px]"
      >
        How Neotoma is different
      </h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {DIFFERENTIATORS.map((card) => (
          <Card key={card.anchorId} id={card.anchorId}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {card.vs}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm leading-6 text-foreground">{card.claim}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
