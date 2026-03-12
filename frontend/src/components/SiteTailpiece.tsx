export function SiteTailpiece() {
  return (
    <footer
      aria-label="Decorative site tailpiece"
      className="relative overflow-hidden border-t border-black/10 bg-zinc-50/90 py-8 dark:border-white/10 dark:bg-zinc-950/70"
    >
      <div className="relative mx-auto flex max-w-4xl items-center justify-center px-6 md:px-10">
        <img
          src="/tailpiece.png"
          alt=""
          role="presentation"
          className="h-auto max-h-20 w-full max-w-2xl object-contain object-center opacity-70 dark:opacity-50"
        />
      </div>
    </footer>
  );
}
