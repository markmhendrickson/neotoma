import { Link } from "react-router-dom";
import { CalendarClock, FileText, MessageSquare } from "lucide-react";
import heroPackratHoldingRecordIllus from "@/assets/images/hero/hero_illus_packrat_holding_record.png";
import { useIndexableMarkdownSourcePath } from "@/hooks/useIndexableMarkdownSourcePath";
import { useRepoMetaClient } from "@/hooks/useRepoMetaClient";
import { useLocale } from "@/i18n/LocaleContext";
import { REPO_RELEASES_COUNT, REPO_STARS_COUNT, REPO_VERSION } from "@/site/site_data";
import { rawMarkdownTo } from "@/site/site_page_markdown";
import { LanguageNavButton, ThemeToggleNavButton } from "@/components/SiteChromeControls";
import { sendCtaClick } from "@/utils/analytics";
import {
  FOOTER_EVALUATE_CTA_CLASS,
  FOOTER_SECONDARY_CTA_CLASS,
} from "@/components/code_block_copy_button_classes";

const PRODUCT_LINKS = [
  { label: "Install", href: "/install" },
  { label: "Architecture", href: "/architecture" },
  { label: "Memory guarantees", href: "/memory-guarantees" },
  { label: "FAQ", href: "/faq" },
];

const DOC_LINKS = [
  { label: "Docs", href: "/docs" },
  { label: "API", href: "/api" },
  { label: "MCP", href: "/mcp" },
  { label: "CLI", href: "/cli" },
];

const EXTERNAL_LINKS = [
  { label: "GitHub", href: "https://github.com/markmhendrickson/neotoma" },
  { label: "npm", href: "https://www.npmjs.com/package/neotoma" },
  { label: "Blog", href: "https://markmhendrickson.com/blog" },
];

const footerMarkdownLinkClass =
  "inline-flex h-9 min-h-9 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground no-underline transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Markdown (when available), language, and theme — shown in the global footer and vertical landing shells. */
export function SiteFooterUtilities() {
  const { locale, dict } = useLocale();
  const markdownSourcePath = useIndexableMarkdownSourcePath();

  return (
    <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:justify-end">
      {markdownSourcePath ? (
        <Link
          to={rawMarkdownTo(markdownSourcePath, locale)}
          title={dict.viewPageMarkdown}
          aria-label={dict.viewPageMarkdown}
          className={footerMarkdownLinkClass}
        >
          <FileText className="h-4 w-4 shrink-0" aria-hidden />
          <span className="hidden sm:inline">{dict.viewPageMarkdown}</span>
        </Link>
      ) : null}
      <LanguageNavButton />
      <ThemeToggleNavButton />
    </div>
  );
}

function FooterLink({
  href,
  label,
  onNavigate,
}: {
  href: string;
  label: string;
  onNavigate?: () => void;
}) {
  const isExternal = href.startsWith("http://") || href.startsWith("https://");
  const linkClassName =
    "text-[13px] text-muted-foreground no-underline transition-colors hover:text-foreground";

  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        {label}
      </a>
    );
  }

  return (
    <Link to={href} className={linkClassName} onClick={() => onNavigate?.()}>
      {label}
    </Link>
  );
}

export function SiteTailpiece() {
  const year = new Date().getFullYear();
  const { pack } = useLocale();
  const { version: liveVersion, releasesCount: liveReleasesCount } = useRepoMetaClient(
    REPO_VERSION,
    REPO_RELEASES_COUNT,
    REPO_STARS_COUNT
  );

  return (
    <footer className="relative overflow-hidden border-t border-black/10 bg-zinc-50/90 dark:border-white/10 dark:bg-zinc-950/70">
      <div className="relative mx-auto max-w-6xl px-6 py-10 md:px-10">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-1">
            <figure className="mb-3 w-full max-w-[64px] sm:max-w-[72px] pointer-events-none select-none">
              <img
                src={heroPackratHoldingRecordIllus}
                alt=""
                width={72}
                height={72}
                className="aspect-square w-full object-contain opacity-[0.36] dark:opacity-[0.62] dark:brightness-[1.15] dark:contrast-[1.06]"
                loading="lazy"
                decoding="async"
                aria-hidden="true"
              />
            </figure>
            <p className="text-[13px] font-medium text-foreground">Neotoma</p>
            <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
              The state layer for AI agents. Open-source and local-first.
            </p>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/80 dark:text-muted-foreground">
              Product
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {PRODUCT_LINKS.map((link) => (
                <FooterLink
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  onNavigate={
                    link.href === "/install" ? () => sendCtaClick("footer_install") : undefined
                  }
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/80 dark:text-muted-foreground">
              Documentation
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {DOC_LINKS.map((link) => (
                <FooterLink key={link.href} href={link.href} label={link.label} />
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/80 dark:text-muted-foreground">
              External
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {EXTERNAL_LINKS.map((link) => (
                <FooterLink key={link.href} href={link.href} label={link.label} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-border/60 pt-6 space-y-6">
          <div className="w-full space-y-3 sm:max-w-xl">
            <p className="text-[12px] leading-5 text-muted-foreground">
              Re-prompting costs time. Wrong state costs trust. Find out if
              Neotoma fits before either compounds.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Link
                to="/evaluate"
                className={FOOTER_EVALUATE_CTA_CLASS}
                onClick={() => sendCtaClick("footer_evaluate")}
              >
                <MessageSquare className="h-4 w-4 shrink-0" aria-hidden />
                <span className="whitespace-nowrap">{pack.homeHero.ctaEvaluateWithAgent}</span>
              </Link>
              <Link
                to="/meet"
                className={FOOTER_SECONDARY_CTA_CLASS}
                onClick={() => sendCtaClick("footer_meet_creator")}
              >
                <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
                <span className="whitespace-nowrap">{pack.homeHero.ctaMeetCreator}</span>
              </Link>
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-border/40 pt-4 md:flex-row md:items-center md:justify-between">
            <p className="max-w-full text-[12px] leading-relaxed text-muted-foreground">
              © {year} Neotoma · v{liveVersion} · {liveReleasesCount}{" "}
              {liveReleasesCount === 1 ? "release" : "releases"} · MIT-licensed · Built by{" "}
              <a
                href="https://markmhendrickson.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline underline-offset-2 hover:no-underline"
              >
                Mark Hendrickson
              </a>
            </p>
            <SiteFooterUtilities />
          </div>
        </div>
      </div>
    </footer>
  );
}
