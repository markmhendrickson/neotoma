import { Link } from "react-router-dom";
import wordmarkUrl from "@/assets/neotoma_wordmark.svg";
import {
  BUNDLED_DOCS_FOOTER_COLUMNS,
  isExternalBundledDocsLink,
  type BundledDocsFooterLink,
} from "@/lib/bundled_docs_links";
import { NEOTOMA_TAGLINE } from "@/lib/site_copy";
import { cn } from "@/lib/utils";

const footerLinkClass =
  "text-sm text-muted-foreground no-underline transition-colors hover:text-foreground";

function FooterLink({ link }: { link: BundledDocsFooterLink }) {
  if (isExternalBundledDocsLink(link)) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={footerLinkClass}
      >
        {link.label}
      </a>
    );
  }

  return (
    <Link to={link.to} className={footerLinkClass}>
      {link.label}
    </Link>
  );
}

type BundledDocsFooterProps = {
  className?: string;
};

/** Site-style footer with links into bundled `/docs` pages (not marketing-site routes). */
export function BundledDocsFooter({ className }: BundledDocsFooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer
      className={cn(
        "mt-auto border-t border-border bg-muted/30",
        className,
      )}
    >
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link to="/docs" className="inline-block">
              <img
                src={wordmarkUrl}
                alt="Neotoma"
                className="h-7 w-auto dark:invert"
                width={140}
                height={40}
              />
            </Link>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {NEOTOMA_TAGLINE}
            </p>
          </div>

          {BUNDLED_DOCS_FOOTER_COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                {column.title}
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={isExternalBundledDocsLink(link) ? link.href : link.to}>
                    <FooterLink link={link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 border-t border-border/60 pt-6">
          <p className="text-xs leading-relaxed text-muted-foreground">
            © {year} Neotoma · MIT licensed · Built by{" "}
            <a
              href="https://markmhendrickson.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2 hover:no-underline"
            >
              Mark Hendrickson
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
