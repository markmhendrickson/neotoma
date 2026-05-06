/**
 * Markdown representation of the MCP root landing page (same sections as
 * {@link renderLandingHtml} but for `Accept: text/markdown` / `text/x-markdown`).
 */

import type { HarnessSnippetResult } from "./harness_snippets.js";
import type { RootLandingNavCategory } from "./site_nav.js";
import { resolveNavHref } from "./site_nav.js";
import { modeCopy, type LandingHtmlContext } from "./html_template.js";

function mdFence(lang: string, body: string): string {
  let ticks = 3;
  const tickStr = () => "`".repeat(ticks);
  while (body.includes(tickStr())) {
    ticks += 1;
  }
  const open = tickStr();
  return `${open}${lang}\n${body.replace(/\n?$/, "\n")}${tickStr()}`;
}

function mdLink(label: string, href: string): string {
  const esc = label.replace(/\\/g, "\\\\").replace(/\]/g, "\\]").replace(/\[/g, "\\[");
  return `[${esc}](${href})`;
}

function renderHarnessMd(h: HarnessSnippetResult): string {
  const lines: string[] = [];
  lines.push(`### ${h.label}`);
  lines.push("");
  lines.push(`*${h.description}*`);
  lines.push("");
  lines.push("#### Agent-driven");
  lines.push("");
  lines.push(`Paste this prompt into ${h.label} and let it configure the connection.`);
  lines.push("");
  lines.push(mdFence("text", h.agentPrompt));
  lines.push("");
  lines.push("#### Human-driven");
  lines.push("");
  lines.push(`Format: \`${h.human.format}\``);
  lines.push("");
  if (h.preflight) {
    lines.push(`**${h.preflight.title}** (format: \`${h.preflight.format}\`)`);
    lines.push("");
    lines.push(mdFence(h.preflight.format, h.preflight.code));
    lines.push("");
  }
  lines.push(mdFence(h.human.format, h.human.code));
  lines.push("");
  lines.push(`Per-harness documentation: ${mdLink(h.docsUrl, h.docsUrl)}`);
  lines.push("");
  return lines.join("\n");
}

function renderIndexMd(cats: RootLandingNavCategory[], publicDocsUrl: string): string {
  const blocks: string[] = [];
  for (const cat of cats) {
    const lines: string[] = [];
    lines.push(`### ${cat.title}`);
    lines.push("");
    for (const item of cat.items) {
      const href = resolveNavHref(item.href, publicDocsUrl);
      lines.push(`- ${mdLink(item.label, href)}`);
    }
    lines.push("");
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n");
}

export function renderLandingMarkdown(ctx: LandingHtmlContext): string {
  const copy = modeCopy(ctx.mode);
  const parts: string[] = [];

  parts.push(`# ${copy.title}`);
  parts.push("");
  parts.push(copy.subtitle);
  parts.push("");
  if (copy.banner) {
    parts.push(`> **Note:** ${copy.banner}`);
    parts.push("");
  }
  parts.push(
    `**mode:** \`${ctx.mode}\` · **config:** \`${ctx.configEnvironment}\` · **version:** \`${ctx.version}\`${ctx.gitSha ? ` · **git:** \`${ctx.gitSha.slice(0, 7)}\`` : ""}`,
  );
  parts.push("");

  parts.push("## This instance");
  parts.push("");
  parts.push(`- **MCP endpoint:** ${mdLink(ctx.mcpUrl, ctx.mcpUrl)}`);
  for (const [label, p] of Object.entries(ctx.endpoints)) {
    const href = `${ctx.base}${p}`;
    parts.push(`- **${label.replace(/_/g, " ")}:** ${mdLink(p, href)}`);
  }
  parts.push("");
  if (ctx.inspectorUrl) {
    parts.push(`- **Inspector UI:** ${mdLink(ctx.inspectorUrl, ctx.inspectorUrl)}`);
    parts.push("");
  }
  if (ctx.mode === "sandbox") {
    parts.push(
      `- **Sandbox terms:** ${mdLink(`${ctx.base}/sandbox/terms`, `${ctx.base}/sandbox/terms`)} (acceptable-use JSON)`,
    );
    parts.push(`- **Abuse / PII reports:** \`POST ${ctx.base}/sandbox/report\``);
    parts.push("");

    parts.push("## Start a sandbox session");
    parts.push("");
    parts.push("Each session creates an ephemeral user with seed data. Data is deleted when the session expires or is ended.");
    parts.push("");
    parts.push("```shell");
    parts.push(`# Start with the generic pack`);
    parts.push(`curl -s -X POST ${ctx.base}/sandbox/session/new \\`);
    parts.push(`  -H 'Content-Type: application/json' \\`);
    parts.push(`  -d '{"pack_id":"generic"}'`);
    parts.push("```");
    parts.push("");
    parts.push("```shell");
    parts.push(`# Start with a use-case pack (e.g. crm)`);
    parts.push(`curl -s -X POST ${ctx.base}/sandbox/session/new \\`);
    parts.push(`  -H 'Content-Type: application/json' \\`);
    parts.push(`  -d '{"pack_id":"crm"}'`);
    parts.push("```");
    parts.push("");
    parts.push("The response includes `one_time_code` (for browser handoff) and cookie credentials for API access.");
    parts.push("");
  }

  const harnessLede =
    ctx.mode === "local"
      ? "Config snippets use stdio; connect Neotoma as a local process."
      : `Config snippets below use this host's MCP URL (\`${ctx.mcpUrl}\`) so you can paste them directly into your harness.`;

  const connectHarnessCliNote =
    "With the Neotoma CLI installed: `neotoma setup` wires MCP entries and agent instruction files; use `neotoma mcp config` or `neotoma cli config` to update one layer only. For read-only help, run `neotoma mcp guide` or `neotoma cli guide`.";

  parts.push("## Connect your harness");
  parts.push("");
  parts.push(harnessLede);
  parts.push("");
  parts.push(connectHarnessCliNote);
  parts.push("");
  for (const h of ctx.harnesses) {
    parts.push(renderHarnessMd(h));
  }

  parts.push("## Learn");
  parts.push("");
  parts.push(`All links resolve to \`${ctx.publicDocsUrl}\` unless external.`);
  parts.push("");
  parts.push(renderIndexMd(ctx.index, ctx.publicDocsUrl));

  parts.push("---");
  parts.push("");
  parts.push(
    `Served by Neotoma ${ctx.version}${ctx.gitSha ? ` · \`${ctx.gitSha.slice(0, 7)}\`` : ""} — mode \`${ctx.mode}\` · config \`${ctx.configEnvironment}\`.`,
  );
  parts.push("");
  parts.push(
    "**Programmatic clients:** send `Accept: application/json` for structured JSON, or `Accept: text/markdown` for this Markdown document. Default (no `Accept` / generic `*/*`) is JSON.",
  );
  parts.push("");

  return parts.join("\n");
}
