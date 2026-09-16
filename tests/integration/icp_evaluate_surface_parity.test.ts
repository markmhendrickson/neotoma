/**
 * PR #2414 / issue #2415 — cross-surface parity between the ICP docs and `/evaluate`.
 *
 * `EvaluatePage.icp_fit.test.tsx` proves the effect on ONE surface: what a visitor
 * who loads `/evaluate` is scored on. That is necessary and not sufficient. The
 * defect #2415 reports is a DIVERGENCE defect: the docs and the public page drifted
 * apart, each stating a different buyer and a different install posture, and each
 * looked correct when read alone. A per-surface test cannot see a divergence, so
 * this test reads the surfaces TOGETHER and asserts they agree.
 *
 * Maps to the standing quality gate `cross_surface_contract_parity_tested_all_surfaces`
 * (`ent_2ad0677fe23c0c1878ae43e8`): parity must be asserted across every surface that
 * states the contract, in each surface's natural form — prose in the docs, i18n string
 * tables for the page, in BOTH locales. Also carries
 * `fixed_means_behavior_verified_not_contract_accepted` (`ent_db0b7855d47012084477fb00`):
 * each assertion below is written so that reverting the fix it guards makes it fail.
 *
 * The two invariants under test, both settled 2026-09-16:
 *
 *   1. ICP. The durable ICP is Candidate B — technically fluent but NOT
 *      infrastructure-oriented ("would install an npm package and configure an MCP
 *      server; would not write one from scratch"). Candidate A — the infrastructure
 *      builder selected for by npm/CLI comfort — is an early-adopter cohort, not the
 *      target. No surface may score a reader on install-path comfort, and no surface
 *      may screen a reader out over zero-install.
 *
 *   2. INSTALL POSTURE. Guided install is intended AND NOT SHIPPED; npm/CLI is what
 *      is true today; guided install is NOT zero-install. Every surface that states
 *      the posture must state BOTH halves. Stating only the intent is the specific
 *      defect this test exists to catch: it reads as a shipped feature.
 *
 *  - NEGATIVE CONTROL (ICP): no surface scores the reader on npm/CLI comfort, and no
 *    surface screens the reader out over zero-install. Restoring either of the two
 *    bullets this PR replaced ("Comfortable installing tools via npm and working with
 *    CLIs" / "Needs zero-install, no-config onboarding"), in either locale, fails.
 *  - NEGATIVE CONTROL (posture): no surface states the guided-install INTENT without
 *    also stating it is NOT available. Dropping "but not yet available" from the EN
 *    evaluate string, from README.md, or from what_is_neotoma.md fails — which is the
 *    exact EN↔ES asymmetry the review found, where EN said only "is intended".
 *  - NEGATIVE CONTROL (posture): no surface calls the product zero-install.
 *  - POSITIVE: every surface that states the posture names npm/CLI as today's path
 *    AND names guided install as unavailable; and both locales of `/evaluate` carry
 *    the Candidate-B signal that the docs carry.
 *
 * Surfaces are asserted in their natural form: markdown files are read from disk as
 * prose, and `/evaluate` is read from the i18n string tables it renders from, for
 * BOTH locales. ES is a first-class visitor surface, not a translation artifact.
 *
 * Deliberately NOT jsdom: this suite reads files and string tables, never the DOM,
 * so it runs in the default node environment. (`vitest.config.ts` still declares
 * `environmentMatchGlobs`, removed in vitest 4, so the frontend jsdom mapping is
 * silently dead and a DOM test here would need an explicit pragma. Tracked
 * separately; not worked around here because this suite needs no DOM.)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  EVALUATE_SUBPAGE_EN,
  EVALUATE_SUBPAGE_ES,
  type EvaluatePageStrings,
} from "../../frontend/src/i18n/locales/evaluate_subpage_strings.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** A surface that states the ICP and/or the install posture, in its natural form. */
interface Surface {
  readonly name: string;
  /** All prose a reader of this surface sees, flattened to one searchable string. */
  readonly text: string;
}

function docSurface(relPath: string): Surface {
  return {
    name: relPath,
    text: readFileSync(path.join(REPO_ROOT, relPath), "utf-8"),
  };
}

/**
 * Flattens an `/evaluate` locale pack to the prose a visitor reads. Every string
 * field is included rather than a hand-picked subset: a hand-picked subset is how
 * a partial sweep ships — `whoForP` was missed exactly that way.
 */
