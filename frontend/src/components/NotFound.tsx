import { Link } from "react-router-dom";
import { BookOpen, HelpCircle, Home, Search, ShieldCheck, Terminal } from "lucide-react";
import { SeoHead } from "@/components/SeoHead";
import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";

const linkClass =
  "block h-full rounded-lg border border-border bg-card p-4 text-foreground no-underline transition-colors hover:bg-muted/50 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const QUICK_LINKS = [
  {
    label: "Install",
    desc: "Set up Neotoma locally or with Docker.",
    href: "/install",
    Icon: Terminal,
  },
  {
    label: "Documentation",
    desc: "Browse setup, integrations, schemas, and reference pages.",
    href: "/docs",
    Icon: BookOpen,
  },
  {
    label: "Memory guarantees",
    desc: "Review the state guarantees Neotoma enforces.",
    href: "/memory-guarantees",
    Icon: ShieldCheck,
  },
  {
    label: "FAQ",
    desc: "Find answers to common setup and product questions.",
    href: "/faq",
    Icon: HelpCircle,
  },
] as const;

export function NotFound() {
  const { locale, dict } = useLocale();
  return (
    <>
      <SeoHead routePath="/404" />
      <div className="min-h-0 bg-background text-foreground">
        <main className="max-w-[52em] mx-auto px-4 py-10 md:py-16">
          <div className="mb-6 inline-flex items-center gap-2 rounded border border-border bg-muted/40 px-2.5 py-1 text-[12px] font-medium text-muted-foreground">
            <Search className="h-3.5 w-3.5" aria-hidden />
            Missing page
          </div>

          <h1 className="text-[28px] font-medium tracking-[-0.02em] mb-4 flex items-start gap-3">
            <span className="text-muted-foreground">404</span>
            <span>{dict.pageNotFound}</span>
          </h1>

          <p className="max-w-2xl text-[16px] leading-7 text-muted-foreground mb-6">
            {dict.notFoundDescription} The page may have moved, or the URL may be mistyped.
            Use the main pages below to get back into the Neotoma docs.
          </p>

          <div className="mb-10 flex flex-wrap gap-2">
            <Link
              to={localizePath("/", locale)}
              className="inline-flex items-center rounded-md border border-border bg-foreground px-4 py-2 text-[14px] font-medium text-background no-underline transition-colors hover:bg-foreground/90 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Home className="mr-2 h-4 w-4" aria-hidden />
              {dict.goHome}
            </Link>
            <Link
              to={localizePath("/docs", locale)}
              className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline transition-colors hover:bg-muted hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Browse docs
            </Link>
          </div>

          <section>
            <hr className="mb-6 border-border" aria-hidden />
            <h2 className="text-[20px] font-medium tracking-[-0.02em] text-foreground mb-3">
              Common destinations
            </h2>
            <ul className="list-none pl-0 grid grid-cols-1 sm:grid-cols-2 auto-rows-fr gap-3">
              {QUICK_LINKS.map(({ label, desc, href, Icon }) => (
                <li key={href}>
                  <Link to={localizePath(href, locale)} className={linkClass}>
                    <div className="flex items-start gap-3">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                        aria-hidden
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium text-foreground">
                          {label}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                          {desc}
                        </span>
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </main>
      </div>
    </>
  );
}
