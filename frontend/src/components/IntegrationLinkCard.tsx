import { ChevronRight } from "lucide-react";
import { MdxI18nLink } from "@/components/mdx/mdx_i18n_link";

type IntegrationLinkCardProps = {
  title: string;
  /** Short description shown on the card (one line). */
  preview: string;
  to: string;
};

/** Link card for integration pages: title, preview text, and link to a dedicated page. */
export function IntegrationLinkCard({ title, preview, to }: IntegrationLinkCardProps) {
  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-border/70 bg-card transition-colors">
      <MdxI18nLink
        to={to}
        className="group flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left text-foreground no-underline hover:no-underline transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] leading-6 tracking-[-0.01em] font-medium">{title}</span>
          <span className="mt-1 block text-[13px] leading-5 font-normal text-muted-foreground">
            {preview}
          </span>
        </span>
        <ChevronRight
          className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
          aria-hidden
        />
      </MdxI18nLink>
    </section>
  );
}
