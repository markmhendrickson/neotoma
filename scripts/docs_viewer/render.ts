/**
 * Build-time markdown renderer for the neotoma.io docs viewer.
 *
 * Markdown is parsed with the same remark + remark-gfm stack the MDX site pipeline uses, converted to
 * HTML syntax trees with raw HTML disabled, highlighted with refractor (Prism grammars, at build time),
 * and written out by a strict allow-list serializer (`serialize.ts`). Repository content can never
 * emit a script, an event attribute, a style attribute, an iframe or a `javascript:` / `data:` link:
 * - raw HTML in the source is turned into visible text before conversion (escaped, never parsed);
 * - link and image URLs pass a scheme allow-list (http, https, mailto, same-page and site-relative);
 * - the serializer emits only allow-listed elements and attributes and escapes every value.
 *
 * Relative links are rewritten per source file: a link to a published viewer document becomes its
 * `/docs/<slug>/` route (anchor kept); any other repository path becomes a GitHub blob or tree URL at
 * the build commit. Pure apart from the injected `pathKind` lookup.
 */
import path from "node:path";
import type { Root as HastRoot, Element as HastElement, ElementContent, RootContent } from "hast";
import type {
  Root as MdRoot,
  RootContent as MdRootContent,
  Heading,
  Paragraph,
  Image,
  Link,
  Definition,
  Code,
  Html,
} from "mdast";
import { toHast } from "mdast-util-to-hast";
import { toString } from "mdast-util-to-string";
import { refractor } from "refractor/core";
import bash from "refractor/bash";
import diff from "refractor/diff";
import docker from "refractor/docker";
import http from "refractor/http";
import ini from "refractor/ini";
import javascript from "refractor/javascript";
import json from "refractor/json";
import python from "refractor/python";
import sql from "refractor/sql";
import toml from "refractor/toml";
import typescript from "refractor/typescript";
import yaml from "refractor/yaml";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { isRetiredRoute } from "../../frontend/src/site/route_retirement";
import {
  type DocsViewerIndex,
  excludedReason,
  viewerHref,
} from "../../frontend/src/site/docs_viewer_manifest";
import { parseFlatYaml, splitFrontmatter } from "../../src/services/docs/doc_frontmatter";
import { serializeHast } from "./serialize";

for (const lang of [
  bash,
  diff,
  docker,
  http,
  ini,
  javascript,
  json,
  python,
  sql,
  toml,
  typescript,
  yaml,
]) {
  refractor.register(lang);
}

export const GITHUB_REPO_URL = "https://github.com/markmhendrickson/neotoma";

/** Fence languages mapped to the grammar used for highlighting. Unknown languages render plain. */
const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  yml: "yaml",
  jsonc: "json",
  json5: "json",
  py: "python",
  dockerfile: "docker",
  env: "ini",
  dotenv: "ini",
};

export type PathKind = "file" | "dir" | null;

export interface RenderContext {
  /** Repository-relative POSIX path of the markdown file being rendered. */
  sourcePath: string;
  /** Full commit SHA the site is built from; GitHub URLs are pinned to it. */
  commit: string;
  /** Published viewer documents (links to them become viewer routes). */
  index: DocsViewerIndex;
  /** Whether a repository path is a tracked file, a directory, or absent. */
  pathKind: (repoPath: string) => PathKind;
}

export type LinkKind =
  | "anchor"
  | "viewer"
  | "github"
  | "external"
  | "site"
  | "mailto"
  | "blocked"
  | "broken";

export interface ResolvedLink {
  original: string;
  /** Href to emit, or null when the link must not be emitted (rendered as text). */
  href: string | null;
  kind: LinkKind;
  /** Repository path for repository links. */
  repoPath?: string;
  /** Fragment, without '#'. */
  hash?: string;
  /** Problem id when the link is not acceptable on a published page. */
  problem?: "retired-route" | "dead-link" | "blocked-scheme" | "outside-repo";
  line?: number;
}

