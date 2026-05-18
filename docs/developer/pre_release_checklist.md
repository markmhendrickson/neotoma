---
title: Pre-Release Validation Checklist
summary: "**Purpose:** Automated and manual checks run before release sign-off (Checkpoint 2). Used by Step 3.6 of the release workflow."
---

# Pre-Release Validation Checklist

**Purpose:** Automated and manual checks run before release sign-off (Checkpoint 2). Used by Step 3.6 of the release workflow.

**When to run:** After Step 3.5 (Architectural Completeness Validation) passes and before Checkpoint 2 (Pre-Release Sign-Off).

---

## 1. Automated checks (required)

Run these in order; all must pass before proceeding.

### 1.1 TypeScript compilation

```bash
npm run type-check
```

- **Required:** 0 errors.
- **Common failures:** `resolveEntity` return type mismatch, missing declaration files (`@types/...`), interface mismatches.

### 1.2 Linting

```bash
npm run lint
```

- **Required:** No errors (warnings acceptable but should be reviewed).
- **Common failures:** New `@typescript-eslint/no-unused-vars` or `no-explicit-any` after dependency upgrades.

### 1.3 Migration completeness

- **Source of truth:** Local SQLite schema is defined in `src/repositories/sqlite/sqlite_client.ts` (`SCHEMA_STATEMENTS`, column adds in `ensureSchema`, and `DEPRECATED_TABLES` drops).
- **`npm run migrate`** is a no-op for local SQLite (schema is applied on first DB open); still run it in CI/checklists so the command stays healthy.
- If a release ships **optional SQL** for operators (e.g. under `docs/releases/vX.Y.Z/migrations/`), confirm those scripts align with the in-code schema for that release.
- **Common failures:** New tables or columns added only in one place (code vs. release SQL), or legacy tables reappearing because `DEPRECATED_TABLES` was not updated.

### 1.4 Migration execution

```bash
npm run migrate
```

- **Required:** Succeeds without errors. Prefer a clean environment when possible.

### 1.5 Health check (local stack)

```bash
npm run doctor
```

- **Required:** No failures (warnings from `doctor` are acceptable if documented).
- **Note:** This repo uses **local SQLite**, not hosted Postgres/Supabase; there is no separate RLS/schema-advisor script in `package.json`.

### 1.6 Build verification

```bash
rm -rf dist/ && npm run build:server
```

- **Required:** Build succeeds and `dist/` is populated.

### 1.7 Bundlephobia (pre-release)

```bash
npm run check:bundlephobia
```

- Run for the version you are about to publish (or after publish).
- For Node-only packages with `"browser": false`, BuildError is expected and the check still passes.
- Optional: `npm run check:bundlephobia <version>` for a specific version.

### 1.8 Socket / npm package security (pre-release)

- **npm audit**
  - Run `npm audit` and `npm audit --omit=dev`.
  - **Required:** Resolve all reported vulnerabilities before release (upgrades, overrides, or justified exceptions).
  - Past issues: transitive CVEs in `@modelcontextprotocol/sdk`, `fast-xml-parser`, `hono`, `qs`, `ajv`; use `package.json` overrides or dependency upgrades to fix.

