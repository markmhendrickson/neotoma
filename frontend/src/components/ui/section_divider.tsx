/**
 * Horizontal section divider matching the published site: thin line with a
 * centered diamond, used to space and separate content sections.
 */
export function SectionDivider() {
  return (
    <div className="flex items-center gap-3 my-12" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[8px] text-muted-foreground leading-none" aria-hidden>
        &#9670;
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