const CONTROL = /[\u0000- \u007f-\u009f]/g;
const ALLOWED_SCHEMES = new Set(["http", "https", "mailto"]);
const SITE_HOSTS = new Set(["neotoma.io", "www.neotoma.io"]);

function githubUrl(kind: "blob" | "tree", commit: string, repoPath: string, hash?: string): string {
  const encoded = repoPath
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
  const suffix = kind === "tree" ? "/" : "";
  return `${GITHUB_REPO_URL}/${kind}/${commit}/${encoded}${suffix}${hash ? `#${hash}` : ""}`;
}

function viewerTarget(repoPath: string, index: DocsViewerIndex): string | null {
  const e =
    index.bySource.get(repoPath) ??
    index.bySource.get(repoPath.replace(/\/$/, "")) ??
    index.bySource.get(`${repoPath.replace(/\/$/, "")}/`);
  if (!e) return null;
  if (excludedReason(e.source)) return null;
  return viewerHref(e.slug);
}

/** Resolve one link or image URL found in `ctx.sourcePath`. */
export function resolveLink(url: string, ctx: RenderContext): ResolvedLink {
  const original = url;
  const trimmed = url.trim();
  const probe = trimmed.replace(CONTROL, "");
  if (probe === "") return { original, href: null, kind: "blocked", problem: "blocked-scheme" };
  if (probe.startsWith("#")) {
    return {
      original,
      href: `#${encodeFragment(probe.slice(1))}`,
      kind: "anchor",
      hash: probe.slice(1),
    };
  }
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(probe)?.[1]?.toLowerCase();
  if (scheme) {
    if (!ALLOWED_SCHEMES.has(scheme)) {
      return { original, href: null, kind: "blocked", problem: "blocked-scheme" };
    }
    if (scheme === "mailto") return { original, href: probe, kind: "mailto" };
    let u: URL;
    try {
      u = new URL(probe);
    } catch {
      return { original, href: null, kind: "blocked", problem: "blocked-scheme" };
    }
    if (SITE_HOSTS.has(u.hostname)) {
      const route = u.pathname.replace(/\/+$/, "") || "/";
      const retired = isRetiredRoute(route, ctx.index);
      return {
        original,
        href: u.toString(),
        kind: "site",
        ...(retired ? { problem: "retired-route" as const } : {}),
      };
    }
    // A GitHub link to a published document of this repository goes to the viewer instead.
    const gh = /^\/markmhendrickson\/neotoma\/(?:blob|tree)\/[^/]+\/(.+)$/.exec(u.pathname);
    if (u.hostname === "github.com" && gh) {
      let repoPath: string;
      try {
        repoPath = decodeURIComponent(gh[1]);
      } catch {
        repoPath = gh[1];
      }
      const v = viewerTarget(repoPath, ctx.index);
      if (v) {
        const hash = u.hash ? u.hash.slice(1) : undefined;
        return { original, href: `${v}${hash ? `#${hash}` : ""}`, kind: "viewer", repoPath, hash };
      }
    }
    return { original, href: u.toString(), kind: "external" };
  }
  if (probe.startsWith("//"))
    return { original, href: null, kind: "blocked", problem: "blocked-scheme" };

  // Repository-relative link.
  const hashAt = trimmed.indexOf("#");
  const beforeHash = hashAt >= 0 ? trimmed.slice(0, hashAt) : trimmed;
  const hash = hashAt >= 0 ? trimmed.slice(hashAt + 1) : undefined;
  const pathPart = beforeHash.split("?")[0];
  if (pathPart === "") {
    return { original, href: hash ? `#${encodeFragment(hash)}` : null, kind: "anchor", hash };
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    return { original, href: null, kind: "broken", problem: "dead-link" };
  }
  const isDir = decoded.endsWith("/");
  const joined = decoded.startsWith("/")
    ? path.posix.normalize(decoded.slice(1))
    : path.posix.normalize(path.posix.join(path.posix.dirname(ctx.sourcePath), decoded));
  if (joined === ".." || joined.startsWith("../") || path.posix.isAbsolute(joined)) {
    return { original, href: null, kind: "broken", problem: "outside-repo" };
  }
  const repoPath = joined === "." ? "" : joined.replace(/\/$/, "");
  const v = viewerTarget(isDir ? `${repoPath}/` : repoPath, ctx.index);
  if (v)
    return {
      original,
      href: `${v}${hash ? `#${encodeFragment(hash)}` : ""}`,
      kind: "viewer",
      repoPath,
      hash,
    };
  const kind = repoPath === "" ? "dir" : ctx.pathKind(repoPath);
  if (kind === null) {
    return {
      original,
      href: githubUrl("blob", ctx.commit, repoPath, hash),
      kind: "broken",
      repoPath,
      hash,
      problem: "dead-link",
    };
  }
  return {
    original,
    href: githubUrl(kind === "dir" ? "tree" : "blob", ctx.commit, repoPath, hash),
    kind: "github",
    repoPath,
    hash,
  };
}

function encodeFragment(hash: string): string {
  return encodeURIComponent(hash).replace(/%2F/gi, "/");
}

/**
 * GitHub-compatible heading slug: lower-case, drop everything that is not a letter, mark, number,
 * connector punctuation, hyphen or space, then spaces to hyphens. Duplicates get -1, -2, ...
 */
export function githubSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");
}

