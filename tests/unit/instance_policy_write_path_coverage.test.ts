/**
 * Structural guard: every write path enforces the instance store policy (#1975).
 *
 * ## Why this test is a source scan rather than a behavioral one
 *
 * `store` has TWO independent cores in this codebase:
 *
 * - `storeStructuredForApi` in `src/actions.ts` — REST, CLI, and sync/peer ingest
 * - `storeStructuredInternal` in `src/server.ts` — the MCP tool path
 *
 * They are not thin wrappers over a shared core. The MCP core inserts
 * observation rows directly instead of going through `createObservation`, so it
 * also bypasses the guards that live inside that shared service
 * (`enforceAttributionPolicy`, `assertCanWriteProtected`,
 * `enforceOverridePolicy`). A policy check added to the shared write helper
 * alone would therefore be enforced on REST/CLI/sync and silently skipped on
 * MCP — which is exactly the "misconfigured or non-cooperating client" case
 * this feature exists to close, and a security control that is silently absent
 * on one transport is worse than none, because it reads as covered.
 *
 * The durable fix is to collapse the two cores; that is a much larger refactor
 * than this feature, and `src/services/protected_entity_types.ts` documents the
 * same hazard for its own guard. Until then, enforcement is duplicated by
 * construction, and this test is what keeps the duplication honest: if someone
 * refactors one core and drops the call, or adds a third write path, this fails
 * rather than the enforcement silently disappearing.
 *
 * A behavioral test cannot substitute here. It would exercise whichever core
 * the test harness happens to route through and pass while the other core sits
 * unguarded — the precise failure this guards against.
 *
 * ## Known scope boundary NOT covered by this guard
 *
 * `storeUnstructuredForApi` (src/actions.ts) — the raw/reference file upload
 * path — is deliberately NOT wired into the policy gate; see the
 * "documents (does not enforce) the known raw-file storage exception" test
 * below and src/services/instance_policy.ts's docblock.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf-8");

/** The single entry point every write path must call to enforce policy. */
const ENFORCE_CALL = "assertStorePolicyAllows";

/**
 * Return the source text from `signature` to the end of its function body,
 * matched by brace balance.
 *
 * Ordering assertions must compare offsets inside ONE function: both the gate
 * call and the write calls appear in other functions in these very large files,
 * so a whole-file `indexOf` would silently compare unrelated positions.
 */
function sliceFunctionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  if (start === -1) {
    throw new Error(
      `Could not find "${signature}" — the function was renamed or removed. ` +
        `Update this guard to point at the current store core; do not delete the assertion.`
    );
  }
  // Anchor on the brace that opens the BODY, not the first brace after the
  // signature. These declarations put braces in two places before the body:
  // inline object types for params (`function f(params: { … })`) and a return
  // type annotation (`): Promise<{ … }> {`). Balancing from the first `{` would
  // close inside the parameter list or the return type.
  //
  // So: balance parentheses to find the end of the parameter list, then scan
  // past any return-type annotation to the first brace at depth 0 that is not
  // inside `<…>`.
  const parenOpen = source.indexOf("(", start);
  let parenDepth = 0;
  let afterParams = -1;
  for (let i = parenOpen; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") parenDepth++;
    else if (ch === ")") {
      parenDepth--;
      if (parenDepth === 0) {
        afterParams = i + 1;
        break;
      }
    }
  }
  if (afterParams === -1) return source.slice(start);

  let angleDepth = 0;
  let open = -1;
  for (let i = afterParams; i < source.length; i++) {
    const ch = source[i];
    if (ch === "<") angleDepth++;
    else if (ch === ">") angleDepth = Math.max(0, angleDepth - 1);
    else if (ch === "{" && angleDepth === 0) {
      open = i;
      break;
    }
  }
  if (open === -1) return source.slice(start);

  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

