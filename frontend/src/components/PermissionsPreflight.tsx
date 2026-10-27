/**
 * PermissionsPreflight — tabbed allowlist snippets for agent harnesses.
 *
 * Goal: let the user paste one snippet before running the install prompt so
 * the agent only needs two approvals during the full onboarding flow
 * (`neotoma *` wildcard and `npm install -g neotoma`).
 */

import React, { useState } from "react";

import { SiteSnippet } from "./SiteSnippet";
import { SITE_CODE_SNIPPETS } from "../site/site_data";
import { sendFunnelPreflightCopy, type PreflightHarness } from "../utils/analytics";
import { useLocale } from "@/i18n/LocaleContext";

interface HarnessTab {
  id: PreflightHarness;
  label: string;
  description: string;
  filePath: string;
  filePathEs?: string;
  snippet: string;
  snippetCommentsEs: string;
}

const TABS: HarnessTab[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    description: "JSON merge into Claude Code's permissions file.",
    filePath: ".claude/settings.local.json (project) — or ~/.claude/settings.json (user)",
    filePathEs: ".claude/settings.local.json (proyecto) — o ~/.claude/settings.json (usuario)",
    snippet: SITE_CODE_SNIPPETS.preflightClaudeCode,
    snippetCommentsEs: "// Pega esto en .claude/settings.local.json (proyecto) o ~/.claude/settings.json (usuario).\n// Combínalo con la lista existente de \"permissions.allow\", si la hay.",
  },
  {
    id: "cursor",
    label: "Cursor",
    description: "JSON merge into Cursor's project allowlist.",
    filePath: ".cursor/allowlist.json",
    snippet: SITE_CODE_SNIPPETS.preflightCursor,
    snippetCommentsEs: "// Pega esto en .cursor/allowlist.json (proyecto).\n// Cursor aprobará automáticamente cualquier comando `neotoma ...` y la instalación global inicial.",
  },
  {
    id: "codex",
    label: "Codex",
    description: "TOML block appended to Codex's user config.",
    filePath: "~/.codex/config.toml",
    snippet: SITE_CODE_SNIPPETS.preflightCodex,
    snippetCommentsEs: "# Añade esto a ~/.codex/config.toml (configuración del usuario).\n# Codex aprobará automáticamente los comandos que coincidan con cada patrón.",
  },
];

function localizedSnippet(tab: HarnessTab, spanish: boolean): string {
  if (!spanish) return tab.snippet;
  // Keep the executable JSON/TOML bytes in the existing shared snippet; only its leading comments differ.
  return `${tab.snippetCommentsEs}\n${tab.snippet.replace(/^(?:(?:\/\/|#)[^\n]*\n)+/, "")}`;
}

export function PermissionsPreflight({ harness }: { harness?: PreflightHarness } = {}): React.ReactElement {
  const { locale } = useLocale();
  const es = locale === "es";
  const [selectedId, setSelectedId] = useState<PreflightHarness>("claude-code");
  const activeId = harness ?? selectedId;
  const active = TABS.find((t) => t.id === activeId) ?? TABS[0]!;
  return (
    <section
      id="permissions-preflight"
      aria-labelledby="permissions-preflight-heading"
      className="mb-6 rounded-lg border border-border bg-card/50 p-4"
    >
      <header className="mb-3 flex flex-col gap-1">
        <h2
          id="permissions-preflight-heading"
          className="text-body font-semibold tracking-[-0.01em]"
        >
          {harness ? (es ? `Permisos opcionales de comandos para ${active.label}` : `Optional ${active.label} command permissions`) : (es ? "Comprobación previa de permisos" : "Permissions pre-flight")}
        </h2>
        <p className="text-ui leading-5 text-muted-foreground">
          {es ? <>Este fragmento opcional escribe en el archivo indicado. Las autorizaciones amplias, como <code className="rounded bg-muted px-1 py-0.5">Bash(neotoma:*)</code> en Claude Code y <code className="rounded bg-muted px-1 py-0.5">neotoma *</code> en Cursor o Codex, pueden permitir cualquier subcomando de Neotoma, incluido reset, sin otra solicitud del entorno. Revisa el alcance completo antes de copiar. Si se deniega un permiso o desconoces su alcance, inspecciona la configuración del entorno en vez de ampliarlo automáticamente.</> : <>This optional snippet writes to the target file below. Broad Neotoma command approvals,
          including Claude Code&apos;s <code className="rounded bg-muted px-1 py-0.5">Bash(neotoma:*)</code> and
          Cursor or Codex <code className="rounded bg-muted px-1 py-0.5">neotoma *</code>, can permit
          any Neotoma subcommand, including reset, without another host prompt. Review their full
          scope before copying. If permission is refused or its scope is unknown, inspect the host
          setting instead of widening access automatically.</>}
        </p>
        {!harness && <p className="text-fine leading-5 text-muted-foreground">
          {es ? "¿Usas " : "Using "}<strong>OpenClaw</strong>{es ? "? Omite este paso: el complemento nativo gestiona el consentimiento. Ejecuta " : "? Skip this — the native plugin handles consent. Just run "}{" "}
          <code className="rounded bg-muted px-1 py-0.5">
            openclaw plugins install clawhub:neotoma
          </code>{" "}
          {es ? "y aprueba la solicitud de permisos del complemento una sola vez." : "and approve the plugin permission prompt once."}
        </p>}
      </header>
      {!harness && <div
        role="tablist"
        aria-label={es ? "Entorno de agente" : "Agent harness"}
        className="mb-3 flex flex-wrap gap-1 border-b border-border pb-2"
      >
        {TABS.map((tab) => {
          const selected = tab.id === activeId;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={selected}
              aria-controls={`preflight-panel-${tab.id}`}
              id={`preflight-tab-${tab.id}`}
              type="button"
              onClick={() => setSelectedId(tab.id)}
              className={`rounded-md px-3 py-1.5 text-ui transition-colors ${
                selected
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>}
      <div
        id={`preflight-panel-${active.id}`}
        role={harness ? "region" : "tabpanel"}
        aria-labelledby={harness ? "permissions-preflight-heading" : `preflight-tab-${active.id}`}
      >
        <SiteSnippet
          text={localizedSnippet(active, es)}
          title={`${active.label} ${es ? "permisos" : "permissions"}`}
          subtitle={es ? `Fragmento de configuración para ${active.label}. Archivo de destino: ${active.filePathEs ?? active.filePath}` : `${active.description} Target: ${active.filePath}`}
          copyFeedbackId={`preflight-${activeId}`}
          label={es ? "Fragmento de permisos previo" : "Permissions pre-flight snippet"}
          onAfterCopy={() => sendFunnelPreflightCopy(active.id)}
        />
      </div>
    </section>
  );
}

export default PermissionsPreflight;
