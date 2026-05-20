import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";
import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";
import { Card, CardContent } from "@/components/ui/card";
import { DOC_NAV_ICONS, INTEGRATION_BRAND_ICONS } from "@/site/doc_icons";
import { DOC_NAV_CATEGORIES } from "@/site/site_data";
import { sendCtaClick, type CtaName } from "@/utils/analytics";
import { getLocalizedDocHubCategories } from "@/i18n/locales/docs_index_hub_localized";

function docsHubCta(itemHref: string, categoryId: string): CtaName | null {
  if (itemHref === "/evaluate" && categoryId === "getting_started") return "docs_evaluate_getting_started";
  if (itemHref === "/install") {
    if (categoryId === "getting_started") return "docs_install_getting_started";
    if (categoryId === "reference") return "docs_install_reference";
  }
  return null;
}

/** href -> icon name from DOC_NAV_CATEGORIES (External uses full URL). */
const ICON_BY_HREF = (() => {
  const map: Record<string, string> = {};
  for (const cat of DOC_NAV_CATEGORIES) {
    for (const item of cat.items) {
      if ("icon" in item && typeof item.icon === "string") {
        map[item.href] = item.icon;
      }
    }
  }
  return map;
})();

export function DocsIndexPage() {
  const { locale, dict, subpage } = useLocale();
  const hubCategories = getLocalizedDocHubCategories(locale, dict);

  return (
    <DetailPage title={subpage.docsIndex.title}>
      <div className="[&_a]:!no-underline [&_a]:hover:!no-underline [&_a]:focus:!no-underline">
        <p className="text-[15px] leading-7 text-muted-foreground mb-10">{dict.docsIntro}</p>

        {hubCategories.map((cat) => {
          return (
            <section key={cat.id} className="mb-12">
              <h2 className="text-[18px] font-medium tracking-[-0.01em] mb-4">{cat.title}</h2>
              <ul className="list-none pl-0 grid grid-cols-1 sm:grid-cols-2 auto-rows-fr gap-3">
                {cat.items.map((item) => {
                  const isExternal = item.href.startsWith("http");
                  const linkProps = isExternal
                    ? { target: "_blank" as const, rel: "noopener noreferrer" }
                    : {};
                  const BrandIcon = item.href.startsWith("/")
                    ? INTEGRATION_BRAND_ICONS[item.href]
                    : null;
                  const iconName = ICON_BY_HREF[item.href];
                  const LucideIconComponent =
                    iconName && DOC_NAV_ICONS[iconName]
                      ? DOC_NAV_ICONS[iconName]
                      : DOC_NAV_ICONS.BookOpen;
                  const Icon = BrandIcon ?? LucideIconComponent;
                  const desc = "desc" in item ? item.desc : null;
                  const trackDocsHub = () => {
                    const cta = docsHubCta(item.href, cat.id);
                    if (cta) sendCtaClick(cta);
                  };

                  const linkContent = (
                    <Card className="h-full transition-colors hover:bg-muted/50 border border-border [&_a]:no-underline [&_a]:hover:no-underline">
                      <CardContent className="p-4 h-full">
                        <div className="flex items-start gap-3">
                          <span
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                            aria-hidden
                          >
                            {Icon ? <Icon className="h-5 w-5 shrink-0" aria-hidden /> : null}
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-[15px] text-foreground block">
                              {item.label}
                            </span>
                            {desc && (
                              <span className="text-[13px] leading-snug text-muted-foreground block mt-0.5">
                                {desc}
                              </span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );

                  return (
                    <li key={item.href} className="h-full">
                      {isExternal ? (
                        <a
                          href={
                            item.href.startsWith("/") ? localizePath(item.href, locale) : item.href
                          }
                          className="block h-full no-underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                          {...linkProps}
                        >
                          {linkContent}
                        </a>
                      ) : item.href.startsWith("/#") ? (
                        <a
                          href={localizePath(item.href, locale)}
                          className="block h-full no-underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                          onClick={trackDocsHub}
                        >
                          {linkContent}
                        </a>
                      ) : (
                        <Link
                          to={localizePath(item.href, locale)}
                          className="block h-full no-underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                          onClick={trackDocsHub}
                        >
                          {linkContent}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </DetailPage>
  );
}