/**
 * Strip line and block comments so a pattern scan tests the code rather than
 * prose about the code. Deliberately simple: it is not a JS parser, but the
 * target file contains no comment-like sequences inside string literals.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("instance store-policy is enforced on every write path", () => {
  it("the REST/CLI/sync store core calls the policy gate", () => {
    const src = read("src/actions.ts");
    expect(
      src.includes(ENFORCE_CALL),
      "storeStructuredForApi (src/actions.ts) must call assertStorePolicyAllows — " +
        "this core serves REST, CLI, and inbound peer/sync writes"
    ).toBe(true);
  });

  it("the MCP store core calls the policy gate", () => {
    const src = read("src/server.ts");
    expect(
      src.includes(ENFORCE_CALL),
      "storeStructuredInternal (src/server.ts) must call assertStorePolicyAllows. " +
        "This core bypasses createObservation, so it does NOT inherit guards " +
        "placed in the shared observation-write helper"
    ).toBe(true);
  });

  it("the correction core calls the policy gate", () => {
    const src = read("src/services/correction.ts");
    expect(
      src.includes(ENFORCE_CALL),
      "createCorrection (src/services/correction.ts) must call assertStorePolicyAllows — " +
        "both MCP and REST corrections converge here"
    ).toBe(true);
  });

  it("documents (does not enforce) the known raw-file storage exception", () => {
    // KNOWN SCOPE BOUNDARY (release-preparation finding, v0.22.0): raw/
    // reference file uploads (storeUnstructuredForApi in src/actions.ts) are
    // NOT covered by the policy gate — that path persists a `sources` row
    // directly from bytes and never constructs a typed entity with an
    // entity_type, so out_of_scope_entity_types / max_sensitivity_class have
    // no evaluable target there today. See the "Known scope boundary"
    // section in src/services/instance_policy.ts's docblock.
    //
    // This test exists so the exception is an EXPLICIT, encoded decision: if
    // someone adds a partial/inconsistent enforcement call to this function
    // later without updating this test and the docblock together, the
    // structural mismatch is visible in the diff rather than silent.
    const rawStoreCore = sliceFunctionBody(
      read("src/actions.ts"),
      "async function storeUnstructuredForApi"
    );
    expect(
      rawStoreCore.includes(ENFORCE_CALL),
      "storeUnstructuredForApi currently does NOT call assertStorePolicyAllows " +
        "(documented exception). If this now fails true, the exception was closed " +
        "— update this test to assert enforcement instead of its absence, and " +
        "remove the 'Known scope boundary' section from instance_policy.ts's " +
        "docblock and the inline comment above storeUnstructuredForApi in " +
        "actions.ts. If it still fails false with unrelated changes, the raw-file " +
        "path likely got enforcement added inconsistently — decide deliberately, " +
        "don't let this drift silently."
    ).toBe(false);
  });

  it("enforcement precedes any persistence in each store core", () => {
    // A store call is not wrapped in a transaction, so denying after a write has
    // begun would leave partial state behind — an error that says "rejected"
    // while the data sits in the database. Assert ordering, not just presence.
    //
    // Offsets are measured WITHIN each store-core function body: both file-level
    // symbols appear in unrelated functions elsewhere, so a whole-file indexOf
    // would compare positions in different functions and prove nothing.
    // Comments are stripped before measuring offsets: the gate's own docblock
    // names the write calls it must precede, and matching that prose would
    // report a false ordering violation against correct code.
    const actionsCore = stripComments(
      sliceFunctionBody(read("src/actions.ts"), "export async function storeStructuredForApi")
    );
    const actionsGate = actionsCore.indexOf(ENFORCE_CALL);
    // In this core the source row is written via storeRawContent; observations
    // follow it. The gate must come first.
    const actionsFirstWrite = actionsCore.indexOf("storeRawContent");
    expect(actionsGate, "gate not found inside storeStructuredForApi").toBeGreaterThan(-1);
    expect(
      actionsFirstWrite,
      "source write not found inside storeStructuredForApi"
    ).toBeGreaterThan(-1);
    expect(
      actionsGate,
      "policy gate must run before the source row is written in storeStructuredForApi"
    ).toBeLessThan(actionsFirstWrite);

    const mcpCore = stripComments(
      sliceFunctionBody(read("src/server.ts"), "private async storeStructuredInternal")
    );
    const mcpGate = mcpCore.indexOf(ENFORCE_CALL);
    const mcpObservationInsert = mcpCore.indexOf('db.from("observations").insert');
    expect(mcpGate, "gate not found inside storeStructuredInternal").toBeGreaterThan(-1);
    expect(
      mcpObservationInsert,
      "observation insert not found inside storeStructuredInternal"
    ).toBeGreaterThan(-1);
    expect(
      mcpGate,
      "policy gate must run before the raw observation insert in storeStructuredInternal"
    ).toBeLessThan(mcpObservationInsert);
  });

  it("the policy evaluator contains no hardcoded per-entity-type branch", () => {
    // The whole point of the feature is that operator-configured policy governs
    // which types are denied — not a list baked into code
    // (docs/foundation/schema_agnostic_design_rules.md). A per-type branch here
    // is a structural finding, not a style nit.
    //
    // Comments are stripped first: this file's own docblock *describes* the
    // banned pattern, and matching prose about the rule instead of code that
    // violates it would make this test fire on a correct implementation.
    const src = stripComments(read("src/services/instance_policy.ts"));
    const perTypeBranch = /entityType\s*===\s*["'`]|entity_type\s*===\s*["'`]/;
    expect(
      perTypeBranch.test(src),
      "src/services/instance_policy.ts must not branch on a specific entity_type; " +
        "read the operator's configured lists and the schema's declarations instead"
    ).toBe(false);
  });
});

describe("instance policy is served on every client-instructions surface (#1974)", () => {
  // Three surfaces serve the instruction block, and they had already drifted
  // from each other on fence extraction and compact-mode handling before this
  // feature. Composition is centralized in one function precisely so parity is
  // structural; this asserts each surface actually routes through it.
  const COMPOSE = "composeClientInstructions";

  it("the MCP handshake composes the policy into its instructions", () => {
    expect(read("src/server.ts").includes(COMPOSE)).toBe(true);
  });

  it("the REST instructions endpoint composes the policy into its instructions", () => {
    expect(read("src/actions.ts").includes(COMPOSE)).toBe(true);
  });

  it("the CLI instructions command composes the policy into its output", () => {
    expect(read("src/cli/index.ts").includes(COMPOSE)).toBe(true);
  });
});

describe("ERR_STORE_POLICY_DENIED keeps its structured envelope on every surface", () => {
  // A rejection must carry `code` / `denied[]` / `reason_code` / `hint` on BOTH
  // transports. The first cut of this feature returned the full envelope on REST
  // but let the error fall through to MCP's generic `InternalError` handler,
  // which keeps only `message` — so a client on MCP saw a server fault where a
  // REST client saw an actionable policy denial. That is the single-surface
  // drift the cross-surface parity policy exists to catch, and it is invisible
  // to any test that exercises only one transport.

  it("the MCP tool-call catch block branches on StorePolicyDeniedError", () => {
    const src = stripComments(read("src/server.ts"));
    expect(
      src.includes("error instanceof StorePolicyDeniedError"),
      "src/server.ts must branch on StorePolicyDeniedError in the CallToolRequestSchema " +
        "catch block, alongside AttributionPolicyError and OverridePolicyViolationError. " +
        "Without it the error falls through to the generic InternalError path and the " +
        "structured envelope is lost on MCP only."
    ).toBe(true);
  });

  it("both transports build the envelope from the error itself, not by hand", () => {
    // Sharing one builder is what makes parity structural: a field added to the
    // envelope reaches both surfaces at once. Hand-rolled object literals are how
    // the two drifted in the first place.
    const errorSrc = stripComments(read("src/services/instance_policy.ts"));
    expect(
      errorSrc.includes("toErrorEnvelope"),
      "StorePolicyDeniedError must expose toErrorEnvelope() as the single definition " +
        "of the ERR_STORE_POLICY_DENIED envelope"
    ).toBe(true);

    for (const surface of ["src/server.ts", "src/actions.ts"]) {
      expect(
        stripComments(read(surface)).includes("toErrorEnvelope()"),
        `${surface} must render the denial via error.toErrorEnvelope() rather than ` +
          `rebuilding the envelope inline`
      ).toBe(true);
    }
  });
});
