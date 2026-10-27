import { sendFunnelInstallPromptCopy, type InstallPromptCopyBlock } from "@/utils/analytics";
import { SiteSnippet } from "./SiteSnippet";

const INSTALL_BLOCK_CHROME: Record<InstallPromptCopyBlock, { title: string; subtitle: string }> = {
  agent_assisted: {
    title: "Agent prompt",
    subtitle: "Paste this into an assistant to run the install-first Neotoma flow.",
  },
  manual_commands: {
    title: "Manual install",
    subtitle: "Run these commands yourself on the host machine.",
  },
  post_install_commands: {
    title: "Start API",
    subtitle: "Bring up the local API so MCP and CLI can connect.",
  },
  stdio_mcp: {
    title: "MCP config",
    subtitle: "Add this client config to connect Neotoma over stdio.",
  },
  docker_agent_prompt: {
    title: "Docker prompt",
    subtitle: "Use this when you want an assistant to handle the Docker path.",
  },
  docker_build: {
    title: "Docker build",
    subtitle: "Build the Neotoma image from the repository checkout.",
  },
  docker_run: {
    title: "Docker run",
    subtitle: "Start a persistent container with the data volume mounted.",
  },
  docker_init: {
    title: "Docker init",
    subtitle: "Initialize the Neotoma data directory inside the container.",
  },
  docker_mcp: {
    title: "Docker MCP",
    subtitle: "Point your MCP client at the containerized Neotoma server.",
  },
  docker_cli_example: {
    title: "Docker CLI",
    subtitle: "Run Neotoma commands inside the container with `docker exec`.",
  },
  doc_neotoma_with_cursor: {
    title: "Cursor doc",
    subtitle: "Cursor-specific install and connection example.",
  },
  doc_neotoma_with_claude_code: {
    title: "Claude Code doc",
    subtitle: "Claude Code-specific install and connection example.",
  },
  doc_claude_connect_desktop: {
    title: "Claude Desktop doc",
    subtitle: "Claude Desktop connection example for Neotoma.",
  },
  doc_codex_connect_local_stdio: {
    title: "Codex doc",
    subtitle: "Codex local stdio connection example for Neotoma.",
  },
  doc_openclaw_connect_local_stdio: {
    title: "OpenClaw doc",
    subtitle: "OpenClaw local stdio connection example for Neotoma.",
  },
};

export function CodeBlock({
  code,
  copyFeedbackId,
  installBlock,
  scrollLabel,
}: {
  code: string;
  copyFeedbackId: string;
  installBlock: InstallPromptCopyBlock;
  scrollLabel?: string;
}) {
  const chrome = INSTALL_BLOCK_CHROME[installBlock];
  return (
    <SiteSnippet
      text={code}
      title={chrome.title}
      subtitle={chrome.subtitle}
      copyFeedbackId={copyFeedbackId}
      label={scrollLabel}
      successMessage="Commands copied"
      onAfterCopy={() => sendFunnelInstallPromptCopy(installBlock)}
    />
  );
}
