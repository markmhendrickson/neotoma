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
  source: render(
    "N-capture",
    "A large document with one marked passage connected by blue lines to three smaller paper source slips"
  ),
  observation: render(
    "N-observation",
    "A document and envelope each linked to separate fact slips"
  ),
  entity: render(
    "N-entity",
    "Four observation slips connect to one identity-marked dossier holding their linked records"
  ),
  reducer: render(
    "N-reducer",
    "One fact slip selected from each visible stack and linked to a row on a record card"
  ),
  snapshot: render(
    "N-basis",
    "A current record sheet with one highlighted field connected to its selected passage on a blue evidence sheet"
  ),
  invoiceExample: render(
    "N-invoice-example",
    "A separate invoice and email each connect by fine threads to a marked record card"
  ),
  localService: render(
    "N-tools",
    "One chosen AI tool card reaches a configured local archive containing multiple records"
  ),
} as const;

export const RECORD_RENDERS = [
  OCTOBER_RENDERS.source,
  OCTOBER_RENDERS.observation,
  OCTOBER_RENDERS.entity,
  OCTOBER_RENDERS.reducer,
  OCTOBER_RENDERS.snapshot,
] as const;
