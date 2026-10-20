/**
 * Docs viewer lint: the rules a repository markdown file must pass before neotoma.io publishes it.
 *
 * Errors block an `included` manifest entry (the build fails); for a `pending` entry they are only
 * reported. Warnings never block. Claim wording comes from `claim_patterns.ts`, shared with the
 * export validator. Inline code spans are exempt from the wording rules so a vocabulary can name a
 * forbidden term as code; prose, headings, table cells and fenced code (including mermaid) are scanned.
 */
import type { Code, Heading, Image, ListItem, Blockquote, Html } from "mdast";
import { toString } from "mdast-util-to-string";
import { visit } from "unist-util-visit";
import { findClaimProblems } from "./claim_patterns";
import {
  type ParsedDoc,
  type RenderContext,
  readHeader,
  resolveLink,
  textSegments,
} from "./render";

export type LintSeverity = "error" | "warning";

export interface LintFinding {
  rule: string;
  severity: LintSeverity;
  line: number;
  message: string;
}

/** Every lint rule, with what it enforces. Used in reports and the pull request description. */
export const LINT_RULES: Readonly<Record<string, { severity: LintSeverity; summary: string }>> = {
  "retired-noun": {
    severity: "error",
    summary:
      'Retired category nouns: "memory layer", "state layer", "your agents forget", "deterministic state".',
  },
  "omitted-claim": {
    severity: "error",
    summary:
      "Claims the claim table omits: corrections always win, database-enforced append-only, replay of any historical state or time travel, export with history, hosted Neotoma for sale, unified platform, multi-operator authority.",
  },
  telemetry: {
    severity: "error",
    summary:
      'An unqualified "no telemetry" or "no network egress": the passage must name the CLI update check.',
  },
  "retired-route-link": {
    severity: "error",
    summary: "A link to a retired neotoma.io route (one that is now a redirect stub).",
  },
  "dead-link": {
    severity: "error",
    summary: "A relative link to a path that does not exist in the repository, or that escapes it.",
  },
  "blocked-link": {
    severity: "error",
    summary: "A link with a scheme other than http, https or mailto (javascript:, data:, ...).",
  },
  "fence-language": {
    severity: "error",
    summary:
      "A fenced code block without a language (use text for prompts, URLs and sample output).",
  },
  "heading-depth": { severity: "error", summary: "A heading deeper than h3." },
  "raw-html": {
    severity: "error",
    summary:
      "Raw HTML in the source, including bare <placeholder> text outside code; <details> is named separately.",
  },
  details: { severity: "error", summary: "A <details> block (GitHub-only disclosure widget)." },
  "github-alert": {
    severity: "error",
    summary: "A GitHub alert blockquote ([!NOTE], [!WARNING], ...).",
  },
  "task-list": { severity: "error", summary: "A task list item (- [ ] / - [x])." },
  "status-emoji": {
    severity: "error",
    summary: "Status emoji or emoji shortcodes in prose (write the status as a word).",
  },
  "image-alt": { severity: "error", summary: "An image without alt text." },
  "image-source": {
    severity: "error",
    summary:
      "An image that is not a repository file of an allowed type and size (remote images are not allowed).",
  },
  "missing-applicability": {
    severity: "warning",
    summary: 'No "Applies to ..." line under the summary (or applies_to front matter).',
  },
  "missing-summary": {
    severity: "warning",
    summary:
      "No one-sentence summary as the first paragraph under the H1 (or summary front matter).",
  },
  "multiple-h1": { severity: "warning", summary: "More than one H1." },
  "dead-anchor": {
    severity: "warning",
    summary: "A link to a heading anchor that does not exist in the target viewer document.",
  },
};

const ALERT = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i;
/** Pictographs (not the text symbols (c), (r), TM or plain arrows), check and cross marks, :shortcodes:. */
const STATUS_EMOJI =
  /(?![©®™↔-↙↩↪])\p{Extended_Pictographic}|[✓✔✗✘]|(^|\s):[a-z0-9_+-]+:(?=\s|$|[.,;])/u;
export const IMAGE_TYPES = /\.(png|jpe?g|gif|webp|svg)$/i;
export const IMAGE_MAX_BYTES = 1_000_000;

export interface LintOptions {
  /** Size in bytes of a repository file, or null when unknown. */
  fileSize?: (repoPath: string) => number | null;
}

function finding(rule: string, line: number, message: string): LintFinding {
  return { rule, severity: LINT_RULES[rule]?.severity ?? "error", line, message };
}

