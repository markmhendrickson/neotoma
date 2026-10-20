/**
 * Allow-list HTML serializer for docs viewer document bodies.
 *
 * Only the elements and attributes listed here are ever written; everything else is dropped
 * (attributes) or unwrapped to its children (elements). Text and attribute values are escaped.
 * Comments, doctypes and raw nodes are dropped. There is no path by which repository content can
 * produce a <script>, <style>, <iframe>, an on* event attribute, a style attribute, or a link with a
 * scheme other than http, https or mailto.
 */
import type { Element, ElementContent, Root, RootContent } from "hast";

type AttrRule = "id" | "class" | "href" | "src" | "text" | "int" | "role" | "align";

const ATTRS: Readonly<Record<string, Readonly<Record<string, AttrRule>>>> = {
  a: { href: "href", id: "id", className: "class", ariaLabel: "text", ariaDescribedBy: "id" },
  img: { src: "src", alt: "text", title: "text", width: "int", height: "int" },
  pre: { tabIndex: "int" },
  code: { className: "class" },
  span: { className: "class" },
  div: { className: "class", tabIndex: "int", role: "role", ariaLabel: "text" },
  h1: { id: "id" },
  h2: { id: "id", className: "class" },
  h3: { id: "id" },
  h4: { id: "id" },
  h5: { id: "id" },
  h6: { id: "id" },
  ol: { start: "int" },
  li: { id: "id", className: "class" },
  th: { align: "align" },
  td: { align: "align" },
  section: { className: "class" },
  ul: { className: "class" },
  p: {},
  strong: {},
  em: {},
  del: {},
  blockquote: {},
  table: {},
  thead: {},
  tbody: {},
  tr: {},
  sup: {},
  sub: {},
  hr: {},
  br: {},
};

const VOID = new Set(["img", "hr", "br"]);
const ROLES = new Set(["region"]);

export function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Final href gate (defense in depth after link rewriting). */
export function isSafeHref(href: string): boolean {
  const probe = href.replace(/[\u0000- \u007f-\u009f]/g, "");
  if (probe === "") return false;
  // Browsers read a backslash as a slash, so "/\\host" and "/%5Chost" are protocol-relative.
  if (/\\|%5c/i.test(probe)) return false;
  if (probe.startsWith("#")) return true;
  if (probe.startsWith("/") && !probe.startsWith("//")) return true;
  return /^(https?:\/\/|mailto:)/i.test(probe);
}

const HTML_ATTR_NAME: Readonly<Record<string, string>> = {
  className: "class",
  tabIndex: "tabindex",
  ariaLabel: "aria-label",
  ariaDescribedBy: "aria-describedby",
};

function attrValue(rule: AttrRule, raw: unknown): string | null {
  const v = Array.isArray(raw) ? raw.map(String).join(" ") : raw;
  if (v === null || v === undefined || v === false) return null;
  const s = String(v);
  switch (rule) {
    case "id":
      return /^[\p{L}\p{N}_:.-]+$/u.test(s) ? s : null;
    case "class": {
      const tokens = s.split(/\s+/).filter((t) => /^[A-Za-z0-9_-]+$/.test(t));
      return tokens.length ? tokens.join(" ") : null;
    }
    case "href":
      return isSafeHref(s) ? s : null;
    case "src":
      return /^\/docs\/_media\/[A-Za-z0-9._-]+$/.test(s) ? s : null;
    case "int":
      return /^-?\d{1,6}$/.test(s) ? s : null;
    case "role":
      return ROLES.has(s) ? s : null;
    case "align":
      return /^(left|right|center)$/.test(s) ? s : null;
    case "text":
      return s;
  }
}

function serializeElement(el: Element): string {
  const allowed = ATTRS[el.tagName];
  const inner = el.children.map(serializeNode).join("");
  if (!allowed) return inner; // unknown element: keep its text, drop the tag
  let attrs = "";
  for (const [prop, rule] of Object.entries(allowed)) {
    const value = attrValue(rule, el.properties?.[prop]);
    if (value === null) continue;
    if (rule === "align") {
      attrs += ` class="dv-align-${value}"`;
      continue;
    }
    attrs += ` ${HTML_ATTR_NAME[prop] ?? prop}="${escapeAttr(value)}"`;
  }
  if (el.tagName === "img") {
    if (!/ src="/.test(attrs))
      return el.properties?.alt ? escapeText(String(el.properties.alt)) : "";
    if (!/ alt="/.test(attrs)) attrs += ' alt=""';
    attrs += ' loading="lazy" decoding="async"';
  }
  if (VOID.has(el.tagName)) return `<${el.tagName}${attrs}>`;
  return `<${el.tagName}${attrs}>${inner}</${el.tagName}>`;
}

function serializeNode(node: RootContent | ElementContent): string {
  switch (node.type) {
    case "text":
      return escapeText(node.value);
    case "element":
      return serializeElement(node);
    default:
      return ""; // comment, doctype, raw: never emitted
  }
}

export function serializeHast(root: Root): string {
  return root.children.map(serializeNode).join("");
}
