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

- Ensure every table in schema/source of truth has a corresponding migration.
- Compare `CREATE TABLE` in `supabase/schema.sql` (or repo schema source) with `supabase/migrations/*.sql` (or equivalent).
- **Common failures:** New tables without migrations, `record_relationships` / `records` or external tables missing.

### 1.4 Migration execution

```bash
npm run migrate
```

- **Required:** Succeeds without errors. Prefer a clean environment when possible.

### 1.5 Schema advisor (when applicable)

```bash
npm run check:advisors
```

- **Required:** 0 critical issues.
- **Common failures:** Tables with policies but RLS not enabled.

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
npm run dev:api
```

- **Required:** Compiles without errors; watch mode detects file changes as expected.

---

## 2. Report and sign-off

- Record pass/fail for each step in the release validation report: `docs/releases/vX.Y.Z/pre_release_validation_report.md`.
- If any step fails: stop, fix, and re-run this checklist before proceeding to Checkpoint 2.
- Reference: `foundation/development/release_workflow.md` Step 3.6.
