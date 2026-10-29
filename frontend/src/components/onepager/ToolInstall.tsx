import { useState } from "react";
import { staticAssetPath } from "@/site/spa_path";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { SiteSnippet } from "../SiteSnippet";
import { sendFunnelInstallPromptCopy } from "@/utils/analytics";
import type { PreflightHarness } from "@/utils/analytics";
import { PermissionsPreflight } from "@/components/PermissionsPreflight";
import {
  type Connection,
  CONNECTIONS,
  CONNECTIONS_SETUP,
  activationPrompt,
  connectionCommands,
  connectionVerification,
  connectionStepOneTitle,
  connectionStepTwoTitle,
  connectionGuidePath,
  connectionGuideUrl,
} from "./onepager_copy";
import { useLocale } from "@/i18n/LocaleContext";
import { spanishToolCopy } from "./spanish_tool_install_copy";

/** One selected host governs both steps; each copy action keeps its own feedback. */
export function ToolInstall({ showPermissionsPreflight = false, includeVerificationNote = false }: {
  showPermissionsPreflight?: boolean;
  includeVerificationNote?: boolean;
} = {}) {
  const { locale } = useLocale();
  const es = locale === "es";
  const [host, setHost] = useState<Connection | undefined>(CONNECTIONS_SETUP[0]);
  if (!host) return <p role="alert">{es ? "No hay conexiones compatibles disponibles. Lee la guía antes de cambiar la configuración." : "No supported connection is available. Read the installation guide before changing configuration."}</p>;
  const spanish = es ? spanishToolCopy(host) : null;
  const proseStep = host.kind === "sdk" || host.kind === "registry" ||
    (host.kind === "manual" && host.mode === "remote") || host.id === "opencode";
  const preflightHost: PreflightHarness | undefined =
    host.id === "claude-code" || host.id === "cursor" || host.id === "codex"
      ? host.id
      : undefined;
  return (
    <div className="plan-tool-install">
      <div className="plan-tool-choice">
        <label id="plan-host-label" htmlFor="plan-host">
          {es ? "Elige tu herramienta" : "Choose your tool"}
        </label>
        <Select
          value={host.id}
          onValueChange={(id) => {
            const choice = CONNECTIONS.find((row) => row.id === id);
            if (choice) setHost(choice);
          }}
        >
          <SelectTrigger
            id="plan-host"
            aria-labelledby="plan-host-label"
            className="plan-tool-trigger"
          >
            <SelectValue>{host.host}</SelectValue>
          </SelectTrigger>
          <SelectContent
            className="plan-tool-menu"
            position="popper"
            sideOffset={6}
            collisionPadding={16}
          >
            {CONNECTIONS.map((choice) => (
              <SelectItem key={choice.id} value={choice.id} className="plan-tool-option">
                {choice.host}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showPermissionsPreflight && <p className="plan-tool-prerequisite">{spanish ? `${spanish.mode} Consulta la guía de ${host.host} para comprobar los requisitos y límites de esta vía.` : `${host.prerequisites} ${host.caveat}`}</p>}
      {showPermissionsPreflight && <p className="plan-install-guide">
        <a href={staticAssetPath(es ? "/es/install/system-changes/" : "/install/system-changes/")}>{es ? "Revisa los cambios en el sistema antes de copiar un paso" : "Review what changes on your system before copying a step"}</a>
      </p>}
      {showPermissionsPreflight && preflightHost ? (
        <details className="plan-tool-preflight">
          <summary>{es ? "Permisos opcionales de comandos para" : "Optional command permissions for"} {host.host}</summary>
          <p>{es ? "Una denegación o un alcance desconocido exige revisar permisos, no ampliarlos automáticamente." : "A refusal or unknown scope is a reason to inspect permissions, not widen them automatically."}</p>
          <PermissionsPreflight harness={preflightHost} />
        </details>
      ) : null}
      <SiteSnippet
        title={spanish?.stepOne ?? connectionStepOneTitle(host)}
        text={spanish && proseStep ? `${spanish.mode} Lee ${connectionGuideUrl(host, "es")} para los pasos exactos de configuración de ${host.host}.` : connectionCommands(host, es ? "es" : "en")}
        prose={proseStep}
        copyInBody
        className="plan-install-snippet"
        copyFeedbackId={`onepager-install-${host.id}`}
        label={`${es ? "Instrucciones de conexión para" : "Connection instructions for"} ${host.host}`}
        successMessage={es ? (proseStep ? "Instrucciones copiadas" : "Comandos copiados") : (proseStep ? "Instructions copied" : "Commands copied")}
        onAfterCopy={proseStep ? undefined : () => sendFunnelInstallPromptCopy("manual_commands")}
      />
      <SiteSnippet
        title={spanish?.stepTwo ?? connectionStepTwoTitle(host)}
        text={spanish?.activation ?? activationPrompt(host)}
        prose
        copyInBody
        className="plan-install-snippet plan-install-prompt"
        copyFeedbackId={`onepager-activate-${host.id}`}
        successMessage={es ? "Prompt copiado" : "Prompt copied"}
      />
      {includeVerificationNote && !(spanish && spanish.activation.includes(spanish.verification)) ? (
        <p className="plan-selected-verification">{spanish?.verification ?? connectionVerification(host)}</p>
      ) : null}
      <p className="plan-install-guide">
        <a href={staticAssetPath(connectionGuidePath(host, es ? "es" : "en"))}>{es ? `Lee más sobre Neotoma con ${host.host}` : `Learn more about using Neotoma with ${host.host}`}</a>
      </p>
    </div>
  );
}
