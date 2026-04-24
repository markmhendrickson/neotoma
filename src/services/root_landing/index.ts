/**
 * MCP root landing page.
 *
 * Replaces Express's default 404 at `GET /` with a content-negotiated, mode-
 * aware landing surface:
 *
 * - HTML for browsers: identity card, harness connect snippets pre-filled with
 *   the resolved host URL, and a mirrored `DOC_NAV_CATEGORIES` index linking
 *   every relevant page on the marketing site.
 * - JSON for agents / curl: same content in a structured shape.
 *
 * The rendering is fully deterministic from `buildLandingContext(req)` output;
 * all env reads happen in `resolveLandingMode` and `buildLandingContext`.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type express from "express";
import { config } from "../../config.js";
import { isSandboxMode } from "../sandbox_mode.js";
import {
  buildAllHarnessSnippets,
  type HarnessSnippetContext,
  type HarnessSnippetResult,
  type LandingMode,
} from "./harness_snippets.js";
import { ROOT_LANDING_SITE_NAV, resolveNavHref, type RootLandingNavCategory } from "./site_nav.js";
import { renderLandingHtml } from "./html_template.js";
import { renderLandingMarkdown } from "./md_template.js";

const CURRENT_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));

export type { LandingMode } from "./harness_snippets.js";

const VALID_MODES: ReadonlySet<LandingMode> = new Set(["sandbox", "personal", "prod", "local"]);

export interface RootLandingContext {
  mode: LandingMode;
  base: string;
  mcpUrl: string;
  version: string;
  gitSha: string | null;
  inspectorUrl: string | null;
  publicDocsUrl: string;
  /** Resolved stdio launcher path for local mode; null when unknown. */
  stdioMcpScriptPath: string | null;
  harnesses: HarnessSnippetResult[];
  index: RootLandingNavCategory[];
  endpoints: Record<string, string>;
}

function resolveStdioMcpScriptPath(): string | null {
  try {
    const script = path.join(config.projectRoot, "scripts", "run_neotoma_mcp_stdio.sh");
    return existsSync(script) ? script : null;
  } catch {
    return null;
  }
}

/**
 * True when the request arrived over a loopback socket. Mirrors
 * `src/actions.ts::isLocalRequest`, duplicated here so this module has no
 * upward dependency on that file. SECURITY: uses `req.socket.remoteAddress`,
 * never `req.headers.host` or `req.ip`.
 */
function isLoopbackRequest(req: express.Request): boolean {
  const remote = (req.socket?.remoteAddress || "").toLowerCase();
  if (!remote) return false;
  if (remote === "127.0.0.1" || remote === "::1") return true;
  if (remote.startsWith("127.")) return true;
  if (remote.startsWith("::ffff:127.")) return true;
  return false;
}

function readEnvMode(env: NodeJS.ProcessEnv = process.env): LandingMode | null {
  const raw = (env.NEOTOMA_ROOT_LANDING_MODE || "").trim().toLowerCase();
  if (!raw) return null;
  return VALID_MODES.has(raw as LandingMode) ? (raw as LandingMode) : null;
}

/**
 * Resolve the landing mode for a given request. Precedence:
 *
 *   1. Explicit `NEOTOMA_ROOT_LANDING_MODE` env.
 *   2. `isSandboxMode()` → `sandbox`.
 *   3. Loopback request → `local`.
 *   4. Default → `personal`.
 */
export function resolveLandingMode(
  req: express.Request,
  env: NodeJS.ProcessEnv = process.env,
): LandingMode {
  const explicit = readEnvMode(env);
  if (explicit) return explicit;
  if (isSandboxMode(env)) return "sandbox";
  if (isLoopbackRequest(req)) return "local";
  return "personal";
}

function resolveBaseUrl(req: express.Request): string {
  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.header("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.header("host") || "localhost";
  const proto = forwardedProto || req.protocol || "http";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function readPackageVersion(): string {
  try {
    const candidates = [
      path.resolve(process.cwd(), "package.json"),
      path.resolve(CURRENT_FILE_DIR, "../../../package.json"),
      path.resolve(CURRENT_FILE_DIR, "../../../../package.json"),
    ];
    for (const pkgPath of candidates) {
      try {
        const parsed = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
        if (typeof parsed.version === "string" && parsed.version) return parsed.version;
      } catch {
        // try next candidate
      }
    }
  } catch {
    // fall through
  }
  return "0.0.0";
}

function readGitSha(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates = [
    env.NEOTOMA_GIT_SHA,
    env.GIT_SHA,
    env.SOURCE_COMMIT,
    env.FLY_MACHINE_VERSION,
  ];
  for (const value of candidates) {
    if (value && value.trim().length) return value.trim();
  }
  return null;
}

function defaultPublicDocsUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.NEOTOMA_PUBLIC_DOCS_URL || "https://neotoma.io").trim().replace(/\/+$/, "");
}

