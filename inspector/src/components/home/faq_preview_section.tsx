import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { FAQ_PAGE_PATH, FAQ_PREVIEW_ITEMS } from "@/lib/faq_preview";

/** Accordion FAQ preview matching the marketing site home (`SitePage` common-questions block). */
export function FaqPreviewSection() {
  return (
    <section aria-labelledby="home-faq-heading" className="mt-10 space-y-6">
      <h2
        id="home-faq-heading"
        className="text-xl font-medium tracking-tight text-foreground sm:text-[21px]"
      >
        Frequently asked questions
      </h2>
      <div className="max-w-2xl">
        <div className="divide-y divide-border/40 rounded-xl border border-border/60 bg-card/30 px-4 py-1 sm:px-5">
          {FAQ_PREVIEW_ITEMS.map((item) => (
            <details key={item.question} className="group py-3 text-left first:pt-2">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                {item.question}
                <ChevronDown
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="mt-2.5 text-sm leading-6 text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link
            to={FAQ_PAGE_PATH}
            className="text-muted-foreground underline decoration-border/50 underline-offset-[3px] transition-colors hover:text-foreground hover:decoration-foreground/30"
          >
            More questions? See the FAQ
          </Link>
        </p>
      </div>
    </section>
  );
}
