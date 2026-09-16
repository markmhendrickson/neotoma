// @vitest-environment jsdom
/**
 * PR #2414 / issue #2415: effect-verified test for the `/evaluate` ICP fit criteria.
 *
 * The string tables prove the *contract* (a constant holds a particular value).
 * This test proves the *visitor-facing effect the review was about*: what a reader
 * who loads `/evaluate` is actually scored on. It renders the real page through the
 * real route (locale is resolved from the URL path by `LocaleProvider`, exactly as
 * in `main.tsx`) and asserts against the rendered DOM under the "strong fit" and
 * "not a fit" headings. Maps to the standing quality gate
 * `fixed_means_behavior_verified_not_contract_accepted`
 * (`ent_db0b7855d47012084477fb00`): acceptance is not effect, so asserting the string
 * table's contents would be contract acceptance, which that policy rules out.
 *
 * The durable ICP is Candidate B: the technically fluent operator who feels the
 * pain of ad-hoc agent state but will not build their own state infrastructure.
 * Candidate A, the infrastructure builder selected for by npm/CLI comfort, is an
 * early-adopter cohort, not the target.
 *
 *  - NEGATIVE CONTROL: the visitor must NOT be scored on install-path comfort. A
 *    strong-fit bullet selecting for npm/CLI comfort scores A as a strong fit, and a
 *    not-fit bullet screening on "zero install" disqualifies B over a delivery
 *    defect. These are the exact two defects the review found still live in ES.
 *    Reverting either locale's fix makes this fail.
 *  - POSITIVE: the strong-fit list scores the visitor on treating building their own
 *    state layer as a distraction, and the not-fit list screens only on wanting a
 *    fully hosted product with nothing on their own machine.
 *  - HONESTY BOUND: the hosted screen states what is true today (npm and CLI) and
 *    that a guided installer is intended and not shipped, never a zero-install or
 *    hosted claim.
 *
 * Both locales are asserted: ES is a first-class visitor surface, not a translation
 * artifact, so the effect must hold on `/es/evaluate` as it does on `/evaluate`.
 */

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ReactHelmetAsync from "react-helmet-async";
import { LocaleProvider } from "@/i18n/LocaleContext";
import { EvaluatePage } from "@/components/subpages/EvaluatePage";

const { HelmetProvider } = ReactHelmetAsync;

