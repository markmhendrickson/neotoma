/**
 * CLI command implementations for `neotoma mirror`.
 *
 * Delegates to `src/services/canonical_mirror.ts` for filesystem writes and
 * `src/services/canonical_markdown.ts` for rendering. This module only handles
 * command parsing, user interaction, and formatted output.
 */

import path from "node:path";
import {
  ALL_MIRROR_KINDS,
  getMirrorConfig,
  getMirrorStatus,
  MirrorKind,
  rebuildMirror,
  setMirrorConfig,
} from "../../services/canonical_mirror.js";
import { initMirrorRepo } from "../../services/canonical_mirror_git.js";

export interface MirrorRebuildOptions {
  kind?: string;
  entityType?: string;
  entityId?: string;
  clean?: boolean;
}

export interface MirrorEnableOptions {
  path?: string;
  kinds?: string;
  git?: boolean;
  noGit?: boolean;
}

function parseKind(raw: string | undefined): MirrorKind | "all" | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "all") return "all";
  if ((ALL_MIRROR_KINDS as readonly string[]).includes(v)) return v as MirrorKind;
  throw new Error(
    `Invalid --kind: ${raw}. Allowed: all, ${ALL_MIRROR_KINDS.join(", ")}`
  );
}

function parseKinds(raw: string | undefined): MirrorKind[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  const invalid = parts.filter(
    (p) => !(ALL_MIRROR_KINDS as readonly string[]).includes(p)
  );
  if (invalid.length > 0) {
    throw new Error(
      `Invalid --kinds values: ${invalid.join(", ")}. Allowed: ${ALL_MIRROR_KINDS.join(", ")}`
    );
  }
  return parts as MirrorKind[];
}

export interface MirrorRebuildResult {
  config: {
    enabled: boolean;
    path: string;
    kinds: MirrorKind[];
    git_enabled: boolean;
  };
  report: Awaited<ReturnType<typeof rebuildMirror>>;
}

export async function runMirrorRebuild(
  options: MirrorRebuildOptions
): Promise<MirrorRebuildResult> {
  const kind = parseKind(options.kind);
  const cfg = getMirrorConfig();
  const report = await rebuildMirror({
    kind,
    entityType: options.entityType,
    entityId: options.entityId,
    clean: Boolean(options.clean),
  });
  return {
    config: {
      enabled: cfg.enabled,
      path: cfg.path,
      kinds: cfg.kinds,
      git_enabled: cfg.git_enabled,
    },
    report,
  };
}

export interface MirrorStatusResult {
  enabled: boolean;
  path: string;
  absolute_path: string;
  kinds: MirrorKind[];
  git_enabled: boolean;
  counts: Record<MirrorKind, number>;
}

export async function runMirrorStatus(): Promise<MirrorStatusResult> {
  const status = await getMirrorStatus();
  return {
    enabled: status.enabled,
    path: status.path,
    absolute_path: path.resolve(status.path),
    kinds: status.kinds,
    git_enabled: status.git_enabled,
    counts: status.counts,
  };
}

export interface MirrorConfigResult {
  enabled: boolean;
  path: string;
  absolute_path: string;
  kinds: MirrorKind[];
  git_enabled: boolean;
}

export async function runMirrorEnable(
  options: MirrorEnableOptions
): Promise<MirrorConfigResult> {
  const patch: Parameters<typeof setMirrorConfig>[0] = { enabled: true };
  if (typeof options.path === "string" && options.path.length > 0) {
    patch.path = options.path;
  }
  const kinds = parseKinds(options.kinds);
  if (kinds) patch.kinds = kinds;
  if (options.git === true) patch.git_enabled = true;
  if (options.noGit === true) patch.git_enabled = false;
  const cfg = setMirrorConfig(patch);

  // Phase 3: opt-in git. Initialize the repo idempotently so the user can
  // enable git once and let subsequent rebuilds create the initial commit.
  if (cfg.git_enabled) {
    try {
      await initMirrorRepo(cfg);
    } catch {
      // Git is optional; enabling mirror must succeed even if git init fails.
    }
  }

  return {
    enabled: cfg.enabled,
    path: cfg.path,
    absolute_path: path.resolve(cfg.path),
    kinds: cfg.kinds,
    git_enabled: cfg.git_enabled,
  };
}

export async function runMirrorDisable(): Promise<MirrorConfigResult> {
  const cfg = setMirrorConfig({ enabled: false });
  return {
    enabled: cfg.enabled,
    path: cfg.path,
    absolute_path: path.resolve(cfg.path),
    kinds: cfg.kinds,
    git_enabled: cfg.git_enabled,
  };
}

export function formatMirrorStatus(status: MirrorStatusResult): string {
  const lines: string[] = [];
  lines.push(`Mirror:     ${status.enabled ? "enabled" : "disabled"}`);
  lines.push(`Path:       ${status.absolute_path}`);
  lines.push(`Kinds:      ${status.kinds.join(", ")}`);
  lines.push(`Git:        ${status.git_enabled ? "enabled" : "disabled"}`);
  lines.push("");
  lines.push("Counts:");
  for (const kind of ALL_MIRROR_KINDS) {
    const included = status.kinds.includes(kind) ? "" : " (disabled)";
    lines.push(`  ${kind.padEnd(14)} ${status.counts[kind]}${included}`);
  }
  return lines.join("\n");
}

export function formatRebuildReport(result: MirrorRebuildResult): string {
  const lines: string[] = [];
  if (!result.config.enabled) {
    lines.push(
      "Mirror is disabled. Run `neotoma mirror enable` first, or pass explicit options."
    );
    lines.push("");
  }
  lines.push(`Path:   ${path.resolve(result.config.path)}`);
  lines.push(`Kinds:  ${result.report.kinds.join(", ") || "(none)"}`);
  lines.push("");
  lines.push(
    "Kind            Written  Unchanged  Removed"
  );
  for (const kind of ALL_MIRROR_KINDS) {
    const c = result.report.counts[kind];
    if (!c) continue;
    if (c.written === 0 && c.unchanged === 0 && c.removed === 0) continue;
    lines.push(
      `  ${kind.padEnd(12)}  ${String(c.written).padStart(7)}  ${String(c.unchanged).padStart(9)}  ${String(c.removed).padStart(7)}`
    );
  }
  return lines.join("\n");
}

export function formatMirrorConfig(cfg: MirrorConfigResult): string {
  const lines: string[] = [];
  lines.push(`Mirror:   ${cfg.enabled ? "enabled" : "disabled"}`);
  lines.push(`Path:     ${cfg.absolute_path}`);
  lines.push(`Kinds:    ${cfg.kinds.join(", ")}`);
  lines.push(`Git:      ${cfg.git_enabled ? "enabled" : "disabled"}`);
  return lines.join("\n");
}
