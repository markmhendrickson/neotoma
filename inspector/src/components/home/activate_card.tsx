import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyableCodeBlock } from "@/components/ui/copyable_code_block";
import type { ServerMode } from "@/types/api";

interface ActivateCardProps {
  mode: ServerMode | undefined;
}

interface ActivateContent {
  title: string;
  blurb: string;
  prompt: string;
}

/**
 * Always-visible card that hands the user a paste-into-an-agent prompt for
 * wiring Neotoma into the harness of their choice (Cursor, Claude Code, Codex,
 * Claude Desktop, Windsurf, OpenClaw, …). The prompt asks the agent to
 * auto-detect its harness via `neotoma status --json` (which install.md
 * documents) and then run `neotoma setup --tool <current_tool> --yes`.
 *
 * Copy adapts to server mode:
 *   - `local` / `production`  — "Add Neotoma to another agent"
 *   - `hosted_sandbox`        — "Install Neotoma locally"
 *   - `local_sandbox`         — "Wire your harness to this dev API"
 *   - other / undefined       — fall through to the install framing
 *
 * The copy chrome is the shared `CopyableCodeBlock` primitive; do not
 * re-implement copy-block markup inline here or anywhere else in Inspector.
 */
export function ActivateCard({ mode }: ActivateCardProps) {
  const content = activateContent(mode);
  return (
    <Card data-testid="activate-card">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">{content.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{content.blurb}</p>
      </CardHeader>
      <CardContent className="text-sm">
        <CopyableCodeBlock
          code={content.prompt}
          variant="prompt"
          copyAriaLabel="Copy prompt to clipboard"
          footer={
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <a
                href="https://neotoma.io/install.md"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
              >
                Why this works — install.md
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
              <a
                href="https://neotoma.io/skills"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
              >
                Skills catalog
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          }
        />
      </CardContent>
    </Card>
  );
}

function activateContent(mode: ServerMode | undefined): ActivateContent {
  const installPrompt = [
    "Install and configure Neotoma in this harness.",
    "",
    "1. Run `neotoma status --json` to detect my current tool and check install state.",
    "2. If Neotoma is not installed, run `npm install -g neotoma`.",
    "3. Run `neotoma setup --tool <current_tool> --yes` to wire MCP and CLI instructions.",
    "4. Confirm success by grepping stdout for the `Neotoma installed at` line.",
    "",
    "Read https://neotoma.io/install.md for the full canonical sequence and the list of",
    "supported harnesses (Cursor, Claude Code, Codex, Claude Desktop, Windsurf, OpenClaw).",
    "Do not improvise shell introspection (`grep`, `ls`, `cat`, `find`); use `neotoma status --json`.",
  ].join("\n");

  const addToAnotherAgentPrompt = [
    "Add Neotoma to this agent.",
    "",
    "1. Run `neotoma status --json` to identify my current tool and confirm Neotoma is installed.",
    "2. Run `neotoma setup --tool <current_tool> --yes` to wire MCP and CLI instructions for this harness.",
    "3. Confirm success by grepping stdout for the `Neotoma installed at` line.",
    "",
    "Neotoma is already installed on this machine — this configures the agent you're talking to",
    "right now to use it. https://neotoma.io/install.md documents the canonical sequence.",
  ].join("\n");

  const wireDevPrompt = [
    "Wire this agent to the local Neotoma dev server.",
    "",
    "1. Run `neotoma status --json` to identify my current tool and the running dev API port.",
    "2. Run `neotoma setup --tool <current_tool> --yes --mcp-transport c` to register the source-checkout stdio MCP.",
    "3. Confirm success by grepping stdout for the `Neotoma installed at` line.",
    "",
    "This is a developer dev environment (source checkout). See https://neotoma.io/install.md.",
  ].join("\n");

  switch (mode) {
    case "local":
    case "production":
      return {
        title: "Add Neotoma to another agent",
        blurb:
          "Paste this into the agent you want to give memory to. It will detect the harness it's running in and configure MCP for you.",
        prompt: addToAnotherAgentPrompt,
      };
    case "local_sandbox":
      return {
        title: "Wire your harness to this dev API",
        blurb:
          "Paste this into the agent you're developing with so it talks to this source-checkout's dev server instead of the global install.",
        prompt: wireDevPrompt,
      };
    case "hosted_sandbox":
    case "refuse":
    case undefined:
    default:
      return {
        title: "Install Neotoma locally",
        blurb:
          "Paste this into your agent of choice (Cursor, Claude Code, Codex, Claude Desktop, Windsurf, OpenClaw). It will auto-detect the harness and install Neotoma there.",
        prompt: installPrompt,
      };
  }
}