export class Slugger {
  private seen = new Map<string, number>();
  slug(text: string): string {
    const base = githubSlug(text);
    let candidate = base;
    let n = this.seen.get(base) ?? 0;
    while (this.seen.has(candidate)) {
      n += 1;
      candidate = `${base}-${n}`;
    }
    this.seen.set(base, n);
    this.seen.set(candidate, 0);
    return candidate;
  }
}

export interface ParsedDoc {
  sourcePath: string;
  frontmatter: Record<string, unknown>;
  body: string;
  /** Line offset of the body in the source file (front matter lines). */
  bodyLineOffset: number;
  tree: MdRoot;
}

export function parseDoc(sourcePath: string, source: string): ParsedDoc {
  const normalized = source.replace(/\r\n/g, "\n");
  const { yaml, body } = splitFrontmatter(normalized);
  const frontmatter = (yaml ? parseFlatYaml(yaml) : {}) as Record<string, unknown>;
  const bodyLineOffset = yaml === null ? 0 : yaml.split("\n").length + 2;
  const processor = unified().use(remarkParse).use(remarkGfm);
  const tree = processor.runSync(processor.parse(body)) as MdRoot;
  return { sourcePath, frontmatter, body, bodyLineOffset, tree };
}

export const APPLIES_TO_RE = /^applies to\b/i;

export interface DocHeader {
  /** First H1 text, if any. */
  h1: string | null;
  summary: string | null;
  summarySource: "frontmatter" | "paragraph" | null;
  appliesTo: string | null;
  appliesToSource: "frontmatter" | "line" | null;
  /** Top-level node indexes consumed by the header (H1, summary paragraph, applicability line). */
  consumed: number[];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Title, summary and applicability as the viewer shows them above the document. */
export function readHeader(doc: ParsedDoc): DocHeader {
  const children = doc.tree.children;
  const consumed: number[] = [];
  let i = 0;
  let h1: string | null = null;
  if (children[0]?.type === "heading" && (children[0] as Heading).depth === 1) {
    h1 = toString(children[0]).trim();
    consumed.push(0);
    i = 1;
  }
  let summary = str(doc.frontmatter.summary);
  let summarySource: DocHeader["summarySource"] = summary ? "frontmatter" : null;
  let appliesTo = str(doc.frontmatter.applies_to);
  let appliesToSource: DocHeader["appliesToSource"] = appliesTo ? "frontmatter" : null;
  // The first paragraphs after the H1: the summary sentence, then an optional "Applies to" line.
  for (let j = i; j < Math.min(children.length, i + 3); j++) {
    const node = children[j];
    if (node.type !== "paragraph") break;
    const text = toString(node).replace(/\s+/g, " ").trim();
    if (APPLIES_TO_RE.test(text)) {
      if (!appliesTo) {
        appliesTo = text;
        appliesToSource = "line";
      }
      consumed.push(j);
      continue;
    }
    // A body paragraph that repeats the front matter summary is not shown twice.
    if (summary && summarySource === "frontmatter" && j === i && text === summary) {
      consumed.push(j);
      continue;
    }
    if (!summary && j === i && isPlainSentence(node as Paragraph)) {
      summary = text;
      summarySource = "paragraph";
      consumed.push(j);
      continue;
    }
    break;
  }
  return { h1, summary, summarySource, appliesTo, appliesToSource, consumed };
}

/** A summary is plain prose: not a bold-only tagline, not an italic subtitle, a sentence of modest length. */
export function isPlainSentence(p: Paragraph): boolean {
  if (
    p.children.length === 1 &&
    (p.children[0].type === "strong" || p.children[0].type === "emphasis")
  ) {
    return false;
  }
  if (p.children[0]?.type === "strong") return false;
  const text = toString(p).replace(/\s+/g, " ").trim();
  return text.length > 0 && text.length <= 320 && /[.!?:)]$/.test(text);
}

