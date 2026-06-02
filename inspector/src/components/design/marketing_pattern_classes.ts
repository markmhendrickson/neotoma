/**
 * Doc / marketing pattern shells — semantic design tokens only.
 * CSS utilities: inspector/src/index.css (@layer components).
 * Keep aligned with frontend/src/components/code_block_copy_button_classes.ts
 */

export const EVALUATE_PROMPT_CARD_SHELL_CLASS =
  "rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-background to-primary/5 p-3 shadow-sm shadow-primary/10 dark:border-primary/30 dark:from-primary/15 dark:via-background dark:to-primary/5";

export const CODE_BLOCK_CARD_INNER_CLASS =
  "code-block-shell mb-0 rounded-xl border border-border/80 bg-muted/35 p-4 font-mono text-ui leading-6 text-foreground shadow-inner";

export const EVALUATE_PROMPT_PILL_CLASS = "snippet-pill-label";

export const EVALUATE_PROMPT_DOT_CLASS = "snippet-pill-dot";

export const INTEGRATION_SNIPPET_CARD_SHELL_CLASS =
  "rounded-2xl border border-border bg-gradient-to-br from-muted via-background to-accent/50 p-3 shadow-sm dark:from-muted dark:via-background dark:to-accent/30";

export const INTEGRATION_SNIPPET_PILL_CLASS = "integration-pill-label";

export const INTEGRATION_SNIPPET_DOT_CLASS = "integration-pill-dot";

export const INTEGRATION_SNIPPET_INNER_CLASS =
  "code-block-shell mb-0 rounded-xl border border-border bg-muted/60 p-4 font-mono text-ui leading-6 text-foreground shadow-inner dark:bg-muted/40";

/** Prefer `<Button size="sm">` in product UI; class kept for CopyableCodeBlock parity. */
export const CODE_BLOCK_COPY_BUTTON_CLASS = "";

export const HOME_EVALUATE_CTA_CLASS =
  "inline-flex justify-center items-center gap-1.5 rounded-md border border-primary bg-primary px-5 py-3 text-body font-medium text-primary-foreground no-underline shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors";