- **Socket.dev**
  - Open [Socket.dev – neotoma](https://socket.dev/npm/package/neotoma) for the **release version** (e.g. Alerts and Overview for that version).
  - Check **Alerts** for supply chain, install scripts, and vulnerability issues.
  - Check **Overview** for quality/maintenance/license scores and any flagged issues.
  - **Required:** Resolve or explicitly document any open Socket issues before Checkpoint 2 sign-off.
  - Ensures the published package does not ship known CVEs or Socket-flagged risks.
  - **Expected, documented alerts (do not block sign-off):**
    - **Network access:** CLI and server use `fetch()` for health checks, OAuth, and API calls (local or configured base URL). Intentional for MCP/API client behavior.
    - **Shell access:** CLI uses `child_process.spawn`/`exec` for subprocesses (e.g. MCP bridge, `neotoma init`, opening URLs, schema icon generation). Intentional for CLI and dev tooling.
  - If Socket shows **dependency high CVE** alerts, ensure `npm audit` is clean and overrides are in place; re-publish or wait for Socket re-scan if needed.
  - **Other common Socket findings (document, do not block):**
    - **Obsoleto (Obsolete):** Some transitive deps may be deprecated. Run `npm ls` and check npm for deprecation; replace direct deps where feasible; document transitives.
    - **Utiliza eval / Código nativo / Cadenas URL / Acceso FS o env:** Often from transitive deps (e.g. tooling, native bindings). Document as accepted if not in our code.
    - **Typosquats (“Quiso decir: parseuri, utile”):** False positive for package name `neotoma`; no action.
    - **Vulnerabilidad potencial / Anomalía detectada por IA:** Review and document; fix if it points to our code, else note as transitive or false positive.

### 1.9 MCP server startup

```bash
npm run dev
```

- **Required:** Starts without errors; MUST NOT write to stdout in a way that breaks JSON-RPC (e.g. stray console.log).
- **Common failures:** Console logging breaking MCP protocol.

### 1.10 MCP watch mode

```bash
npm run dev:server:tunnel
```

- **Required:** Compiles without errors; watch mode detects file changes as expected.

### 1.11 Security gates (pre-release)

These gates implement the v0.11.1 lessons (`docs/security/advisories/2026-05-11-inspector-auth-bypass.md`). They are Track 1 of the pre-release security plan (`.cursor/skills/release/SKILL.md` § Step 3.5).

```bash
# G1: Classify the release diff
npm run security:classify-diff -- --base <last-tag> --head HEAD --json

# G2: Static rules for the v0.11.1 bug class
npm run security:lint

# G3: Topology auth matrix + protected-routes manifest sync
npm run security:manifest:check
npm run test:security:auth-matrix

# G4: AI adversarial review scaffold
npm run security:ai-review -- --tag vX.Y.Z --base <last-tag> --head HEAD
```

- **Required:**
  - `security:lint` returns 0 errors. Warnings must be triaged and acknowledged in the review file (G4).
  - `security:manifest:check` reports the manifest is in sync with `openapi.yaml`.
  - `npm run test:security:auth-matrix` passes with no skipped assertions.
  - `docs/releases/in_progress/vX.Y.Z/security_review.md` exists, lists findings (or "none"), and carries a `yes` or `with-caveats` sign-off verdict.
  - The supplement at `docs/releases/in_progress/vX.Y.Z/github_release_supplement.md` has a `Security hardening` section that links the review file and any advisory under `docs/security/advisories/` opened or referenced by this release. When `classify-diff` reported `sensitive=false`, the section may simply state `No security-sensitive surfaces touched.`.
- **Common failures:**
  - `loopback-trust-in-production` static rule firing on a fresh proxy-trust read (use `forwardedForValues(req)`).
  - Manifest drift after adding a new `security: []` operation in `openapi.yaml` (run `npm run security:manifest:write`).
  - `local-dev-user-widening` warning landing in `src/services/**` outside `local_auth.ts` (route the dev shortcut through CLI bootstrap or `assertExplicitlyTrusted`).

### 1.12 Deployed probes (post-deploy)

After `flyctl deploy`, but before declaring the release complete, run the live protected-route probes from a CI runner or any host outside the Fly machine:

```bash
NEOTOMA_PROBE_HOSTS="https://sandbox.neotoma.io
https://neotoma.markmhendrickson.com" \
  bash scripts/security/deployed_probes.sh --tag vX.Y.Z
```

- **Required:** The probe writes `docs/releases/in_progress/vX.Y.Z/post_deploy_security_probes.md` and exits 0. Any `fail` row blocks release completion. Open or update an entry under `docs/security/advisories/` and either roll back or hotfix.
- **Common failures:**
  - A protected route returns `200` without bearer (the v0.11.1 shape) — high-severity regression.
  - A route returns `404` because the deploy did not pick up a new path; reconcile against the current build before signing off.
  - Network flake — the probe retries internally, but persistent `000` responses indicate transport or DNS issues, not a security regression. Document and re-run.

---

## 2. Report and sign-off

- Record pass/fail for each step in the release validation report: `docs/releases/vX.Y.Z/pre_release_validation_report.md`.
- If any step fails: stop, fix, and re-run this checklist before proceeding to Checkpoint 2.
- Reference: `/release` skill (`.cursor/skills/release/SKILL.md`).
