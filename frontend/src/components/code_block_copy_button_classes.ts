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
  "inline-flex justify-center items-center gap-1.5 rounded-md border border-emerald-600 bg-emerald-600 px-5 py-2.5 text-[15px] font-medium text-white no-underline shadow-sm shadow-emerald-600/30 hover:border-emerald-500 hover:bg-emerald-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950 dark:shadow-emerald-500/30 dark:hover:border-emerald-400 dark:hover:bg-emerald-400 dark:hover:text-emerald-950 transition-colors";