function evaluateSurface(name: string, pack: EvaluatePageStrings): Surface {
  const parts: string[] = [];
  for (const value of Object.values(pack) as unknown[]) {
    if (typeof value === "string") parts.push(value);
    else if (Array.isArray(value)) parts.push(...value.filter((v): v is string => typeof v === "string"));
  }
  return { name, text: parts.join("\n") };
}

/** The docs that state the ICP and/or the install posture. */
const DOC_SURFACES: readonly Surface[] = [
  docSurface("docs/icp/primary_icp.md"),
  docSurface("README.md"),
  docSurface("docs/getting_started/what_is_neotoma.md"),
  docSurface("docs/icp/icp_from_functionality.md"),
];

const EVALUATE_SURFACES: readonly Surface[] = [
  evaluateSurface("/evaluate (en)", EVALUATE_SUBPAGE_EN),
  evaluateSurface("/evaluate (es)", EVALUATE_SUBPAGE_ES),
];

const ALL_SURFACES: readonly Surface[] = [...DOC_SURFACES, ...EVALUATE_SURFACES];

/**
 * Sentences mentioning guided installation. The posture invariant is per-sentence:
 * a surface that names the intent in one sentence and the unavailability three
 * paragraphs later does not tell a reader of that sentence the truth.
 */
function guidedInstallSentences(text: string): string[] {
  return text
    .split(/(?<=[.;])\s+|\n/)
    .map((s) => s.trim())
    .filter((s) => /guided install|instalador guiado|instalaci[óo]n guiada/i.test(s));
}

/** States guided install is NOT available yet, in either language. */
const SAYS_UNSHIPPED =
  /not yet available|is not shipped|not shipped|a[úu]n no disponible|no disponible todav[íi]a|no est[áa] disponible/i;

/** Claims the reader can have it now — the shape that reads as shipped. */
const SAYS_INTENDED = /\bintended\b|\bintend to\b|previsto|prevista/i;

