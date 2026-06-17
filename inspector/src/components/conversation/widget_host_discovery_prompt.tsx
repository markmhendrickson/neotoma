/**
 * FU-2026-05-003: ext-apps widget host mode discovery prompt.
 *
 * One-time banner shown on the conversation page that tells users about the
 * inline turn-summary widget available in MCP clients that load
 * `@neotoma/ext-apps-widget-host`. Dismissible; remembers the user's choice
 * in localStorage so it does not nag.
 *
 * The prompt does not "enable" anything from inside the Inspector — the
 * widget host is loaded by MCP clients themselves. The prompt's job is
 * discovery: surfacing that the option exists.
 */

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "neotoma_inspector_widget_host_prompt_dismissed";

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // ignore quota or privacy-mode errors
  }
}

export function WidgetHostDiscoveryPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isDismissed()) setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    markDismissed();
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Widget host discovery"
      className="flex items-start gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"
    >
      <div className="flex-1 space-y-1">
        <p className="font-medium">Inline turn-summary widgets are available in MCP clients.</p>
        <p className="text-xs text-muted-foreground">
          MCP clients that load <code className="font-mono">@neotoma/ext-apps-widget-host</code>{" "}
          render the per-turn status line, stored/retrieved counts, and issue consent card
          directly in the chat thread — same data shown here. This page works
          standalone, so this is informational only.
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={dismiss}
        aria-label="Dismiss widget host prompt"
        className="h-7 w-7 p-0"
      >
        <X className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