export interface RenderedHeading {
  depth: number;
  text: string;
  id: string;
}

export interface RenderedImage {
  /** Repository path of the image. */
  repoPath: string;
  /** Public path the build copies it to. */
  publicPath: string;
}

export interface RenderedDoc {
  header: DocHeader;
  /** Sanitized body HTML (the H1, summary and applicability line are shown by the page chrome). */
  html: string;
  headings: RenderedHeading[];
  links: ResolvedLink[];
  images: RenderedImage[];
}

export interface RenderOptions {
  /** Map an image repository path to the public path it is copied to; null rejects the image. */
  imagePublicPath?: (repoPath: string) => string | null;
}

/** Render a parsed document to sanitized HTML. Does not mutate `doc`. */
export function renderDoc(
  doc: ParsedDoc,
  ctx: RenderContext,
  opts: RenderOptions = {}
): RenderedDoc {
  const header = readHeader(doc);
  const tree = structuredClone(doc.tree) as MdRoot;
  tree.children = tree.children.filter((_, idx) => !header.consumed.includes(idx));

  const links: ResolvedLink[] = [];
  const images: RenderedImage[] = [];
  const headings: RenderedHeading[] = [];
  const slugger = new Slugger();

  // Raw HTML is never parsed: show it as text (a paragraph when it stood as a block).
  visit(tree, "html", (node: Html, index, parent) => {
    if (!parent || index === undefined) return;
    const text = { type: "text", value: node.value } as const;
    const block =
      parent.type === "root" || parent.type === "blockquote" || parent.type === "listItem";
    (parent.children as MdRootContent[])[index] = (
      block ? { type: "paragraph", children: [text] } : text
    ) as MdRootContent;
  });

  visit(tree, (node) => {
    if (node.type === "heading") {
      const h = node as Heading;
      const text = toString(h).trim();
      const id = slugger.slug(text);
      headings.push({ depth: h.depth, text, id });
      h.data = { ...(h.data ?? {}), hProperties: { id } };
    } else if (node.type === "link" || node.type === "definition") {
      const l = node as Link | Definition;
      const r = {
        ...resolveLink(l.url, ctx),
        line: (l.position?.start.line ?? 0) + doc.bodyLineOffset,
      };
      links.push(r);
      l.url = r.href ?? "";
    } else if (node.type === "image") {
      const img = node as Image;
      const r = resolveLink(img.url, ctx);
      const publicPath =
        r.kind === "github" && r.repoPath && opts.imagePublicPath
          ? opts.imagePublicPath(r.repoPath)
          : null;
      if (publicPath && r.repoPath) {
        images.push({ repoPath: r.repoPath, publicPath });
        img.url = publicPath;
      } else {
        img.url = "";
      }
    }
  });

  const hast = toHast(tree, { allowDangerousHtml: false }) as HastRoot;
  decorate(hast);
  return { header, html: serializeHast(hast), headings, links, images };
}

