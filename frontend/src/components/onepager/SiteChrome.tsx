import type { MouseEvent, ReactNode } from "react";
import { getSpaBasename, staticAssetPath } from "../../site/spa_path";
import { DEEPER_MATERIAL } from "./onepager_copy";
import { SolidLockup } from "./NeotomaLogos";
import { DOCS_VIEWER_COLLECTIONS } from "../../site/docs_viewer_manifest";
import { useOptionalLocale } from "../../i18n/LocaleContext";
import { saveLocale } from "../../i18n/routing";
import type { SupportedLocale } from "../../i18n/config";
import { isSpanishRetainedBaseRoute } from "../../site/spanish_route_set";

const SITE_NAV = [
  { title: "Architecture", href: "/architecture/" },
  ...DOCS_VIEWER_COLLECTIONS.filter((c) => !["trust", "start", "how-it-works"].includes(c.id)),
];

function siteHref(href: string): string {
  return href.startsWith("/") ? staticAssetPath(href) : href;
}

function localizedHref(href: string, locale: "en" | "es"): string {
  if (!href.startsWith("/")) return href;
  const match = /^([^?#]*)(.*)$/.exec(href)!;
  const path = match[1];
  const suffix = match[2];
  if (locale === "es" && isSpanishRetainedBaseRoute(path)) {
    return siteHref(`/es${path === "/" ? "/" : `${path.replace(/\/$/, "")}/`}${suffix}`);
  }
  return siteHref(path === "/" ? `/en/${suffix}` : href);
}

const spanishLabels: Record<string, string> = {
  Architecture: "Arquitectura", Home: "Inicio", Install: "Instalar", Interfaces: "Interfaces",
  Reference: "Referencia", Trust: "Confianza", Read: "Leer", Integrations: "Integraciones",
  "Changelog and releases": "Cambios y versiones", "MCP server": "Servidor MCP", Vocabulary: "Vocabulario",
  "Take part": "Participa", "Source code": "Código fuente", "npm package": "Paquete npm",
  Issues: "Incidencias", Discussions: "Debates", "Talk to us": "Habla con nosotros",
  Contributor: "Colaborador", "Organization and legal": "Organización y aspectos legales",
  "MIT license": "Licencia MIT", Privacy: "Privacidad", "Terms of use": "Condiciones de uso",
};
function chromeLabel(label: string, locale: "en" | "es"): string {
  return locale === "es" ? spanishLabels[label] ?? label : label;
}

/** First keyboard stop on public pages whose header precedes their main content. */
export function SiteSkipLink() {
  const context = useOptionalLocale();
  return (
    <a className="plan-skip" href="#main">
      {context?.locale === "es" ? "Ir al contenido" : "Skip to content"}
    </a>
  );
}

export function SiteHeader({
  home = false,
  brand,
  currentHref,
  pageLocale,
}: {
  home?: boolean;
  brand?: ReactNode;
  currentHref?: string;
  pageLocale?: "en" | "es";
}) {
  const context = useOptionalLocale();
  const locale = pageLocale ?? (context?.locale === "es" ? "es" : "en");
  return (
    <div className="plan-masthead">
      <a href={localizedHref("/", locale)} aria-label={locale === "es" ? "Inicio de Neotoma" : "Neotoma home"} className="plan-brand-link">
        {brand ?? <SolidLockup />}
      </a>
      <nav className="plan-nav" aria-label={locale === "es" ? "Sitio" : "Site"}>
        {SITE_NAV.map(({ title, href }) => (
          <a
            key={title}
            href={localizedHref(home && href.startsWith("/#") ? href.slice(1) : href, locale)}
            aria-current={currentHref === href ? "page" : undefined}
          >
            {chromeLabel(title, locale)}
          </a>
        ))}
      </nav>
    </div>
  );
}

export function SiteFooter({ routePath, pageLocale }: { routePath?: string; pageLocale?: "en" | "es" } = {}) {
  const context = useOptionalLocale();
  const browserPath = typeof window === "undefined" ? undefined : window.location.pathname;
  const basename = getSpaBasename();
  const path = routePath ?? (basename && browserPath?.startsWith(`${basename}/`) ? browserPath.slice(basename.length) : browserPath) ?? "/";
  const rawBasePath = path.startsWith("/es/") ? path.slice(3) : path === "/es" || path === "/es/" ? "/" : path === "/en" || path === "/en/" ? "/" : path;
  const basePath = isSpanishRetainedBaseRoute(rawBasePath) ? rawBasePath : "/";
  const locale = pageLocale ?? (context?.locale === "es" ? "es" : "en");
  const search = typeof window === "undefined" ? "" : window.location.search;
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  let stableHash = "";
  if (hash && typeof document !== "undefined") {
    try {
      if (document.getElementById(decodeURIComponent(hash.slice(1)))) stableHash = hash;
    } catch { /* A malformed fragment is not a stable counterpart anchor. */ }
  }
  const counterpart = (target: "en" | "es") =>
    siteHref(target === "es" ? `/es${basePath === "/" ? "/" : `${basePath.replace(/\/$/, "")}/`}${search}${stableHash}` : `${basePath === "/" ? "/en/" : `${basePath.replace(/\/$/, "")}/`}${search}${stableHash}`);
  const choose = (target: SupportedLocale) => (event: MouseEvent<HTMLAnchorElement>) => {
    saveLocale(target);
    if (target === locale && !(basePath === "/" && path === "/")) {
      event.preventDefault();
      return;
    }
  };
  return (
    <footer
      className="plan-site-footer"
      id="references"
      aria-label={locale === "es" ? "Referencias e información del sitio" : "References and site information"}
    >
      <div className="plan-footer-inner">
        <div className="plan-deeper">
          {DEEPER_MATERIAL.map((group) => (
            <div key={group.title}>
              <h3>{chromeLabel(group.title, locale)}</h3>
              <ul>
                {group.links.map((link) => (
                  <li key={link.label}>
                    {link.href ? (
                      <a href={localizedHref(link.href, locale)}>{chromeLabel(link.label, locale)}</a>
                    ) : (
                      <span>{chromeLabel(link.label, locale)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="plan-footer">
          <SolidLockup />
          <nav className="plan-language-choice" aria-label={locale === "es" ? "Idioma" : "Language"}>
            <span>{locale === "es" ? "Idioma" : "Language"}</span>
            <a href={counterpart("en")} data-locale-choice="en" aria-current={locale === "en" ? "page" : undefined} onClick={choose("en")}>English</a>
            <a href={counterpart("es")} data-locale-choice="es" aria-current={locale === "es" ? "page" : undefined} onClick={choose("es")}>Español</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
