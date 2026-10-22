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
  observation: render("N-structure", "Observation represented with connected paper records"),
  entity: render("N-change", "Entity represented with connected paper records"),
  reducer: render("N-current", "Reducer represented with connected paper records"),
  snapshot: render("N-basis", "Snapshot represented with connected paper records"),
  invoiceExample: null as Render | null,
  localService: null as Render | null,
} as const;

export const RECORD_RENDERS = [
  OCTOBER_RENDERS.source,
  OCTOBER_RENDERS.observation,
  OCTOBER_RENDERS.entity,
  OCTOBER_RENDERS.reducer,
  OCTOBER_RENDERS.snapshot,
] as const;
