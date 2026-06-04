export type InspectorSkinTheme = Partial<Record<InspectorSkinToken, string>>;

export type InspectorSkinConfig = {
  name: string;
  label?: string;
  brand?: {
    sidebar_title?: string;
    header_title?: string;
    home_aria_label?: string;
  };
  light?: InspectorSkinTheme;
  dark?: InspectorSkinTheme;
};

export type InspectorSkinToken =
  | "background"
  | "foreground"
  | "card"
  | "card-foreground"
  | "popover"
  | "popover-foreground"
  | "primary"
  | "primary-foreground"
  | "secondary"
  | "secondary-foreground"
  | "muted"
  | "muted-foreground"
  | "accent"
  | "accent-foreground"
  | "destructive"
  | "destructive-foreground"
  | "border"
  | "input"
  | "ring"
  | "sidebar"
  | "sidebar-foreground"
  | "sidebar-accent"
  | "sidebar-accent-foreground"
  | "sidebar-border";

declare global {
  interface Window {
    __NEOTOMA_INSPECTOR_SKIN__?: unknown;
  }
}

const STYLE_ELEMENT_ID = "neotoma-inspector-skin";
const TOKEN_NAMES = new Set<InspectorSkinToken>([
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "sidebar",
  "sidebar-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
]);

// HSL token shape used by shadcn/Tailwind CSS variables:
//   "<hue> <saturation>% <lightness>%"  (optionally with " / <alpha>")
// Refuses anything containing colons, semicolons, braces, or other CSS
// punctuation that would let a malicious skin escape the var() context.
const HSL_TOKEN_PATTERN = /^-?\d+(?:\.\d+)?(?:deg)?\s+-?\d+(?:\.\d+)?%\s+-?\d+(?:\.\d+)?%(?:\s*\/\s*(?:0|1|0?\.\d+|\d+(?:\.\d+)?%))?$/;

function is_record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitize_label(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : undefined;
}

function sanitize_theme(value: unknown): InspectorSkinTheme | undefined {
  if (!is_record(value)) return undefined;
  const theme: InspectorSkinTheme = {};
  for (const [token, tokenValue] of Object.entries(value)) {
    if (!TOKEN_NAMES.has(token as InspectorSkinToken)) continue;
    if (typeof tokenValue !== "string") continue;
    const trimmed = tokenValue.trim();
    if (!HSL_TOKEN_PATTERN.test(trimmed)) continue;
    theme[token as InspectorSkinToken] = trimmed;
  }
  return Object.keys(theme).length > 0 ? theme : undefined;
}

export function sanitize_inspector_skin_config(value: unknown): InspectorSkinConfig | null {
  if (!is_record(value)) return null;
  const name = sanitize_label(value.name);
  if (!name) return null;
  const brand_value = is_record(value.brand) ? value.brand : undefined;
  const brand = brand_value
    ? {
        sidebar_title: sanitize_label(brand_value.sidebar_title),
        header_title: sanitize_label(brand_value.header_title),
        home_aria_label: sanitize_label(brand_value.home_aria_label),
      }
    : undefined;

  return {
    name,
    label: sanitize_label(value.label),
    brand,
    light: sanitize_theme(value.light),
    dark: sanitize_theme(value.dark),
  };
}

function theme_to_css(selector: string, theme: InspectorSkinTheme | undefined): string {
  if (!theme) return "";
  const declarations = Object.entries(theme)
    .map(([token, value]) => `  --${token}: ${value};`)
    .join("\n");
  return declarations ? `${selector} {\n${declarations}\n}` : "";
}

export function build_inspector_skin_css(skin: InspectorSkinConfig): string {
  return [theme_to_css(":root", skin.light), theme_to_css(".dark", skin.dark)]
    .filter(Boolean)
    .join("\n\n");
}

export function get_runtime_inspector_skin(): InspectorSkinConfig | null {
  if (typeof window === "undefined") return null;
  return sanitize_inspector_skin_config(window.__NEOTOMA_INSPECTOR_SKIN__);
}

/**
 * Apply the active skin to the document, if any. Safe to call before React
 * mounts: writes a `<style>` tag and sets `data-inspector-skin` on `<html>`
 * so first paint matches the configured palette.
 *
 * Also overrides `document.title` from `brand.header_title` when set so the
 * tab name matches the embedder's brand without rebuilding the HTML shell.
 */
export function initialize_inspector_skin_on_load() {
  if (typeof document === "undefined") return;
  const skin = get_runtime_inspector_skin();
  if (!skin) return;

  document.documentElement.dataset.inspectorSkin = skin.name;

  if (skin.brand?.header_title) {
    document.title = skin.brand.header_title;
  }

  const css = build_inspector_skin_css(skin);
  if (!css) return;

  const existing = document.getElementById(STYLE_ELEMENT_ID);
  const style = existing ?? document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = css;
  if (!existing) {
    document.head.appendChild(style);
  }
}
