/** One place to swap an October render and its text alternative. Null hides an unfilled slot. */
type Render = { src: string; alt: string; width: number; height: number };

const render = (file: string, alt: string, width = 1200, height = 800): Render => ({
  src: `/brand/october/${file}.webp`,
  alt,
  width,
  height,
});

export const OCTOBER_RENDERS = {
  hero: render("N-hero", "Paper source cards linked to a current record card", 1536, 1024),
  before: render("N-before", "Scattered paper fragments"),
  after: render("N-after", "Paper fragments filed into one record"),
  source: render("N-capture", "Source represented with connected paper records"),
  observation: render(
    "N-observation",
    "A document and envelope each linked to separate fact slips"
  ),
  entity: render(
    "N-entity",
    "Four rust-tabbed fact cards linked to one folder, and a sage-tabbed card linked to another"
  ),
  reducer: render(
    "N-reducer",
    "One fact slip selected from each visible stack and linked to a row on a record card"
  ),
  snapshot: render("N-basis", "Snapshot represented with connected paper records"),
  invoiceExample: render(
    "N-invoice-example",
    "An invoice sheet and a letter linked to one record card with a rust correction tab"
  ),
  localService: render(
    "N-tools",
    "Four different tool cards connected by paired threads to one record box on a local base"
  ),
} as const;

export const RECORD_RENDERS = [
  OCTOBER_RENDERS.source,
  OCTOBER_RENDERS.observation,
  OCTOBER_RENDERS.entity,
  OCTOBER_RENDERS.reducer,
  OCTOBER_RENDERS.snapshot,
] as const;
