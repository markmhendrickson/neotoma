/**
 * Inspector skin loader.
 *
 * Resolves the active visual skin from environment variables and produces a
 * JSON payload to inject into the Inspector SPA shell. Deep token sanitation
 * (HSL allowlist, brand label trimming) is performed by the frontend
 * `sanitize_inspector_skin_config` on boot; this module enforces the basic
 * structural and JSON-safety invariants so a bad config can never produce a
 * broken HTML response.
 *
 * Resolution precedence (highest to lowest):
 *   1. `NEOTOMA_INSPECTOR_SKIN_CONFIG` — absolute path to a JSON file
 *   2. `NEOTOMA_INSPECTOR_SKIN` — preset name resolved against the bundled
 *      Inspector's `skins/` directory (or the source-checkout
 *      `inspector/public/skins/` directory as a dev fallback)
 *   3. no skin
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ResolvedInspectorSkin {
  /** Stable skin slug, e.g. `sample`. */
  name: string;
  /** Optional display label. */
  label?: string;
  /** Optional brand text overrides. */
  brand?: {
    sidebar_title?: string;
    header_title?: string;
    home_aria_label?: string;
  };
  /** Light-mode CSS variable map (`<token>` -> `<value>`). */
  light?: Record<string, string>;
  /** Dark-mode CSS variable map (`<token>` -> `<value>`). */
  dark?: Record<string, string>;
  /** Filesystem origin of the skin JSON for logging. */
  source_path: string;
}

const SKIN_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function resolvePackageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

function safeReadJson(filePath: string): unknown | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function coerceStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string") continue;
    if (key.length > 64) continue;
    out[key] = raw;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function coerceBrand(value: unknown): ResolvedInspectorSkin["brand"] {
  if (!isRecord(value)) return undefined;
  const sidebar_title =
    typeof value.sidebar_title === "string" ? value.sidebar_title : undefined;
  const header_title =
    typeof value.header_title === "string" ? value.header_title : undefined;
  const home_aria_label =
    typeof value.home_aria_label === "string" ? value.home_aria_label : undefined;
  if (!sidebar_title && !header_title && !home_aria_label) return undefined;
  return { sidebar_title, header_title, home_aria_label };
}

function shapeSkin(raw: unknown, source_path: string): ResolvedInspectorSkin | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.name !== "string" || !raw.name.trim()) return null;
  const name = raw.name.trim();
  return {
    name,
    label: typeof raw.label === "string" ? raw.label : undefined,
    brand: coerceBrand(raw.brand),
    light: coerceStringRecord(raw.light),
    dark: coerceStringRecord(raw.dark),
    source_path,
  };
}

/**
 * Resolve the bundled Inspector dist directory (skins live under `<dir>/skins`).
 * Mirrors `resolveBundledInspectorDir` in `inspector_mount.ts`; duplicated
 * intentionally so this module has no circular dependency on the mount.
 */
function resolveBundledInspectorSkinsDir(): string[] {
  const root = resolvePackageRoot();
  const candidates: string[] = [];
  candidates.push(path.join(root, "dist", "inspector", "skins"));
  candidates.push(path.join(root, "inspector", "dist", "skins"));
  // Source-checkout dev fallback: vite has not copied public/ yet.
  candidates.push(path.join(root, "inspector", "public", "skins"));
  return candidates;
}

/** Internal: read a skin JSON file path and shape it, returning null on any failure. */
function loadSkinFromPath(filePath: string): ResolvedInspectorSkin | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = safeReadJson(filePath);
  if (raw === null) return null;
  return shapeSkin(raw, filePath);
}

/**
 * Resolve the active skin from environment variables. Returns null when no
 * skin is configured, the configured file is missing, or the JSON shape is
 * unusable (so the Inspector renders the default Neotoma theme).
 */
export function resolveInspectorSkin(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedInspectorSkin | null {
  const explicitPath = (env.NEOTOMA_INSPECTOR_SKIN_CONFIG || "").trim();
  if (explicitPath) {
    const absolute = path.isAbsolute(explicitPath)
      ? explicitPath
      : path.resolve(process.cwd(), explicitPath);
    return loadSkinFromPath(absolute);
  }

  const presetName = (env.NEOTOMA_INSPECTOR_SKIN || "").trim();
  if (!presetName) return null;
  if (!SKIN_NAME_PATTERN.test(presetName)) return null;

  for (const dir of resolveBundledInspectorSkinsDir()) {
    const candidate = path.join(dir, `${presetName}.json`);
    const skin = loadSkinFromPath(candidate);
    if (skin) return skin;
  }
  return null;
}

/**
 * Serialize a skin into the script tag that the Inspector's frontend
 * sanitizer expects. `JSON.stringify` with no concatenation prevents
 * `</script>` injection (no token value passes through the
 * frontend sanitizer's HSL allowlist anyway, but defense in depth matters).
 */
export function buildInspectorSkinScript(skin: ResolvedInspectorSkin): string {
  const { source_path: _omit, ...payload } = skin;
  // Escape `<` so a value containing `</script>` cannot break out of the tag.
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<script>window.__NEOTOMA_INSPECTOR_SKIN__ = ${json};</script>`;
}

/**
 * Inject the resolved skin into the Inspector's index.html before `</head>`.
 * Returns the HTML unchanged when no skin is configured or `</head>` is
 * missing (mirrors `injectInspectorApiBaseMeta`).
 */
export function injectInspectorSkin(html: string, skin: ResolvedInspectorSkin | null): string {
  if (!skin) return html;
  const headIdx = html.indexOf("</head>");
  if (headIdx === -1) return html;
  const script = buildInspectorSkinScript(skin);
  return html.slice(0, headIdx) + script + "\n" + html.slice(headIdx);
}
