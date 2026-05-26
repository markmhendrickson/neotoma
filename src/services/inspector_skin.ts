import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type InspectorSkinTheme = Record<string, string>;

export interface InspectorSkinConfig {
  name: string;
  label?: string;
  brand?: {
    sidebar_title?: string;
    header_title?: string;
    home_aria_label?: string;
  };
  light?: InspectorSkinTheme;
  dark?: InspectorSkinTheme;
}

export interface InspectorSkinResolution {
  skin: InspectorSkinConfig | null;
  source: "none" | "config" | "builtin";
  label?: string;
  warning?: string;
}

const BUILTIN_SKIN_NAME_PATTERN = /^[a-z0-9_]+$/;

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

function parseInspectorSkinConfig(raw: string): InspectorSkinConfig {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("skin config must be a JSON object");
  }

  const skin = parsed as Partial<InspectorSkinConfig>;
  if (typeof skin.name !== "string" || !skin.name.trim()) {
    throw new Error("skin config requires a non-empty name");
  }

  return {
    ...skin,
    name: skin.name.trim(),
  } as InspectorSkinConfig;
}

function readSkinFile(filePath: string): InspectorSkinConfig {
  return parseInspectorSkinConfig(fs.readFileSync(filePath, "utf-8"));
}

function resolveCustomSkinPath(configPath: string): string {
  return path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath);
}

function resolveBuiltinSkinPath(name: string, staticDir?: string): string | null {
  if (!BUILTIN_SKIN_NAME_PATTERN.test(name)) return null;

  const candidates = [
    staticDir ? path.join(staticDir, "skins", `${name}.json`) : null,
    path.join(resolvePackageRoot(), "dist", "inspector", "skins", `${name}.json`),
    path.join(resolvePackageRoot(), "inspector", "dist", "skins", `${name}.json`),
    path.join(resolvePackageRoot(), "inspector", "public", "skins", `${name}.json`),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function resolveInspectorSkin(
  env: NodeJS.ProcessEnv = process.env,
  options: { staticDir?: string } = {}
): InspectorSkinResolution {
  const explicitPath = env.NEOTOMA_INSPECTOR_SKIN_CONFIG?.trim();
  if (explicitPath) {
    const resolvedPath = resolveCustomSkinPath(explicitPath);
    try {
      return {
        skin: readSkinFile(resolvedPath),
        source: "config",
        label: path.basename(resolvedPath),
      };
    } catch (err) {
      return {
        skin: null,
        source: "config",
        label: path.basename(resolvedPath),
        warning: `Could not read Inspector skin config ${path.basename(resolvedPath)}: ${
          (err as Error).message
        }`,
      };
    }
  }

  const builtinName = env.NEOTOMA_INSPECTOR_SKIN?.trim();
  if (!builtinName) {
    return { skin: null, source: "none" };
  }

  const builtinPath = resolveBuiltinSkinPath(builtinName, options.staticDir);
  if (!builtinPath) {
    return {
      skin: null,
      source: "builtin",
      label: builtinName,
      warning: `Inspector skin "${builtinName}" was not found.`,
    };
  }

  try {
    return {
      skin: readSkinFile(builtinPath),
      source: "builtin",
      label: builtinName,
    };
  } catch (err) {
    return {
      skin: null,
      source: "builtin",
      label: builtinName,
      warning: `Could not read Inspector skin "${builtinName}": ${(err as Error).message}`,
    };
  }
}

function escapeJsonForInlineScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function injectInspectorSkinConfig(html: string, skin: InspectorSkinConfig | null): string {
  if (!skin) return html;
  const headIdx = html.indexOf("</head>");
  if (headIdx === -1) return html;
  const script = `<script>window.__NEOTOMA_INSPECTOR_SKIN__=${escapeJsonForInlineScript(skin)};</script>`;
  return html.slice(0, headIdx) + script + "\n" + html.slice(headIdx);
}
