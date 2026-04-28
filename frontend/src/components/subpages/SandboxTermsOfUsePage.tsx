import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  SANDBOX_TERMS_EFFECTIVE_DATE,
  SANDBOX_TERMS_MARKDOWN,
  SANDBOX_TERMS_VERSION,
} from "@shared/sandbox_terms_content";
import { DetailPage } from "../DetailPage";
import { LEGAL_PAGE_LINK_CLASS } from "@/site/legal_page_link";
import { SANDBOX_TERMS_JSON_URL } from "@/site/sandbox_doc_paths";

const h2Class = "text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3";
const pClass = "text-[15px] leading-7 mb-4";
const ulClass = "list-disc pl-5 text-[15px] leading-7 mb-4 space-y-2";
const codeClass =
  "rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[13px]";

/** Renders `**bold**` and `` `code` `` segments inside one line. */
function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className={codeClass}>
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * Human-readable mirror of the sandbox terms JSON. Source of truth for
 * markdown text is `src/shared/sandbox_terms_content.ts`.
 */
function SandboxTermsMarkdownBody({ md }: { md: string }): ReactNode {
  const lines = md.trim().split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  const key = () => k++;

  if (lines[0]?.startsWith("# ")) {
    i = 1;
  }
  if (lines[i] === "") {
    i += 1;
  }

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      out.push(
        <h2 key={key()} className={h2Class}>
          {line.slice(3)}
        </h2>,
      );
      i += 1;
      continue;
    }
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length) {
        const L = lines[i]!;
        if (!L.startsWith("- ")) {
          break;
        }
        let item = L.slice(2);
        i += 1;
        while (i < lines.length) {
          const C = lines[i]!;
          if (C.trim() === "") {
            break;
          }
          if (C.startsWith("## ") || C.startsWith("- ")) {
            break;
          }
          item += " " + C.trim();
          i += 1;
        }
        items.push(item);
      }
      out.push(
        <ul key={key()} className={ulClass}>
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    const paras: string[] = [];
    while (i < lines.length) {
      const L = lines[i]!;
      if (L.trim() === "" || L.startsWith("## ") || L.startsWith("- ")) {
        break;
      }
      paras.push(L);
      i += 1;
    }
    const text = paras
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
    if (text.trim()) {
      out.push(
        <p key={key()} className={pClass}>
          {renderInline(text)}
        </p>,
      );
    }
  }
  return <>{out}</>;
}

export function SandboxTermsOfUsePage() {
  return (
    <DetailPage title="Neotoma Public Sandbox - Terms of Use">
      <p className="text-[13px] text-muted-foreground mb-6">
        Version {SANDBOX_TERMS_VERSION} &middot; effective {SANDBOX_TERMS_EFFECTIVE_DATE}
      </p>

      <SandboxTermsMarkdownBody md={SANDBOX_TERMS_MARKDOWN} />

      <p className="text-[13px] text-muted-foreground mt-10 leading-6">
        For agents and tools, the same text is returned as JSON from{" "}
        <a
          href={SANDBOX_TERMS_JSON_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={LEGAL_PAGE_LINK_CLASS}
        >
          {SANDBOX_TERMS_JSON_URL}
        </a>
        . Also see the{" "}
        <Link to="/sandbox" className={LEGAL_PAGE_LINK_CLASS}>
          sandbox overview
        </Link>
        , the site{" "}
        <Link to="/privacy" className={LEGAL_PAGE_LINK_CLASS}>
          privacy notice
        </Link>
        , and{" "}
        <Link to="/terms" className={LEGAL_PAGE_LINK_CLASS}>
          terms of use
        </Link>
        .
      </p>
    </DetailPage>
  );
}
