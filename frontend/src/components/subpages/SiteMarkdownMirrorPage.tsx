import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { SeoHead } from "@/components/SeoHead";
import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";
import { buildCanonicalUrl } from "@/site/seo_metadata";
import { htmlElementToMarkdown, SITE_MARKDOWN_ROOT_SELECTOR } from "@/site/html_to_markdown";
import {
  isFullPageMarkdownSourcePath,
  markdownSplatToSourcePath,
} from "@/site/markdown_mirror_paths";

const FETCH_MIN_TEXT = 80;
const IFRAME_POLL_MS = 120;
const IFRAME_TIMEOUT_MS = 25_000;
/** Wide enough that Tailwind `md:` applies inside the iframe (pages like Memory Guarantees use `hidden md:block` for the real `<table>`). */
const IFRAME_CAPTURE_WIDTH_PX = 1280;
const IFRAME_CAPTURE_HEIGHT_PX = 900;

async function tryFetchMarkdownFromPrerenderedHtml(
  pageUrl: string,
): Promise<string | null> {
  const res = await fetch(pageUrl, {
    credentials: "same-origin",
    headers: { Accept: "text/html" },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.querySelector(SITE_MARKDOWN_ROOT_SELECTOR);
  const text = root?.textContent?.trim() ?? "";
  if (!root || text.length < FETCH_MIN_TEXT) return null;
  return htmlElementToMarkdown(root);
}

function extractMarkdownFromIframeDocument(doc: Document): string | null {
  const root = doc.querySelector(SITE_MARKDOWN_ROOT_SELECTOR);
  const text = root?.textContent?.trim() ?? "";
  if (!root || text.length < FETCH_MIN_TEXT) return null;
  return htmlElementToMarkdown(root);
}

export function SiteMarkdownMirrorPage() {
  const { "*": splat } = useParams();
  const location = useLocation();
  const { hash } = location;
  const { locale } = useLocale();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sourcePath = markdownSplatToSourcePath(splat);
  const valid = isFullPageMarkdownSourcePath(sourcePath);
  const fetchPath = localizePath(`${sourcePath}${hash}`, locale);

  const [md, setMd] = useState<string>("");
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorDetail, setErrorDetail] = useState<string>("");

  const clearTimers = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(() => {
    if (!valid) return;

    let alive = true;
    clearTimers();

    const finishError = (msg: string) => {
      if (!alive) return;
      clearTimers();
      setPhase("error");
      setErrorDetail(msg);
    };

    const finishOk = (text: string) => {
      if (!alive) return;
      clearTimers();
      setMd(text);
      setPhase("ready");
    };

    setPhase("loading");
    setMd("");
    setErrorDetail("");

    void (async () => {
      try {
        const fromFetch = await tryFetchMarkdownFromPrerenderedHtml(
          `${window.location.origin}${fetchPath}`,
        );
        if (!alive) return;
        if (fromFetch) {
          finishOk(fromFetch);
          return;
        }
      } catch {
        // Dev server shell: use iframe.
      }

      const iframe = iframeRef.current;
      if (!iframe) {
        finishError("Missing iframe target.");
        return;
      }

      timeoutRef.current = setTimeout(() => {
        finishError("Timed out waiting for page content.");
      }, IFRAME_TIMEOUT_MS);

      const onLoad = () => {
        const idoc = iframe.contentDocument;
        if (!idoc) {
          finishError("Could not read iframe document.");
          return;
        }
        pollRef.current = setInterval(() => {
          if (!alive) return;
          const extracted = extractMarkdownFromIframeDocument(idoc);
          if (extracted) {
            finishOk(extracted);
          }
        }, IFRAME_POLL_MS);
      };

      iframe.addEventListener("load", onLoad, { once: true });
      iframe.src = `${window.location.origin}${fetchPath}`;
    })();

    return () => {
      alive = false;
      clearTimers();
    };
  }, [valid, fetchPath]);

  useEffect(() => {
    if (!valid) return;
    const slug = sourcePath === "/" ? "index" : sourcePath.replace(/^\//, "").replace(/\//g, "-");
    document.title = `${slug}.md · Neotoma`;
  }, [valid, sourcePath]);

  if (!valid) {
    return (
      <>
        <SeoHead routePath="/404" />
        <div className="min-h-screen bg-background p-4 text-[15px] leading-7 text-foreground">
          <p className="mb-3">Unknown or non-indexable path for full-page Markdown.</p>
          <p>
            <Link
              to={localizePath("/site-markdown", locale)}
              className="text-foreground underline underline-offset-2 hover:no-underline"
            >
              Markdown index
            </Link>
          </p>
        </div>
      </>
    );
  }

  const headerLines = [
    `<!--`,
    `  Full-page Markdown export (rendered HTML → GFM).`,
    `  Source: ${buildCanonicalUrl(localizePath(sourcePath, locale))}`,
    `  Generated: ${new Date().toISOString()}`,
    `-->`,
    "",
  ].join("\n");

  const fullMd = md ? `${headerLines}${md}` : "";

  return (
    <>
      <SeoHead routePath={location.pathname} />
      <iframe
        ref={iframeRef}
        title="Markdown capture"
        aria-hidden
        width={IFRAME_CAPTURE_WIDTH_PX}
        height={IFRAME_CAPTURE_HEIGHT_PX}
        className="pointer-events-none fixed left-[-9999px] top-0 z-[-1] border-0 opacity-0"
        sandbox="allow-same-origin allow-scripts allow-forms"
      />
      <div className="min-h-screen bg-background text-foreground">
        {phase === "loading" || phase === "idle" ? (
          <p className="p-4 text-[15px] text-muted-foreground">Generating Markdown from rendered page…</p>
        ) : null}
        {phase === "error" ? (
          <p className="p-4 text-[15px] text-destructive">
            {errorDetail || "Could not extract page content."}
          </p>
        ) : null}
        {phase === "ready" && fullMd ? (
          <pre className="whitespace-pre-wrap break-words p-4 font-mono text-[13px] leading-relaxed text-foreground">
            {fullMd}
          </pre>
        ) : null}
      </div>
    </>
  );
}