function buildEndpointsMap(mode: LandingMode): Record<string, string> {
  const base: Record<string, string> = {
    mcp: "/mcp",
    server_info: "/server-info",
    health: "/health",
    server_card: "/.well-known/mcp/server-card.json",
    oauth_authorization_server: "/.well-known/oauth-authorization-server",
    oauth_protected_resource: "/.well-known/oauth-protected-resource",
  };
  if (mode === "sandbox") {
    base.sandbox_terms = "/sandbox/terms";
    base.sandbox_report = "/sandbox/report";
  }
  return base;
}

function resolveInspectorUrl(
  base: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const staticDir = (env.NEOTOMA_INSPECTOR_STATIC_DIR || "").trim();
  if (!staticDir) return null;
  const inspectorBase =
    (env.NEOTOMA_INSPECTOR_BASE_PATH || "/app").trim() || "/app";
  const normalized = inspectorBase.startsWith("/") ? inspectorBase : `/${inspectorBase}`;
  return `${base}${normalized}`;
}

export function buildLandingContext(
  req: express.Request,
  env: NodeJS.ProcessEnv = process.env,
): RootLandingContext {
  const mode = resolveLandingMode(req, env);
  const base = resolveBaseUrl(req);
  const mcpUrl = `${base}/mcp`;
  const version = readPackageVersion();
  const gitSha = readGitSha(env);
  const publicDocsUrl = defaultPublicDocsUrl(env);
  const inspectorUrl = resolveInspectorUrl(base, env);
  const stdioMcpScriptPath = resolveStdioMcpScriptPath();

  const snippetCtx: HarnessSnippetContext = {
    mcpUrl,
    base,
    mode,
    publicDocsUrl,
    stdioMcpScriptPath,
  };

  return {
    mode,
    base,
    mcpUrl,
    version,
    gitSha,
    inspectorUrl,
    publicDocsUrl,
    stdioMcpScriptPath,
    harnesses: buildAllHarnessSnippets(snippetCtx),
    index: ROOT_LANDING_SITE_NAV,
    endpoints: buildEndpointsMap(mode),
  };
}

export function buildRootLandingHtml(ctx: RootLandingContext): string {
  return renderLandingHtml(ctx);
}

export function buildRootLandingMarkdown(ctx: RootLandingContext): string {
  return renderLandingMarkdown(ctx);
}

export function buildRootLandingJson(ctx: RootLandingContext): Record<string, unknown> {
  return {
    name: "Neotoma MCP",
    version: ctx.version,
    git_sha: ctx.gitSha,
    mode: ctx.mode,
    base_url: ctx.base,
    mcp_url: ctx.mcpUrl,
    inspector_url: ctx.inspectorUrl,
    public_docs_url: ctx.publicDocsUrl,
    stdio_mcp_script_path: ctx.stdioMcpScriptPath,
    endpoints: ctx.endpoints,
    harnesses: ctx.harnesses.map((h) => ({
      id: h.id,
      label: h.label,
      description: h.description,
      docs_url: h.docsUrl,
      agent_prompt: h.agentPrompt,
      human_config: h.human,
      preflight: h.preflight ?? null,
    })),
    index: ctx.index.map((cat) => ({
      category: cat.title,
      items: cat.items.map((item) => ({
        label: item.label,
        href: resolveNavHref(item.href, ctx.publicDocsUrl),
      })),
    })),
  };
}

export function buildRobotsTxt(mode: LandingMode, publicDocsUrl: string): string {
  const lines: string[] = [];
  lines.push("User-agent: *");
  if (mode === "sandbox" || mode === "local") {
    lines.push("Disallow: /");
  } else {
    lines.push("Allow: /");
    lines.push("Disallow: /mcp");
    lines.push("Disallow: /sandbox/");
  }
  if (publicDocsUrl) {
    lines.push("");
    lines.push(`Sitemap: ${publicDocsUrl.replace(/\/+$/, "")}/sitemap.xml`);
  }
  return lines.join("\n") + "\n";
}

/**
 * True when the `Accept` header indicates the caller wants HTML. Defaults to
 * false (JSON) so tools like `curl` without an explicit `Accept` get the
 * structured payload.
 */
export function wantsHtml(acceptHeader: string | undefined): boolean {
  if (!acceptHeader) return false;
  const value = acceptHeader.toLowerCase();
  // `text/html` anywhere takes priority; `*/*` without html stays JSON.
  if (value.includes("text/html")) return true;
  if (value.includes("application/xhtml+xml")) return true;
  return false;
}

/**
 * True when `Accept` asks for Markdown and not HTML (HTML wins when both are
 * present; callers should check {@link wantsHtml} first).
 */
export function wantsMarkdown(acceptHeader: string | undefined): boolean {
  if (!acceptHeader) return false;
  if (wantsHtml(acceptHeader)) return false;
  const value = acceptHeader.toLowerCase();
  if (value.includes("text/markdown")) return true;
  if (value.includes("text/x-markdown")) return true;
  return false;
}
