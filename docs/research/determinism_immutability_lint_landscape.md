# Determinism and immutability: lint/static-enforcement landscape

**Status:** Research note. Input to a follow-up plan deciding whether to add
domain-specific lint rules in Neotoma. Not a decision document.

**Scope:** Survey of how comparable OSS projects statically enforce (a)
deterministic ID/event derivation and (b) immutability of source/observation
records, plus an assessment of TypeScript-side tooling Neotoma could adopt
cheaply today.

## 1. Event-sourcing and append-only stores

The headline finding: none of the major event-sourced or bitemporal stores
expose anything resembling a custom linter that enforces "no mutation after
write" on their *own* implementation code. Immutability is enforced at the
storage-engine and protocol layer, then the implementation language's normal
type system carries it the rest of the way. The closer a system sits to a
functional language (Clojure, Rust, F#), the less it needs lint pressure.

- **Datomic** and **XTDB** treat facts as the unit of truth. In Datomic a
  Datom (`entity, attribute, value, tx, op`) is conceptually frozen by the
  transactor and broadcast as novelty to peers
  ([InfoQ architecture overview](https://www.infoq.com/articles/Architecture-Datomic/),
  [Datomic internals — tonsky.me](https://tonsky.me/blog/unofficial-guide-to-datomic-internals/)).
  XTDB pushes the same idea further: the "transactor" role is just a passive,
  pluggable log (Kafka, Postgres, filesystem), and the engine deliberately does
  not enforce schema or mutation rules — the log being append-only is the
  enforcement ([XTDB FAQ](https://v1-docs.xtdb.com/resources/faq/),
  [Biffweb comparison](https://biffweb.com/p/xtdb-compared-to-other-databases/)).
  Both projects are Clojure: persistent data structures are the default, so
  there is no analog of "did someone mutate this struct?" to lint against.
- **EventStoreDB** (now Kurrent) enforces append-only at the stream-storage
  layer, not via linters in its C#/.NET source. No public custom analyzer
  bans mutation in its own codebase. The contract is structural: streams
  expose append + read, not update.
- **Materialize** (Rust) leans on Rust's ownership/borrow system; immutability
  is a language-level default, not a lint concern.
- **Kafka Streams / Marten**: same pattern. Storage layer is the enforcer;
  implementation discipline is enforced by code review and tests, not custom
  static analysis.

Generalizable takeaway: **no comparable project found that ships a custom
domain lint rule enforcing "no mutation of stored facts" in its own source.**
The pattern is "make the wrong thing structurally impossible (append-only API,
sealed structs, persistent data structures), then trust the host language."

For Neotoma in TypeScript this matters because TS has no equivalent of
Clojure's persistent defaults or Rust's borrow checker. The structural
prevention some of these systems get for free has to be either typed
(`readonly`, branded/opaque types, `Object.freeze` at boundaries) or linted.
That is closer to a real gap than the survey first suggests.

## 2. MCP servers

The MCP TypeScript SDK does have a relevant convention, but it is advisory
only. `registerTool` accepts an `annotations.idempotentHint` boolean (and
`destructiveHint`, `readOnlyHint`), and the docs explicitly say handlers
should be designed for safe retries
([typescript-sdk/docs/server.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)).
The annotation is a hint to *clients* about how to render/retry — it does not
alter execution and there is no static check that a tool flagged
`idempotentHint: true` actually behaves idempotently. Per the SDK docs: "these
annotations are hints only."

A scan of well-maintained community MCP servers (filesystem, git, sqlite
reference servers under `modelcontextprotocol/servers`, plus a sample of
third-party servers) surfaces no convention for:

- deterministic tool-result IDs,
- idempotency-key handling at the SDK level,
- immutable response shapes (responses are plain `content: [...]` arrays,
  typically constructed mutably with `push`).

**Plainly: nothing standardized.** There is no MCP-ecosystem precedent to
borrow. Neotoma's `idempotency_key` contract on `ingest` / `store` / `correct`
is already ahead of where the SDK conventions sit.

## 3. TypeScript tooling assessment

### `eslint-plugin-functional`

The relevant rule is `immutable-data`, which bans property assignment,
`delete`, `Object.assign`, and mutating array methods (`push`, `sort`, etc.)
([rule docs](https://github.com/eslint-functional/eslint-plugin-functional/blob/main/docs/rules/immutable-data.md)).
Escape hatches matter: `ignoreImmediateMutation` permits builder-style
construction on freshly created locals (`const x = []; x.push(...); return x;`),
`ignoreNonConstDeclarations` confines the check to `const` bindings, and
`ignoreIdentifierPattern` allows targeted carve-outs.

**Fit for Neotoma:** The plugin's own guidance recommends the "Lite" preset
when converting an existing codebase. Applied broadly to a TS-strict server
codebase that uses normal accumulator/builder patterns in handlers, reducers,
and bootstrap code, the false-positive rate is high enough that the plugin is
almost always adopted scoped — e.g. only on `src/services/reducer/**` or
`src/services/observation/**` rather than repo-wide. The `prefer-readonly`
and `prefer-readonly-parameter-types` rules from `typescript-eslint`
([prefer-readonly](https://typescript-eslint.io/rules/prefer-readonly/),
[prefer-readonly-parameter-types](https://typescript-eslint.io/rules/prefer-readonly-parameter-types/))
are cheaper wins and probably the right first step before considering
`immutable-data`.

`eslint-plugin-immutable` / `tslint-immutable` are predecessor projects
([tslint-immutable](https://github.com/jonaskello/tslint-immutable)) — both
folded into `eslint-plugin-functional`. Not separately useful.

### Semgrep

There is no off-the-shelf semgrep rule pack targeting determinism (no
`Math.random` / `Date.now` / unstable-sort detector aimed at business logic).
The existing rules at
[semgrep/semgrep-rules](https://github.com/semgrep/semgrep-rules) and
[fullstorydev/semgrep-rules math-random](https://github.com/fullstorydev/semgrep-rules/blob/main/optimizations/math-random-used.yaml)
target `Math.random` from a *security* angle (crypto misuse), not a
determinism angle. Writing the rules Neotoma needs is straightforward —
semgrep's pattern syntax handles `Date.now()` / `Math.random()` / `new Date()`
trivially, and path-scoping (`paths: include: ["src/services/entity_resolution/**"]`)
lets us confine them to the ID-derivation and reducer code paths where they
matter, avoiding noise in logging/metrics code where `Date.now()` is fine.

### Plain ESLint `no-restricted-syntax`

The lowest-cost option: AST-selector bans via the core
[`no-restricted-syntax`](https://eslint.org/docs/latest/rules/no-restricted-syntax)
rule. A two-rule config bans `Date.now()` and `Math.random()` at specific
call-site shapes with custom messages, no plugin needed
([example](https://christopher.xyz/2021/05/16/eslint-ban-syntax.html)). Pairs
well with ESLint `overrides` to scope to specific directories. Likely the best
first instrument because it's plugin-free and review-trivial.

## Recommendation

Five candidate checks. All are scoped, not repo-wide; "trivial" means one
config block, "small" means an afternoon, "medium" means a short FU.

- **`no-date-now-in-id-derivation`** — flags `Date.now()`, `new Date()`,
  `performance.now()` in `src/services/entity_resolution/**`,
  `src/services/observation/**`, and any module that exports an `*Id` /
  `derive*Id` function. Tool: ESLint `no-restricted-syntax` with `overrides`.
  Effort: **trivial**. Justification: the v0.x determinism invariants name
  exactly this anti-pattern; catching it at lint time costs nothing and is the
  single highest-signal check on the list.

- **`no-math-random-in-business-logic`** — bans `Math.random()` everywhere
  under `src/services/**` except a small allowlist (jitter/backoff in retry
  helpers). Tool: ESLint `no-restricted-syntax` + `overrides` allowlist, or
  semgrep with `paths:`. Effort: **trivial**. Justification: pairs with the
  above; the existing `scripts/security/run_semgrep.js` pipeline can host it
  as a WARNING that becomes ERROR after a one-pass cleanup.

- **`unstable-sort-without-tiebreaker`** — semgrep pattern that flags
  `.sort((a, b) => …)` where the comparator body returns from a single field
  comparison with no secondary key, scoped to reducer / snapshot projection
  paths. Tool: semgrep. Effort: **small**. Justification: matches the
  documented `observed_at DESC, id ASC` stable-ordering invariant; the failure
  mode (snapshot reorder churn on equal `observed_at`) is exactly the kind of
  bug code review misses. Expect some false positives on cosmetic sorts — ship
  as WARNING.

- **`readonly-on-observation-and-source-types`** — enable
  `typescript-eslint/prefer-readonly` and add a targeted rule (custom or
  semgrep) that requires `Readonly<…>` or `readonly` on the `Observation`,
  `Source`, and `TimelineEvent` type declarations and their return-position
  uses. Tool: typescript-eslint + a small custom rule or semgrep guard on the
  type declaration files. Effort: **small**. Justification: pushes the
  immutability invariant into the type system at the seam where it actually
  matters, instead of relying on a broad `eslint-plugin-functional` pass that
  would generate noise across handlers and bootstrap code.

- **`no-in-place-mutation-of-observation`** — semgrep pattern banning
  property assignment (`obs.x = …`, `Object.assign(obs, …)`) and mutating
  array methods on parameters typed `Observation` / `Source` /
  `ObservationProjection`. Tool: semgrep with type-tag matching, or a small
  custom ESLint rule using the TS type checker. Effort: **medium** (semgrep's
  TS type awareness is limited; getting low false-positive rate likely needs a
  custom ESLint rule that reads the TS type). Justification: directly encodes
  the "observations are immutable; reinterpretation = new observation"
  invariant. Only worth the medium effort if the first three rules don't
  already catch the regressions we actually see in PR review — revisit after
  six months of data on the cheaper rules.

**What to skip:** repo-wide `eslint-plugin-functional` adoption, and any
attempt to enforce idempotency of tool handlers via lint. The first has too
much noise; the second is a property of behavior that lint cannot see, and the
MCP ecosystem itself treats `idempotentHint` as a hint, not a checked
property.

The first three bullets together are roughly half a day of work, sit on
infra Neotoma already runs (ESLint + the semgrep CI gate), and target the
exact regression modes the invariants exist to prevent. That is the
recommendation: ship those three; defer the readonly type push and the
in-place-mutation rule until there is concrete PR-review evidence they would
have caught a real regression.

## Sources

- [Datomic architecture (InfoQ)](https://www.infoq.com/articles/Architecture-Datomic/)
- [Unofficial guide to Datomic internals — tonsky.me](https://tonsky.me/blog/unofficial-guide-to-datomic-internals/)
- [XTDB FAQ](https://v1-docs.xtdb.com/resources/faq/)
- [XTDB vs other databases (Biffweb)](https://biffweb.com/p/xtdb-compared-to-other-databases/)
- [MCP TypeScript SDK — server docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)
- [MCP TypeScript SDK repo](https://github.com/modelcontextprotocol/typescript-sdk)
- [eslint-plugin-functional — immutable-data rule](https://github.com/eslint-functional/eslint-plugin-functional/blob/main/docs/rules/immutable-data.md)
- [typescript-eslint — prefer-readonly](https://typescript-eslint.io/rules/prefer-readonly/)
- [typescript-eslint — prefer-readonly-parameter-types](https://typescript-eslint.io/rules/prefer-readonly-parameter-types/)
- [tslint-immutable (predecessor, archived)](https://github.com/jonaskello/tslint-immutable)
- [ESLint `no-restricted-syntax` rule](https://eslint.org/docs/latest/rules/no-restricted-syntax)
- [Using `no-restricted-syntax` — Christopher Dignam](https://christopher.xyz/2021/05/16/eslint-ban-syntax.html)
- [semgrep-rules repo](https://github.com/semgrep/semgrep-rules)
- [fullstorydev semgrep math-random rule](https://github.com/fullstorydev/semgrep-rules/blob/main/optimizations/math-random-used.yaml)