/** Renders `/evaluate` the way a visitor loads it: locale comes from the URL. */
function visitEvaluate(path: string): void {
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <LocaleProvider>
          <EvaluatePage />
        </LocaleProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

/**
 * The list a visitor actually reads under a heading. Walks from the rendered
 * heading to its sibling <ul>, so this reads the DOM the page produced rather
 * than any module the page imported.
 */
function bulletsUnderHeading(heading: string): string[] {
  const el = screen.getByText(heading);
  const list = el.nextElementSibling;
  if (!(list instanceof HTMLUListElement)) {
    throw new Error(`no <ul> rendered after heading ${JSON.stringify(heading)}`);
  }
  return within(list)
    .getAllByRole("listitem")
    .map((li) => (li.textContent ?? "").trim());
}

interface LocaleCase {
  readonly locale: string;
  readonly path: string;
  readonly strongFitHeading: string;
  readonly notFitHeading: string;
  /** Scored-on criterion that admits Candidate B. */
  readonly buildingIsADistraction: RegExp;
  /** Screen that must remain: wanting a fully hosted product. */
  readonly fullyHostedScreen: RegExp;
  /** Install path as it is true today, stated in the hosted screen. */
  readonly currentInstallPath: RegExp;
  /** Guided install named as intended, not shipped. */
  readonly guidedNotShipped: RegExp;
  /** Candidate-A install-comfort criterion that must NOT score a visitor. */
  readonly installComfort: RegExp;
  /** Zero-install screen that must NOT disqualify a visitor. */
  readonly zeroInstallScreen: RegExp;
}

const LOCALES: readonly LocaleCase[] = [
  {
    locale: "en",
    path: "/evaluate",
    strongFitHeading: "Strong fit signals",
    notFitHeading: "Likely not a fit right now",
    buildingIsADistraction: /building your own state layer.*distraction from real work/i,
    fullyHostedScreen: /fully hosted product with nothing running on your own machine/i,
    currentInstallPath: /installation today is npm and CLI/i,
    guidedNotShipped: /guided installer is intended/i,
    installComfort: /\bnpm\b|\bCLIs?\b/i,
    zeroInstallScreen: /zero[- ]install|no[- ]config onboarding/i,
  },
  {
    locale: "es",
    path: "/es/evaluate",
    strongFitHeading: "Señales de buen encaje",
    notFitHeading: "Probablemente no encaja ahora",
    buildingIsADistraction: /construir su propia capa de estado.*distracción del trabajo real/i,
    fullyHostedScreen: /producto totalmente alojado, sin nada ejecutándose en su propia máquina/i,
    currentInstallPath: /hoy la instalación es por npm y CLI/i,
    guidedNotShipped: /instalador guiado está previsto pero aún no disponible/i,
    installComfort: /\bnpm\b|\bCLIs?\b/i,
    zeroInstallScreen: /cero[- ]instalaci[óo]n|sin instalaci[óo]n/i,
  },
];

describe.each(LOCALES)(
  "/evaluate scores the durable ICP (Candidate B): $locale (#2415 effect verification)",
  (tc) => {
    it("NEGATIVE CONTROL: no strong-fit criterion scores the visitor on npm/CLI install comfort", () => {
      visitEvaluate(tc.path);
      const offenders = bulletsUnderHeading(tc.strongFitHeading).filter((b) =>
        tc.installComfort.test(b),
      );
      expect(
        offenders,
        `/evaluate (${tc.locale}) scores install-path comfort as a STRONG FIT, which selects ` +
          `Candidate A, the buyer most able to build their own state layer, and so not the ` +
          `durable ICP. Offending bullet(s): ${JSON.stringify(offenders)}`,
      ).toEqual([]);
    });

    it("NEGATIVE CONTROL: no not-fit criterion screens the visitor out over zero-install", () => {
      visitEvaluate(tc.path);
      const offenders = bulletsUnderHeading(tc.notFitHeading).filter((b) =>
        tc.zeroInstallScreen.test(b),
      );
      expect(
        offenders,
        `/evaluate (${tc.locale}) disqualifies a visitor for needing zero-install onboarding. ` +
          `Install friction is a delivery defect, not an ICP signal. Screening on it narrows ` +
          `toward whoever survives the install path. Offending bullet(s): ${JSON.stringify(offenders)}`,
      ).toEqual([]);
    });

    it("POSITIVE: the visitor is scored a strong fit for treating state-layer building as a distraction", () => {
      visitEvaluate(tc.path);
      expect(bulletsUnderHeading(tc.strongFitHeading)).toEqual(
        expect.arrayContaining([expect.stringMatching(tc.buildingIsADistraction)]),
      );
    });

    it("POSITIVE: the only hosting-related screen is needing a fully hosted product", () => {
      visitEvaluate(tc.path);
      expect(bulletsUnderHeading(tc.notFitHeading)).toEqual(
        expect.arrayContaining([expect.stringMatching(tc.fullyHostedScreen)]),
      );
    });

    it("HONESTY BOUND: the hosted screen states npm/CLI today and guided install as intended, not shipped", () => {
      visitEvaluate(tc.path);
      const screen_ = bulletsUnderHeading(tc.notFitHeading).find((b) =>
        tc.fullyHostedScreen.test(b),
      );
      expect(screen_, "fully-hosted screen not rendered").toBeDefined();
      // What is true today.
      expect(screen_).toMatch(tc.currentInstallPath);
      // Guided install named as intent, never as something the visitor can use now.
      expect(screen_).toMatch(tc.guidedNotShipped);
    });
  },
);
