/**
 * MCP integration routes and labels.
 * Used by AppNavigationSidebar (first SIDEBAR_INTEGRATION_COUNT) and IntegrationsPage (all).
 */

import { Code2, Sparkles, Wind } from "lucide-react";
import { SiOpenai, SiClaude, SiGithubcopilot, SiGooglegemini, SiJetbrains, SiCodeium } from "react-icons/si";
import { CursorIcon } from "@/components/icons/CursorIcon";
import type { LucideIcon } from "lucide-react";

export interface IntegrationEntry {
  path: string;
  label: string;
  iconKey: string;
}

export const INTEGRATIONS: IntegrationEntry[] = [
  { path: "/mcp/cursor", label: "Cursor", iconKey: "cursor" },
  { path: "/mcp/chatgpt", label: "ChatGPT", iconKey: "chatgpt" },
  { path: "/mcp/claude", label: "Claude", iconKey: "claude" },
  { path: "/mcp/gemini", label: "Gemini", iconKey: "gemini" },
  { path: "/mcp/continue", label: "Continue", iconKey: "continue" },
  { path: "/mcp/copilot", label: "GitHub Copilot", iconKey: "copilot" },
  { path: "/mcp/vscode", label: "VS Code", iconKey: "vscode" },
  { path: "/mcp/grok", label: "Grok", iconKey: "grok" },
  { path: "/mcp/manus", label: "Manus", iconKey: "manus" },
  { path: "/mcp/windsurf", label: "Windsurf", iconKey: "windsurf" },
  { path: "/mcp/jetbrains", label: "JetBrains", iconKey: "jetbrains" },
  { path: "/mcp/codeium", label: "Codeium", iconKey: "codeium" },
];

export const SIDEBAR_INTEGRATION_COUNT = 4;

const iconMap: Record<string, LucideIcon | typeof CursorIcon> = {
  cursor: CursorIcon,
  chatgpt: SiOpenai,
  claude: SiClaude,
  continue: Code2,
  copilot: SiGithubcopilot,
  vscode: Code2,
  gemini: SiGooglegemini,
  grok: Sparkles,
  manus: Code2,
  windsurf: Wind,
  jetbrains: SiJetbrains,
  codeium: SiCodeium,
};

export function getIntegrationIcon(iconKey: string): LucideIcon | typeof CursorIcon {
  return iconMap[iconKey] ?? Code2;
}
