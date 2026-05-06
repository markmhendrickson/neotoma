/**
 * Site translation policy: stable tokens vs locale-owned prose.
 *
 * All user-visible copy on localized routes (`/es/…`, `/ca/…`, …) SHOULD come from
 * `LocaleDictionary`, `StaticLocalePack`, `SubpageLocalePack`, or other locale-aware
 * accessors. Hard-coded English in subpage JSX is a defect to fix by moving strings
 * into packs, not by shipping parallel “English page” disclaimers in chrome.
 *
 * Allowed English fragments in non-English surfaces (sentinel / allowlist checks):
 * product names, protocol tokens, vendor names, HTTP methods, env vars, URLs,
 * route slugs, schema identifiers, code tokens, and quoted third-party English
 * where translation would misattribute the source.
 */
export const TECHNICAL_ENGLISH_TOKENS = [
  "Neotoma",
  "MCP",
  "CLI",
  "API",
  "REST",
  "SQLite",
  "JSON",
  "JWT",
  "RFC",
  "AAuth",
  "GitHub",
  "npm",
  "Docker",
  "Claude",
  "ChatGPT",
  "Cursor",
  "Codex",
  "OpenAI",
  "OpenCode",
  "OpenClaw",
  "IronClaw",
  "Wise",
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const;

export type TechnicalEnglishToken = (typeof TECHNICAL_ENGLISH_TOKENS)[number];

/** True when `value` is exactly a known technical token (not substring match). */
export function isTechnicalEnglishToken(value: string): boolean {
  return (TECHNICAL_ENGLISH_TOKENS as readonly string[]).includes(value.trim());
}
