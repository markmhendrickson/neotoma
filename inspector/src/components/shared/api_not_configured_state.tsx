import { Link } from "react-router-dom";
import { PlugZap } from "lucide-react";
import { MISSING_API_URL_MESSAGE } from "@/api/client";
import { Button } from "@/components/ui/button";
import { EmptyState, type EmptyStateProps } from "./empty_state";

export interface ApiNotConfiguredStateProps {
  /**
   * Override the canonical title. Defaults to "API not configured".
   */
  title?: string;
  /**
   * Override the canonical description (defaults to
   * `MISSING_API_URL_MESSAGE`).
   */
  description?: EmptyStateProps["description"];
  /**
   * Replace the default actions row (Start sandbox session + Open
   * Settings). Pass `null` to render no actions.
   */
  actions?: EmptyStateProps["actions"];
  className?: string;
}

function DefaultActions() {
  return (
    <>
      <Button asChild variant="default" size="sm">
        <a href="/?from=inspector" rel="noopener">
          Start sandbox session
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link to="/settings">Open Settings</Link>
      </Button>
    </>
  );
}

/**
 * Canonical "API not configured" empty state used wherever a page or
 * widget cannot load because `isApiUrlConfigured()` is false. Wraps
 * {@link EmptyState} with the {@link MISSING_API_URL_MESSAGE} description
 * and the default Start sandbox session / Open Settings actions; callers
 * may override `title`, `description`, or `actions` for context-specific
 * copy.
 */
export function ApiNotConfiguredState({
  title = "API not configured",
  description = MISSING_API_URL_MESSAGE,
  actions,
  className,
}: ApiNotConfiguredStateProps) {
  return (
    <EmptyState
      icon={PlugZap}
      title={title}
      description={description}
      actions={actions === undefined ? <DefaultActions /> : actions}
      className={className}
    />
  );
}