function classList(el: HastElement): string[] {
  const c = el.properties?.className;
  return Array.isArray(c) ? c.map(String) : typeof c === "string" ? c.split(/\s+/) : [];
}

/** Highlight code, wrap tables and code for in-place scrolling, add heading anchors. */
function decorate(root: HastRoot): void {
  let tableCount = 0;
  const walk = (parent: HastRoot | HastElement) => {
    const kids = parent.children as (RootContent | ElementContent)[];
    for (let i = 0; i < kids.length; i++) {
      const node = kids[i];
      if (node.type !== "element") continue;
      if (node.tagName === "pre") {
        const code = node.children.find(
          (c): c is HastElement => c.type === "element" && c.tagName === "code"
        );
        const lang = code
          ? (classList(code)
              .find((c) => c.startsWith("language-"))
              ?.slice(9) ?? "")
          : "";
        if (code) {
          const value = code.children.map((c) => (c.type === "text" ? c.value : "")).join("");
          const grammar = LANGUAGE_ALIASES[lang.toLowerCase()] ?? lang.toLowerCase();
          if (grammar && refractor.registered(grammar)) {
            code.children = refractor.highlight(value, grammar).children as ElementContent[];
          }
        }
        node.properties = { ...node.properties, tabIndex: 0 };
        const label: ElementContent[] = lang
          ? [
              {
                type: "element",
                tagName: "span",
                properties: { className: ["dv-code-lang"] },
                children: [{ type: "text", value: lang }],
              },
            ]
          : [];
        kids[i] = {
          type: "element",
          tagName: "div",
          properties: { className: ["dv-code"] },
          children: [...label, node],
        };
        continue;
      }
      if (node.tagName === "table") {
        tableCount += 1;
        kids[i] = {
          type: "element",
          tagName: "div",
          properties: {
            className: ["dv-table"],
            tabIndex: 0,
            role: "region",
            ariaLabel: `Table ${tableCount}`,
          },
          children: [node],
        };
        continue;
      }
      if (/^h[1-6]$/.test(node.tagName) && typeof node.properties?.id === "string") {
        const id = node.properties.id;
        const text = node.children
          .map((c) => textOf(c))
          .join("")
          .trim();
        node.children.push({
          type: "element",
          tagName: "a",
          properties: {
            className: ["dv-anchor"],
            href: `#${id}`,
            ariaLabel: `Link to this section: ${text}`,
          },
          children: [{ type: "text", value: "#" }],
        });
      }
      walk(node);
    }
  };
  walk(root);
}

function textOf(n: ElementContent | RootContent): string {
  if (n.type === "text") return n.value;
  if (n.type === "element") return n.children.map((c) => textOf(c)).join("");
  return "";
}

/** Text of a document for claim scanning: prose and code blocks, without inline code spans. */
export interface TextSegment {
  text: string;
  /** 1-based line in the source file where the segment starts. */
  line: number;
  kind: "prose" | "code";
}

export function textSegments(doc: ParsedDoc): TextSegment[] {
  const out: TextSegment[] = [];
  const proseOf = (node: MdRootContent): string => {
    if (node.type === "inlineCode") return "";
    if (node.type === "text") return node.value;
    if (node.type === "html") return node.value;
    if ("children" in node) return (node.children as MdRootContent[]).map(proseOf).join("");
    return "";
  };
  visit(doc.tree, (node) => {
    const line = (node.position?.start.line ?? 0) + doc.bodyLineOffset;
    if (node.type === "code") {
      out.push({ text: (node as Code).value, line: line + 1, kind: "code" });
      return "skip";
    }
    if (node.type === "paragraph" || node.type === "heading" || node.type === "tableCell") {
      out.push({ text: proseOf(node as MdRootContent).replace(/\n/g, " "), line, kind: "prose" });
      return "skip";
    }
    if (node.type === "html") {
      out.push({ text: (node as Html).value, line, kind: "prose" });
      return "skip";
    }
    return undefined;
  });
  return out;
}
