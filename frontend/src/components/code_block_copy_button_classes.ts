/**
 * Emerald copy controls for code snippets — matches home (SitePage) and /install.
 * Keep Tailwind class strings literal here so the JIT picks them up.
 */

/** Light emerald panel for evaluate prompts (home section + /evaluate CopyableCodeBlock). */
export const CODE_BLOCK_EMERALD_PANEL =
  "border border-emerald-200/70 bg-emerald-50/90 text-foreground dark:border-emerald-800/50 dark:bg-emerald-950/35";

export const CODE_BLOCK_COPY_BUTTON_ABSOLUTE =
  "absolute top-2 right-2 z-10 min-w-[88px] h-8 justify-center gap-1.5 shrink-0 border-emerald-600 bg-emerald-600 px-2.5 text-white shadow-sm shadow-emerald-600/30 hover:border-emerald-500 hover:bg-emerald-500 hover:text-white focus-visible:ring-emerald-500 dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950 dark:shadow-emerald-500/30 dark:hover:border-emerald-400 dark:hover:bg-emerald-400 dark:hover:text-emerald-950 after:text-[11px] after:font-semibold after:tracking-wide after:content-[attr(aria-label)]";

export const CODE_BLOCK_COPY_BUTTON_FLOAT =
  "float-right relative z-10 ml-2 mb-2 min-w-[88px] h-8 justify-center gap-1.5 shrink-0 border-emerald-600 bg-emerald-600 px-2.5 text-white shadow-sm shadow-emerald-600/30 hover:border-emerald-500 hover:bg-emerald-500 hover:text-white focus-visible:ring-emerald-500 dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950 dark:shadow-emerald-500/30 dark:hover:border-emerald-400 dark:hover:bg-emerald-400 dark:hover:text-emerald-950 after:text-[11px] after:font-semibold after:tracking-wide after:content-[attr(aria-label)]";

/** Primary emerald CTA — hero evaluate links, home evaluate copy control, banners (SitePage). */
export const HOME_EVALUATE_CTA_CLASS =
  "inline-flex justify-center items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-700 px-5 py-2.5 text-[15px] font-medium text-white no-underline shadow-sm shadow-emerald-700/30 hover:border-emerald-600 hover:bg-emerald-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950 dark:shadow-emerald-500/30 dark:hover:border-emerald-400 dark:hover:bg-emerald-400 dark:hover:text-emerald-950 transition-colors";

/**
 * Shared layout for the home sticky banner CTA pair. Pair with the primary/secondary variants below
 * so the footer banner reads as one grouped action area without making both choices equally heavy.
 */
export const HOME_SCROLL_BANNER_SPLIT_CELL_CLASS =
  "flex min-h-[46px] w-full min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border px-3.5 py-2.5 text-center text-[14px] font-medium no-underline transition-colors duration-150 ease-out focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 md:w-auto md:min-w-max md:flex-none md:shrink-0 md:whitespace-nowrap md:px-4";

/** Primary action in the sticky banner: high-emphasis evaluate CTA. */
export const HOME_SCROLL_BANNER_PRIMARY_CELL_CLASS =
  "border-emerald-700 bg-emerald-700 text-white hover:border-emerald-600 hover:bg-emerald-600 hover:text-white focus-visible:ring-emerald-600 dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:border-emerald-400 dark:hover:bg-emerald-400 dark:hover:text-emerald-950";

/** Secondary action in the sticky banner: supportive CTA with stronger surface contrast. */
export const HOME_SCROLL_BANNER_SECONDARY_CELL_CLASS =
  "border-border bg-background text-foreground hover:bg-muted focus-visible:ring-emerald-500 dark:hover:bg-muted";

/**
 * Primary blue CTA — home demo install (`CliDemoInteractive`); contrasts with emerald evaluate CTAs
 * and sticky banner on the same scroll view.
 */
export const HOME_DEMO_INSTALL_CTA_CLASS =
  "inline-flex justify-center items-center gap-1.5 rounded-md border border-blue-700 bg-blue-700 px-5 py-2.5 text-[15px] font-medium text-white no-underline shadow-sm shadow-blue-700/30 hover:border-blue-600 hover:bg-blue-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:border-blue-500 dark:bg-blue-500 dark:text-white dark:shadow-blue-500/30 dark:hover:border-blue-400 dark:hover:bg-blue-400 dark:hover:text-white transition-colors";

/**
 * Compact emerald evaluate CTA — SiteTailpiece: full width below sm, content width from sm up.
 */
export const FOOTER_EVALUATE_CTA_CLASS =
  "inline-flex w-full sm:w-auto sm:shrink-0 justify-center items-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-4 py-2.5 text-[13px] font-medium text-white no-underline shadow-sm shadow-emerald-700/30 hover:border-emerald-600 hover:bg-emerald-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-50 dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950 dark:shadow-emerald-500/30 dark:hover:border-emerald-400 dark:hover:bg-emerald-400 dark:hover:text-emerald-950 dark:focus-visible:ring-offset-zinc-950 transition-colors";

/** Secondary footer CTA paired with evaluate in `SiteTailpiece`. */
export const FOOTER_SECONDARY_CTA_CLASS =
  "inline-flex w-full sm:w-auto sm:shrink-0 justify-center items-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-[13px] font-medium text-foreground no-underline shadow-sm transition-colors hover:bg-muted/70 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-50 dark:focus-visible:ring-offset-zinc-950";
