import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { STATE_FLOW } from "@/lib/home_marketing_copy";

/**
 * "What is Neotoma" answered in one diagram: user tells an agent about an
 * invoice → stored as a structured invoice entity → asked from any agent
 * later → grounded balance answer. Mirrors `stateFlow.hero` from the
 * legacy marketing site. Evaluator feedback consistently highlighted this
 * concrete example as the most useful explanation of the product.
 */
export function StateFlowDiagram() {
  return (
    <section
      aria-labelledby="home-stateflow-heading"
      className="space-y-4"
    >
      <h2
        id="home-stateflow-heading"
        className="text-xl font-medium tracking-tight text-foreground sm:text-[21px]"
      >
        How it works
      </h2>
      <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-stretch">
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {STATE_FLOW.youTell}
            </p>
            <p className="text-sm leading-6">{STATE_FLOW.invoiceQuote}</p>
          </CardContent>
        </Card>
        <div className="hidden items-center justify-center lg:flex">
          <ArrowRight className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {STATE_FLOW.storedLabel}
            </p>
            <p className="break-words font-mono text-xs leading-5 text-muted-foreground">
              {STATE_FLOW.storedSub}
            </p>
          </CardContent>
        </Card>
        <div className="hidden items-center justify-center lg:flex">
          <ArrowRight className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {STATE_FLOW.youAskLater}
            </p>
            <p className="text-sm leading-6">{STATE_FLOW.balanceQuote}</p>
            <p className="text-sm leading-6">
              <span className="font-semibold text-foreground">{STATE_FLOW.answerBold}</span>
              <span className="text-muted-foreground">{STATE_FLOW.answerRest}</span>
            </p>
            <p className="text-xs italic text-muted-foreground">
              {STATE_FLOW.answerFootnote}
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
