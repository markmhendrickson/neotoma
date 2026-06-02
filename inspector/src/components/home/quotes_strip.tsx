import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { QUOTES, HOME_HERO } from "@/lib/home_marketing_copy";

/**
 * Four testimonial quotes followed by a final install/docs CTA bar.
 * Quotes come from the legacy marketing site and have already been
 * style-audited; the final CTA bar mirrors the hero CTAs for users who
 * scroll past the rest of the page without converting.
 */
export function QuotesStrip() {
  return (
    <section
      aria-labelledby="home-quotes-heading"
      className="space-y-6"
    >
      <h2
        id="home-quotes-heading"
        className="sr-only"
      >
        What people say
      </h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {QUOTES.map((quote) => (
          <blockquote
            key={quote.attribution}
            className="rounded-lg border border-border/60 bg-card/40 p-4"
          >
            <p className="text-sm leading-6 text-foreground">“{quote.text}”</p>
            <footer className="mt-2 text-xs text-muted-foreground">
              — {quote.attribution}
            </footer>
          </blockquote>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <Button asChild size="default">
          <Link to={HOME_HERO.ctas.install.href}>
            {HOME_HERO.ctas.install.label}
          </Link>
        </Button>
        <Button asChild variant="outline" size="default">
          <Link to="/docs">Read the docs</Link>
        </Button>
      </div>
    </section>
  );
}