export function lintDoc(doc: ParsedDoc, ctx: RenderContext, opts: LintOptions = {}): LintFinding[] {
  const out: LintFinding[] = [];
  const off = doc.bodyLineOffset;
  const lineOf = (n: { position?: { start: { line: number } } }) =>
    (n.position?.start.line ?? 0) + off;

  // Wording rules over prose and code blocks.
  const segments = textSegments(doc);
  for (const seg of segments) {
    for (const f of findClaimProblems(seg.text)) {
      const line =
        seg.line + (seg.kind === "code" ? seg.text.slice(0, f.index).split("\n").length - 1 : 0);
      out.push(finding(f.id, line, `${f.label}: "${f.match}"`));
    }
    if (seg.kind === "prose") {
      const m = STATUS_EMOJI.exec(seg.text);
      if (m)
        out.push(finding("status-emoji", seg.line, `status emoji or shortcode "${m[0].trim()}"`));
    }
  }

  let h1Count = 0;
  visit(doc.tree, (node) => {
    switch (node.type) {
      case "heading": {
        const h = node as Heading;
        if (h.depth === 1) h1Count += 1;
        if (h.depth > 3)
          out.push(
            finding("heading-depth", lineOf(h), `h${h.depth} "${toString(h).slice(0, 60)}"`)
          );
        break;
      }
      case "code": {
        const c = node as Code;
        if (!c.lang)
          out.push(finding("fence-language", lineOf(c), "code fence without a language"));
        break;
      }
      case "html": {
        const v = (node as Html).value.trim();
        if (/^<details\b/i.test(v) || /^<summary\b/i.test(v)) {
          out.push(finding("details", lineOf(node), `${v.slice(0, 40)}`));
        } else if (!/^<!--[\s\S]*-->$/.test(v)) {
          out.push(finding("raw-html", lineOf(node), `raw HTML ${JSON.stringify(v.slice(0, 50))}`));
        }
        break;
      }
      case "blockquote": {
        const first = (node as Blockquote).children[0];
        if (first && ALERT.test(toString(first))) {
          out.push(
            finding(
              "github-alert",
              lineOf(node),
              `GitHub alert ${ALERT.exec(toString(first))?.[0].trim()}`
            )
          );
        }
        break;
      }
      case "listItem": {
        const li = node as ListItem;
        if (li.checked === true || li.checked === false)
          out.push(finding("task-list", lineOf(li), "task list item"));
        break;
      }
      case "image": {
        const img = node as Image;
        if (!img.alt || !img.alt.trim())
          out.push(finding("image-alt", lineOf(img), `image ${img.url} has no alt text`));
        const r = resolveLink(img.url, ctx);
        if (r.kind !== "github" || !r.repoPath || !IMAGE_TYPES.test(r.repoPath)) {
          out.push(
            finding("image-source", lineOf(img), `image ${img.url} is not a repository image file`)
          );
        } else {
          const size = opts.fileSize?.(r.repoPath) ?? null;
          if (size !== null && size > IMAGE_MAX_BYTES) {
            out.push(
              finding(
                "image-source",
                lineOf(img),
                `image ${img.url} is ${size} bytes (cap ${IMAGE_MAX_BYTES})`
              )
            );
          }
        }
        break;
      }
      case "link":
      case "definition": {
        const url = (node as { url: string }).url;
        const r = resolveLink(url, ctx);
        if (r.problem === "retired-route") {
          out.push(
            finding("retired-route-link", lineOf(node), `link to retired neotoma.io route ${url}`)
          );
        } else if (r.problem === "dead-link" || r.problem === "outside-repo") {
          out.push(finding("dead-link", lineOf(node), `link target does not exist: ${url}`));
        } else if (r.problem === "blocked-scheme") {
          out.push(
            finding("blocked-link", lineOf(node), `link scheme not allowed: ${url.slice(0, 40)}`)
          );
        }
        break;
      }
    }
  });

  if (h1Count > 1) out.push(finding("multiple-h1", 1, `${h1Count} H1 headings`));
  const header = readHeader(doc);
  if (!header.summary)
    out.push(finding("missing-summary", 1 + off, "no summary sentence under the H1"));
  if (!header.appliesTo)
    out.push(finding("missing-applicability", 1 + off, 'no "Applies to ..." line'));

  return out.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

export function errorsOf(findings: readonly LintFinding[]): LintFinding[] {
  return findings.filter((f) => f.severity === "error");
}
