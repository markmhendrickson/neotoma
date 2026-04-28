import { Check, Copy } from "lucide-react";
import { useCopyFeedback } from "@/lib/copy_feedback";
import { copyTextToClipboard } from "@/lib/copy_to_clipboard";
import {
  sendFunnelInstallPromptCopy,
  type InstallPromptCopyBlock,
} from "@/utils/analytics";
import {
  CODE_BLOCK_CARD_INNER_CLASS,
  CODE_BLOCK_CARD_SHELL_CLASS,
  CODE_BLOCK_CHROME_STACK_CLASS,
  CODE_BLOCK_CHROME_SUBTITLE_CLASS,
  CODE_BLOCK_COPY_BUTTON_INLINE,
  EVALUATE_PROMPT_PILL_CLASS,
} from "./code_block_copy_button_classes";
import { Button } from "./ui/button";

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

function sanitizeCodeForCopy(rawCode: string): string {
  return rawCode
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("//")) return "";
      const commentIndex = line.indexOf("#");
      if (commentIndex >= 0 && !line.trimStart().startsWith('"'))
        return line.slice(0, commentIndex).trimEnd();
      return line;
    })
    .filter((line) => line !== "")
    .join("\n");
}

export function CodeBlock({
  code,
  copyFeedbackId,
  installBlock,
}: {
  code: string;
  copyFeedbackId: string;
  installBlock: InstallPromptCopyBlock;
}) {
  const [copied, markCopied] = useCopyFeedback(copyFeedbackId, 0);
  const chrome = INSTALL_BLOCK_CHROME[installBlock];

  const onCopy = async () => {
    const ok = await copyTextToClipboard(sanitizeCodeForCopy(code));
    if (!ok) return;
    markCopied();
    sendFunnelInstallPromptCopy(installBlock);
  };

  return (
    <div className={`relative mb-4 w-full text-left ${CODE_BLOCK_CARD_SHELL_CLASS}`}>
      <div className="mb-3 flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-3 sm:gap-y-3">
        <div className={CODE_BLOCK_CHROME_STACK_CLASS}>
          <div className={EVALUATE_PROMPT_PILL_CLASS}>
            <span
              className="h-2 w-2 rounded-full bg-emerald-500/80 dark:bg-emerald-400/80"
              aria-hidden
            />
            {chrome.title}
          </div>
          <div className={CODE_BLOCK_CHROME_SUBTITLE_CLASS}>{chrome.subtitle}</div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={CODE_BLOCK_COPY_BUTTON_INLINE}
          aria-label={copied ? "Copied" : "Copy"}
          onClick={onCopy}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <pre
        className={`${CODE_BLOCK_CARD_INNER_CLASS} code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words`}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
