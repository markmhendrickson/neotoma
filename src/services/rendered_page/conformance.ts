/**
 * rendered_page conformance checks (warn-first, model-independent).
 *
 * Two distinct layers, deliberately kept separate:
 *
 *   1. UNIVERSAL invariants — true for every Neotoma tenant, not configurable.
 *      Currently: tokenless internal cross-links. An `…/entities/<id>/html` href
 *      with no `access_token` is page-scoped-broken: it 401s for a guest
 *      recipient even though it works for the owner. That's a correctness fact
 *      of Neotoma's guest-access model, so it belongs in core for everyone.
 *
 *   2. POLICY rules — a tenant's own quality bar, supplied as DATA (a
 *      `conformance_policy` entity), NOT hardcoded here. Light+dark theming, a
 *      manual theme toggle, brand constraints, etc. are one user's taste (e.g.
 *      Ateles); another tenant may legitimately want none of them. Core ships a
 *      generic regex-presence/absence + severity engine; the tenant ships the
 *      rules. The SAME policy entity is read by the tenant's agents (to act
 *      proactively) and evaluated here (the reactive backstop), so the two
 *      never drift.
 *
 * Everything here is pure and total: never throws, returns `[]` on empty input,
 * and a malformed rule is skipped (fail-open). Publishing must never fail on a
 * conformance result — these are advisory, like `store_warnings`.
 */

export type ConformanceSeverity = "warn" | "block";

export interface RenderedPageWarning {
  code: string;
  message: string;
  severity: ConformanceSeverity;
}

/** One declarative, tenant-authored rule. Stored on a `conformance_policy` entity. */
export interface ConformanceRule {
  /** Stable identifier surfaced in the warning. */
  code: string;
  /** Regex source evaluated against the chosen target. */
  pattern: string;
  /** Regex flags (default "i"). */
  flags?: string;
  /** Whether the pattern MUST appear (`require_present`) or MUST NOT (`require_absent`). */
  mode: "require_present" | "require_absent";
  /** Which content to scan (default "both"). */
  target?: "html" | "css" | "both";
  /** Severity if violated (default "warn"). */
  severity?: ConformanceSeverity;
  /** Human-readable guidance shown when the rule is violated. */
  message: string;
}

export interface ConformancePolicy {
  rules: ConformanceRule[];
}

// --- Universal invariant: tokenless internal cross-links -------------------

function extractHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /href\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[2] ?? m[3] ?? "");
  return out;
}

function isInternalEntityHtmlHref(href: string): boolean {
  return /\/entities\/[^/"'?#\s]+\/html(?:[?#]|$)/i.test(href);
}

function carriesAccessToken(href: string): boolean {
  return /[?&]access_token=/i.test(href);
}

function universalChecks(html: string): RenderedPageWarning[] {
  const tokenless = extractHrefs(html).filter(
    (href) => isInternalEntityHtmlHref(href) && !carriesAccessToken(href)
  );
  if (tokenless.length === 0) return [];
  const sample = tokenless.slice(0, 5).join(", ");
  return [
    {
      code: "RENDERED_PAGE_TOKENLESS_LINK",
      severity: "warn",
      message:
        `${tokenless.length} internal rendered-page link(s) carry no access_token and will 401 ` +
        `for guest recipients (guest tokens are page-scoped, not a session). Stamp each cross-link ` +
        `with the TARGET page's own token: /entities/<id>/html?access_token=<token>. Offending: ${sample}`,
    },
  ];
}

// --- Policy engine: tenant-supplied declarative rules ----------------------

function evaluateRule(
  html: string,
  css: string,
  rule: ConformanceRule
): RenderedPageWarning | null {
  if (!rule || typeof rule.pattern !== "string" || typeof rule.code !== "string") return null;
  const target = rule.target ?? "both";
  const haystack = target === "html" ? html : target === "css" ? css : `${css}\n${html}`;
  let re: RegExp;
  try {
    re = new RegExp(rule.pattern, rule.flags ?? "i");
  } catch {
    return null; // malformed rule → skip (fail-open)
  }
  const present = re.test(haystack);
  const violated = rule.mode === "require_absent" ? present : !present;
  if (!violated) return null;
  return {
    code: rule.code,
    severity: rule.severity ?? "warn",
    message: rule.message ?? `Conformance rule ${rule.code} violated.`,
  };
}

/**
 * Compute conformance warnings for a rendered_page. Universal invariants always
 * run; tenant `policy` rules run when supplied. Pure and total.
 */
export function checkRenderedPageConformance(
  htmlBody: string | undefined,
  customCss: string | undefined,
  policy?: ConformancePolicy
): RenderedPageWarning[] {
  const html = typeof htmlBody === "string" ? htmlBody : "";
  const css = typeof customCss === "string" ? customCss : "";
  if (!html && !css) return [];

  const out = universalChecks(html);
  const rules = policy?.rules;
  if (Array.isArray(rules)) {
    for (const rule of rules) {
      const w = evaluateRule(html, css, rule);
      if (w) out.push(w);
    }
  }
  return out;
}