describe("ICP ↔ /evaluate cross-surface parity (#2415)", () => {
  describe("invariant 1: the durable ICP is Candidate B", () => {
    it("NEGATIVE CONTROL: no surface scores a reader on npm/CLI install comfort", () => {
      // The bullet this PR replaced, and its ES twin. Matching the *scoring* shape,
      // not any mention of npm: surfaces legitimately name npm as today's path.
      const scoresInstallComfort =
        /comfortable installing tools via npm|comfortable with npm and clis?\b|se instala herramientas v[íi]a npm/i;
      const offenders = ALL_SURFACES.filter((s) => scoresInstallComfort.test(s.text)).map(
        (s) => s.name,
      );
      expect(
        offenders,
        "A surface scores the reader on install-path comfort, which selects Candidate A — " +
          "the buyer most able to build their own state layer, and so not the durable ICP. " +
          `Offending surface(s): ${JSON.stringify(offenders)}`,
      ).toEqual([]);
    });

    it("NEGATIVE CONTROL: no surface screens a reader out over zero-install", () => {
      // The disqualifier this PR replaced. `primary_icp.md` and
      // `icp_from_functionality.md` QUOTE the old wording to record that it was
      // revised, so quoted/struck history is excluded: only a live screen counts.
      const screensOnZeroInstall =
        /(?<!")(?<!“)needs zero-install|requires zero-install|quiere onboarding cero-instalaci[óo]n/i;
      const offenders = ALL_SURFACES.filter((s) => {
        const live = s.text
          .split("\n")
          .filter((l) => !/previously read|D4 previously|earlier version/i.test(l))
          .join("\n");
        return screensOnZeroInstall.test(live);
      }).map((s) => s.name);
      expect(
        offenders,
        "A surface disqualifies a reader for needing zero-install onboarding. Install " +
          "friction is a delivery defect, not an ICP signal; screening on it narrows the " +
          `buyer toward whoever survives the install path. Offending: ${JSON.stringify(offenders)}`,
      ).toEqual([]);
    });

    it("POSITIVE: both locales of /evaluate carry the Candidate-B signal the docs carry", () => {
      // The docs state B as "would not build it themselves". `/evaluate` must score
      // the same thing, in each locale's natural wording.
      expect(
        EVALUATE_SUBPAGE_EN.strongFitBullets.some((b) =>
          /building your own state layer.*distraction from real work/i.test(b),
        ),
        "EN /evaluate does not score the reader on treating state-layer building as a distraction",
      ).toBe(true);
      expect(
        EVALUATE_SUBPAGE_ES.strongFitBullets.some((b) =>
          /construir su propia capa de estado.*distracci[óo]n del trabajo real/i.test(b),
        ),
        "ES /evaluate does not score the reader on treating state-layer building as a distraction",
      ).toBe(true);
    });

    it("POSITIVE: neither locale's 'who for' lead nominates the infrastructure builder", () => {
      // `whoForP` is the page's primary "who for" claim — the first thing a visitor
      // or an agent reads. It was missed by the earlier sweep, which corrected only
      // the strong-fit and not-fit bullets.
      const nominatesBuilder =
        /building a personal operating system|construyen un sistema operativo personal|builds new pipelines|construye pipelines|debugs state drift|depura el desv[íi]o de estado/i;
      for (const pack of [
        { name: "en", p: EVALUATE_SUBPAGE_EN.whoForP },
        { name: "es", p: EVALUATE_SUBPAGE_ES.whoForP },
      ]) {
        expect(
          nominatesBuilder.test(pack.p),
          `whoForP (${pack.name}) nominates the infrastructure builder (Candidate A) as the ` +
            `reader: ${JSON.stringify(pack.p)}`,
        ).toBe(false);
      }
    });
  });

  describe("invariant 2: guided install is intended AND not shipped", () => {
    it("NEGATIVE CONTROL: no surface states the guided-install intent without stating it is unavailable", () => {
      // This is the EN↔ES asymmetry the review found: ES said "previsto pero aún no
      // disponible", EN said only "is intended". Stating the intent alone reads as a
      // shipped feature. Dropping "but not yet available" from ANY surface fails here.
      const offenders: string[] = [];
      for (const s of ALL_SURFACES) {
        for (const sentence of guidedInstallSentences(s.text)) {
          if (SAYS_INTENDED.test(sentence) && !SAYS_UNSHIPPED.test(sentence)) {
            offenders.push(`${s.name}: ${sentence}`);
          }
        }
      }
      expect(
        offenders,
        "A surface names guided installation as intended without saying it is not yet " +
          "available, so a reader of that sentence takes it as shipped. Both halves must " +
          `appear together. Offending: ${JSON.stringify(offenders, null, 2)}`,
      ).toEqual([]);
    });

    it("NEGATIVE CONTROL: no surface describes the product as zero-install", () => {
      // Guided install is NOT zero-install: a download and a local runtime remain.
      const claimsZeroInstall =
        /\bis zero[- ]install\b|\bzero[- ]install product\b|sin instalaci[óo]n alguna/i;
      const offenders = ALL_SURFACES.filter((s) => claimsZeroInstall.test(s.text)).map((s) => s.name);
      expect(
        offenders,
        `A surface claims the product is zero-install. Offending: ${JSON.stringify(offenders)}`,
      ).toEqual([]);
    });

    it("POSITIVE: every surface stating the posture names npm/CLI as today's path", () => {
      const namesToday =
        /npm (and|plus) (the )?(CLI|command line)|installation today is npm and CLI|hoy la instalaci[óo]n es por npm y CLI|instalando un npm CLI|npm y (el )?CLI|npm and the CLI/i;
      const offenders = ALL_SURFACES.filter(
        (s) => guidedInstallSentences(s.text).length > 0 && !namesToday.test(s.text),
      ).map((s) => s.name);
      expect(
        offenders,
        "A surface discusses guided installation without naming npm/CLI as what is true " +
          `today, so a reader has no statement of the real install path. Offending: ${JSON.stringify(offenders)}`,
      ).toEqual([]);
    });

    it("POSITIVE: EN and ES /evaluate state the SAME posture, both halves present in each", () => {
      // Parity in each surface's natural form: same claim, each language's own wording.
      const en = EVALUATE_SUBPAGE_EN.notFitBullets.find((b) =>
        /fully hosted product with nothing running on your own machine/i.test(b),
      );
      const es = EVALUATE_SUBPAGE_ES.notFitBullets.find((b) =>
        /producto totalmente alojado, sin nada ejecut[áa]ndose en su propia m[áa]quina/i.test(b),
      );
      expect(en, "EN hosted screen missing").toBeDefined();
      expect(es, "ES hosted screen missing").toBeDefined();
      // Today's path, in each language.
      expect(en).toMatch(/installation today is npm and CLI/i);
      expect(es).toMatch(/hoy la instalaci[óo]n es por npm y CLI/i);
      // Guided install as intended AND unavailable, in each language.
      expect(en, "EN omits the unshipped half that ES states").toMatch(SAYS_UNSHIPPED);
      expect(es, "ES omits the unshipped half").toMatch(SAYS_UNSHIPPED);
      expect(en).toMatch(SAYS_INTENDED);
      expect(es).toMatch(SAYS_INTENDED);
    });
  });
});
