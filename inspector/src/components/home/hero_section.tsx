import { Link } from "react-router-dom";
import { ArrowRight, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HOME_HERO } from "@/lib/home_marketing_copy";

interface HeroSectionProps {
  /** Show the sandbox CTA when a sandbox session can be minted. */
  sandboxAvailable: boolean;
}

/**
 * Marketing hero — headline, subheader, three property chips, primary +
 * secondary CTAs. The primary CTA flips between "Try the sandbox" (when the
 * server can mint an ephemeral session) and "Install in 5 minutes" (when
 * loaded from a local instance). Copy is sourced from
 * `home_marketing_copy.ts`.
 */
export function HeroSection({ sandboxAvailable }: HeroSectionProps) {
  const primary = sandboxAvailable ? HOME_HERO.ctas.sandbox : HOME_HERO.ctas.install;
  return (
    <section aria-labelledby="home-hero-heading" className="space-y-6">
      <div className="space-y-3">
        <h1
          id="home-hero-heading"
          className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
        >
          {HOME_HERO.headline}
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          {HOME_HERO.subheader}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {HOME_HERO.chips.map((chip) => (
          <a key={chip.label} href={chip.anchor} className="no-underline">
            <Badge variant="secondary" className="cursor-pointer font-mono text-xs">
              {chip.label}
            </Badge>
          </a>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild size="default">
          {primary.href.startsWith("http") ? (
            <a href={primary.href} target="_blank" rel="noopener noreferrer">
              {primary.label}
              <ArrowRight className="ml-1 h-4 w-4" />
            </a>
          ) : (
            <Link to={primary.href}>
              {primary.label}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          )}
        </Button>
        <Button asChild variant="outline" size="default">
          <a
            href={HOME_HERO.ctas.github.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github className="mr-1 h-4 w-4" />
            {HOME_HERO.ctas.github.label}
          </a>
        </Button>
      </div>
    </section>
  );
}
