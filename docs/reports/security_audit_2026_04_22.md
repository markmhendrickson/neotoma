# Neotoma security audit — 2026-04-22

Scope: read-only static review of the Neotoma repo (`src/`, `services/agent-site/`,
`frontend/`, `inspector/`, `scripts/`, top-level configs) plus `npm audit --production`.
Remediation pass landed in the same working tree; see the **Resolution status**
section below each finding for what changed.

Auditor: Claude (Opus 4.7) acting in Cursor.
Commit state: working tree with many unstaged changes at audit start; remediation
commits sit on top of those changes.

## Resolution overview

| ID | Severity | Status |
| --- | --- | --- |
| S-1 | Critical | **Fixed** (`src/actions.ts:323-351` — socket-based loopback check) |
| S-2 | Critical | **Fixed** (`src/repositories/sqlite/local_db_adapter.ts:843-875` — containment check) |
| S-3 | High | **Fixed** (allowlist + comma-sanitisation; see below) |
| S-4 | High | **Fixed** (`npm audit fix`; 0 advisories remaining prod + dev) |
| S-5 | High | **Fixed** (stack gating + message sanitisation) |
| S-6 | Medium | **Fixed** (`NEOTOMA_AAUTH_STRICT=1` strict mode) |
| S-7 | Medium | **Documented** (`.env.example` + docs below) |
| S-8 | Medium | **Fixed** (write rate limiter on 5 mutating endpoints) |
| S-9 | Medium | **Fixed** (tightened `connectSrc` + env override) |
| S-10 | Medium | **Fixed** (`/me` paths gated by `isLocalRequest`) |
| S-11 | Low | Covered — S-1 fix makes all `isLocalRequest` callers socket-based |
| S-12 | Low | Covered — S-10 fix now gates absolute paths on loopback |
| S-13 | Low | **Fixed** (`safeCompareTokens` + `crypto.timingSafeEqual`) |
| S-14 | Info | No code change; fuzz-test suggestion retained for future work |

## Severity summary

| Severity | Count | IDs |
| --- | --- | --- |
| Critical | 2 | S-1, S-2 |
| High | 3 | S-3, S-4, S-5 |
| Medium | 5 | S-6, S-7, S-8, S-9, S-10 |
| Low / Info | 4 | S-11, S-12, S-13, S-14 |
| Positive findings | — | P-1…P-6 |

---

## Critical

### S-1. `isLocalRequest` trusts the `Host` header → auth bypass when bound off-loopback

File: `src/actions.ts` lines 323–328, usage lines 1752–1763 and 1779–1787.

```323:328:src/actions.ts
export function isLocalRequest(req: express.Request): boolean {
  const host = (((req.headers["host"] || req.headers["Host"]) as string) || "")
    .split(":")[0]
    .toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}
```

The auth middleware trusts `isLocalRequest()` to short-circuit authentication and
assign `ensureLocalDevUser()` without any Bearer token:

```1751:1788:src/actions.ts
  if (
    config.storageBackend === "local" &&
    isLocalRequest(req) &&
    !headerAuth.startsWith("Bearer ")
  ) {
    const devUser = ensureLocalDevUser();
    (req as any).authenticatedUserId = devUser.id;
    ...
  }
  ...
    if (!headerAuth.startsWith("Bearer ")) {
      if (isLocalRequest(req)) {
        const devUser = ensureLocalDevUser();
        (req as any).authenticatedUserId = devUser.id;
        ...
        return next();
      }
    }
```

`req.headers.host` is attacker-controlled. If the API is ever bound to a non-loopback
address (e.g. `0.0.0.0`, a LAN interface, or exposed via a TCP tunnel before the
reverse proxy rewrites the header), a remote request with `Host: localhost` will be
authenticated as the local dev user with full data-access privileges.

Neotoma's typical dev setup uses Cloudflare Tunnel, which usually sets `Host` to the
tunnel hostname, so the most common production-ish path is safe. But:

- Any direct LAN exposure (e.g. `HTTP_HOST=0.0.0.0`) is vulnerable.
- Any misconfigured reverse proxy that forwards the original client-supplied `Host`
  rather than rewriting it to `localhost` exposes this bypass.

Reproduction sketch:

```bash
# On server, expose on LAN:
HTTP_HOST=0.0.0.0 npm run watch:server
# From another machine on the LAN:
curl -H 'Host: 127.0.0.1' http://<server-ip>:3080/me
curl -H 'Host: localhost'  http://<server-ip>:3080/entities
```

Fix: make "local" a network fact, not a string. Use `req.socket.localAddress` /
`req.socket.remoteAddress` with `net.isLoopbackAddress`-style checks, or require the
server to be bound explicitly to `127.0.0.1` before allowing the no-Bearer shortcut.
Consider an explicit `NEOTOMA_ALLOW_UNAUTHENTICATED_LOCAL=1` opt-in gate.

### S-2. Path-traversal in `LocalStorageBucket.resolvePath`

File: `src/repositories/sqlite/local_db_adapter.ts` lines 843–874.

```843:874:src/repositories/sqlite/local_db_adapter.ts
  private resolvePath(objectPath: string): string {
    if (this.bucket === "sources") {
      return path.join(config.rawStorageDir, objectPath);
    }
    return path.join(config.dataDir, "storage", this.bucket, objectPath);
  }

  async upload(objectPath: string, data: Buffer, options?: { upsert?: boolean; contentType?: string }): Promise<QueryResult<null>> {
    const targetPath = this.resolvePath(objectPath);
    ...
    await fs.writeFile(targetPath, data);
    ...
  }

  async download(objectPath: string): Promise<QueryResult<{ arrayBuffer: ... }>> {
    const targetPath = this.resolvePath(objectPath);
    ...
    const file = await fs.readFile(targetPath);
    ...
  }
```

`path.join` **preserves** `..` segments. Neither `upload` nor `download` verifies
that the resolved path stays under `config.rawStorageDir` / `config.dataDir`.

Today the production `storeRawContent` path supplies `userId/hash` components
(`src/services/raw_storage.ts:125-126`) which are not attacker-controlled, so we are
not aware of a live exploit path. But the moment a future endpoint, import flow, or
DB row accepts a user-supplied object path (e.g. a migration that carries over
`storage_url` values from external data), this becomes arbitrary file read / write
scoped to the Neotoma process user.

Fix:

```ts
private resolvePath(objectPath: string): string {
  const root = this.bucket === "sources"
    ? path.resolve(config.rawStorageDir)
    : path.resolve(config.dataDir, "storage", this.bucket);
  const resolved = path.resolve(root, objectPath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`path_traversal_blocked: ${objectPath}`);
  }
  return resolved;
}
```

Also audit `resolveLocalSourceFilePath` in `src/services/raw_storage.ts:283-295`
and its consumer `src/actions.ts:3301-3307`; the current code echoes an
unsanitised `filesystem_absolute_path` derived from `storage_url`, which is both a
path-traversal vector **and** an information-disclosure vector (leaks arbitrary
host FS paths into JSON responses).

---

## High

### S-3. SQL identifier injection in `.or()` query builder

File: `src/repositories/sqlite/local_db_adapter.ts` lines 545–586.

```545:586:src/repositories/sqlite/local_db_adapter.ts
  or(conditions: string): this {
    const parts = conditions.split(",").map((p) => p.trim()).filter(Boolean);
    const clauses: string[] = [];
    const values: unknown[] = [];
    for (const part of parts) {
      const dotIdx = part.indexOf(".");
      ...
      const left = part.slice(0, dotIdx);
      ...
      if (op === "eq") {
        clauses.push(`${left} = ?`);
        values.push(value);
      } else if (op === "ilike") {
        clauses.push(`${left} LIKE ? COLLATE NOCASE`);
        values.push(value);
      }
      ...
    }
```

`left` (the SQL column identifier) is spliced directly into the SQL string
without any allowlist. Values are bound, but the identifier position is not.
All other builder methods (`eq`, `ilike`, …) use `normalizeColumnName()`
(lines 446–454); `.or()` is the one that does not.

Two call sites interpolate user-controlled input into the `.or(…)` argument:

- `src/actions.ts:3226-3232` — `mime_type` from `req.query`:

```3226:3232:src/actions.ts
    if (mimeType) {
      const mimeNeedle = mimeType.trim();
      if (mimeNeedle.includes("/")) {
        query = query.ilike("mime_type", `%${mimeNeedle}%`);
      } else {
        query = query.or(`mime_type.ilike.%${mimeNeedle}%,original_filename.ilike.%${mimeNeedle}%`);
      }
    }
```

- `src/shared/action_handlers/entity_identifier_handler.ts:129-135` — identifier
  lookups driven by user input.

Reproduction sketch (mime_type param):

```
GET /sources?mime_type=wav,1%3D1%20OR%201.eq.x
```

After the split the second part becomes `1=1 OR 1.eq.x`, which the builder
parses as `left = "1=1 OR 1"`, `op = "eq"`, `value = "x"`, generating
`(mime_type LIKE '%wav' COLLATE NOCASE OR 1=1 OR 1 = ?)` — the `1=1` clause
makes the OR group match every row.

Impact: because every affected query is already ANDed with
`.eq("user_id", userId)`, this is **tenant-local** SQL injection — an attacker
can over-match rows inside **their own** tenant, bypass intended filters, and
build DoS queries. better-sqlite3 `.prepare()` is single-statement, so DROP /
UNION chained statements are blocked, but nothing prevents subqueries inside
the interpolated identifier:

```
?mime_type=x,a.eq.b) OR original_filename IN (SELECT name FROM sqlite_master.eq.c
```

That would expose schema names from the caller's own scope.

Fix: run `left` through `normalizeColumnName()` and reject unknown columns:

```ts
const normLeft = normalizeColumnName(left);
if (!normLeft) continue;
clauses.push(`${normLeft} = ?`);
```

### S-4. Vulnerable transitive dependencies (`npm audit --production`)

Five advisories affect production dependencies (from `npm audit`):

| Package | Severity | Advisory |
| --- | --- | --- |
| `path-to-regexp` ≤ 0.1.12 / 8.0.0–8.3.0 | **high** | GHSA-37ch-88jc-xwx2, GHSA-j3q9-mxjg-w52f, GHSA-27v5-c462-wpq7 (ReDoS) |
| `picomatch` ≤ 2.3.1 / 4.0.0–4.0.3 | **high** | GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj (method injection + ReDoS) |
| `hono` ≤ 4.12.13 | moderate (×6) | cookie name bypass, IPv4-mapped IPv6 bypass in `ipRestriction`, `serveStatic` bypass, path-traversal in `toSSG`, XSS via JSX attr names |
| `@hono/node-server` < 1.19.13 | moderate | middleware bypass via repeated slashes |
| `yaml` 2.0.0–2.8.2 | moderate | stack overflow on deeply nested YAML |

`path-to-regexp` and `hono` reach Neotoma through `@modelcontextprotocol/sdk` and
similar transitive chains; the `ipRestriction` IPv6-bypass advisory is
particularly relevant if Neotoma ever sits behind a proxy that converts IPv4 to
IPv4-mapped IPv6.

Fix: `npm audit fix` is clean (advisories list "fix available"). Re-run
`npm audit` after upgrade; add a CI check (`npm audit --audit-level=high --production`)
to keep these from regressing.

### S-5. Error responses leak internal `Error.message` / stack info

File: `src/actions.ts` lines ~1960–1961 (`handleApiError`) and logging at
`src/actions.ts:947-952` (`logError` includes `error.stack`).

500 responses pass the raw `err.message` to clients, which for SQLite errors
can leak table/column names and path fragments. Stacks in logs are fine for
operators but risky if the log pipeline is shared outside the trust boundary.

Fix: map internal errors to stable client codes with sanitized messages, and
gate stack logging behind `NODE_ENV !== "production"` or a log-level setting.

---

## Medium

### S-6. AAuth middleware fails open on invalid signatures

`src/middleware/aauth_verify.ts:14-19` documents this:

> When verification fails (bad signature, expired JWT, JWKS fetch error), the
> middleware logs a warning and treats the request as unauthenticated — it does
> NOT reject with 401.

This is deliberate for Phase-1 rollout, but there is no `strict` mode yet.
Anyone relying on "signed-only" access must not ship without it.

Fix: add `NEOTOMA_AAUTH_STRICT=1` to return 401 when AAuth headers are present
but verification fails. Keep the fail-open default until operators opt in.

### S-7. Default attribution policy allows anonymous writes

`src/services/attribution_policy.ts:51-53`:

```ts
const DEFAULT_POLICY: AttributionPolicySnapshot = {
  anonymous_writes: "allow",
};
```

Combined with S-1 and S-6, a misconfigured deployment can accept writes with
no agent attribution and no request authentication. Recommend documenting
`NEOTOMA_ATTRIBUTION_POLICY=warn` (or `reject`) and a production default of
`min_tier=software` for any hosted deployment.

### S-8. No rate limiting on data endpoints

`src/actions.ts:157-191` wires `express-rate-limit` only for OAuth endpoints.
`POST /store`, the MCP endpoint, and `/entities` query routes have no per-IP or
per-user throttling, and the global body limit is 10 MB
(`src/actions.ts:147-153`). With JSON parsing + schema resolution + SQLite
writes on the hot path, an unauthenticated attacker (via S-1 or a tunnelled
endpoint that routes anonymous writes through S-7) can trivially saturate a
single-process deployment.

Fix: add a global IP rate limit + a stricter write-route limit keyed by
`authenticatedUserId ?? req.ip`.

### S-9. CSP `connectSrc` permits all HTTP(S)

`src/actions.ts:111-124`:

```ts
connectSrc: ["'self'", "http:", "https:"],
```

`'self'` is usually enough for the uploader. Allowing every `http:` and
`https:` origin defeats the XSS-exfiltration defence that CSP normally
provides if a `scriptSrc: 'unsafe-inline'` injection (also allowed, line 117)
is ever landed.

Fix: narrow `connectSrc` to the API origin + any required CDNs, and drop
`'unsafe-inline'` in `scriptSrc` once the uploader is served bundled.

### S-10. `/me` leaks local filesystem paths

`src/actions.ts:1872-1878` returns `data_dir` and `sqlite_path` in the `/me`
response. In shared-host scenarios this is reconnaissance data (absolute paths
pointing at user homedirs). Gate behind dev mode or redact to basenames.

---

## Low / Info

### S-11. Host header also pollutes other header-driven branches

Anywhere else in `actions.ts` that derives behaviour from `req.headers.host`
inherits the S-1 trust assumption. Consumers of `isLocalRequest()` outside the
auth middleware (search for usages) should be reviewed together.

### S-12. `/sources/:id/content` response hygiene

`src/actions.ts:3301-3307` derives `filesystem_absolute_path` from
`resolveLocalSourceFilePath` and surfaces it to authenticated callers. That is
convenient for local dev but leaks absolute paths in remote deployments. Gate
on `config.storageBackend === "local" && isLocalRequest(req)` **after** S-1 is
fixed, or suppress the field over the tunnel.

### S-13. `Bearer` token comparison not timing-safe

`src/actions.ts:1770`, `1792` — `token === expectedToken` on user-supplied
strings. A constant-time compare (`crypto.timingSafeEqual`) is the cheap fix;
impact is low because tokens are long random strings.

### S-14. Feedback pipeline redaction

`services/agent-site/netlify/lib/redaction.ts` and `src/services/feedback/redaction.ts`
look correct on spot-check (token patterns, home-directory scrub). No finding,
but worth adding fuzz tests — redaction bugs here are the highest-leverage
PII failure path in the product.

---

## Positive findings

- **P-1.** SQL value binding is enforced on `.eq`, `.ilike`, `.in`, etc. via
  `normalizeColumnName()` (`src/repositories/sqlite/local_db_adapter.ts:446-520`).
  Only `.or()` regresses this (S-3).
- **P-2.** SQLite path comes from server-side config
  (`src/config.ts` → `sqlite_client.ts:384`), not from HTTP input. No
  `ATTACH DATABASE` with a user-controlled path.
- **P-3.** `GET /sources/:id/content` checks `user_id` scoping before serving
  the raw file (`src/actions.ts:3329-3334`, `3375`).
- **P-4.** Sensitive fields redaction is nested (`access_token`, `api_key`, …)
  in request/response logging (`src/actions.ts:855-898`).
- **P-5.** No `eval` / `new Function` in first-party `src/`; no `postinstall`
  hook in `package.json`.
- **P-6.** PDF parsing uses `pdf-parse` on buffers, not shell-outs or
  JS execution (`src/services/file_text_extraction.ts:70-107`).

---

## Recommended remediation order

1. S-1 + S-2 (host-header bypass and path traversal) — both are foot-guns that
   promote any future misconfiguration into a critical exposure.
2. S-3 (SQL `.or()` identifier injection) — one-line fix, cheap and immediate.
3. S-4 (`npm audit fix`) — ship with the next patch release.
4. S-6 + S-7 (AAuth strict mode + attribution policy defaults) — coordinated
   change to fail-closed configuration for hosted deployments.
5. S-5, S-8, S-9, S-10, S-13 — hardening; batch into a single security pass.

---

## Applied remediation (2026-04-22 session)

Concrete diffs:

- **S-1** — `src/actions.ts:323-351`. `isLocalRequest` now reads
  `req.socket.remoteAddress` and checks IPv4 loopback (`127.0.0.0/8`), IPv6
  loopback (`::1`), and IPv4-mapped IPv6 loopback (`::ffff:127.*`). Host
  header is no longer consulted.
- **S-2** — `src/repositories/sqlite/local_db_adapter.ts:843-875`. New
  containment check: `path.resolve` the root, resolve the object path, reject
  anything not under the root with `STORAGE_PATH_TRAVERSAL_BLOCKED`; also
  reject absolute paths, URL schemes, and null bytes with
  `STORAGE_PATH_REJECTED`.
- **S-3** — `src/repositories/sqlite/local_db_adapter.ts:545-600`: `.or()`
  clauses now validate `left` against
  `^[A-Za-z_][A-Za-z0-9_]*(->>[A-Za-z_][A-Za-z0-9_]*)?$` before
  interpolation. Call sites that weave untrusted values into `.or()`
  strings also strip commas defensively: `src/actions.ts:3231`
  (`mime_type`) and
  `src/shared/action_handlers/entity_identifier_handler.ts:123-130`
  (entity identifier search).
- **S-4** — `npm audit fix` applied. Production tree: 0 vulnerabilities.
  Dev tree: 0 vulnerabilities. Verified by `npm audit` / `npm audit
  --production`. Affected packages bumped: `path-to-regexp`, `picomatch`,
  `hono`, `@hono/node-server`, `yaml`, and a follow-on `vite` bump.
- **S-5** — `src/actions.ts:handleApiError` + `logError`. Stack traces and
  raw `Error.message` are only surfaced outside production, or when the
  operator opts in via `NEOTOMA_VERBOSE_ERRORS=1` /
  `NEOTOMA_LOG_STACKS=1`.
- **S-6** — `src/middleware/aauth_verify.ts`. New `strict` option and
  `NEOTOMA_AAUTH_STRICT=1` env var. When strict, signed-but-invalid
  requests are rejected with HTTP 401 +
  `error_code: "AAUTH_SIGNATURE_INVALID"`. Unsigned requests keep
  flowing through so OAuth / Bearer continue to work.
- **S-7** — `.env.example` now documents `NEOTOMA_ATTRIBUTION_POLICY` and
  `NEOTOMA_ATTRIBUTION_POLICY_JSON`. Default remains `allow` for
  compatibility; hosted deployments should set `warn` or `reject` per
  this report.
- **S-8** — new `writeRateLimit` applied to `POST /store`,
  `POST /store/unstructured`, `POST /correct`, `POST /entities/merge`,
  `POST /entities/:id/batch_correct`, and `POST /observations/create`.
  Keyed on authenticated user id when available, else IPv6-safe
  `ipKeyGenerator(req.ip)`. Tunable via
  `NEOTOMA_WRITE_RATE_LIMIT_PER_MIN` (default 120/min).
- **S-9** — `connectSrc: ['self']`; extra origins can be added via
  `NEOTOMA_CSP_CONNECT_SRC` (comma-separated list). No longer allows
  `http:` / `https:` wildcards.
- **S-10** — `GET /me` now only includes absolute `data_dir` / `sqlite_db`
  when the call arrives over a loopback socket. Tunnel callers see
  `{ storage_backend: "local" }` only.
- **S-13** — New `safeCompareTokens(a, b)` helper using
  `crypto.timingSafeEqual` with length pre-check. Applied to all four
  Bearer/token comparisons in `src/actions.ts`.

Regression coverage:

- `tests/integration/tunnel_auth.test.ts` rewritten to assert the
  socket-based semantics, including an explicit spoofed-Host negative
  test.
- `tests/unit/security_hardening.test.ts` asserts S-1 socket semantics,
  S-3 identifier regex, and documents the S-13 length guard.
- `npx vitest run tests/unit/` → 315 passed / 2 skipped.
- `npm audit` → 0 vulnerabilities (prod + dev).

## Out of scope / follow-ups

- Fuzzing the prototype-pollution surface in `store_structured` ingestion
  (`src/services/observation_storage.ts`, `interpretation.ts`). The code reads
  plain JSON into schema-typed shapes and does not obviously merge into shared
  objects, but a deeper read is warranted.
- Supply-chain review of `@modelcontextprotocol/sdk` transitive chain that
  originally brought in `hono` and `path-to-regexp`.
- Authentication flow for `services/agent-site/netlify/lib/auth.ts` —
  checked token redaction only, did not audit signing/key rotation.
- Consider flipping `anonymous_writes` default from `"allow"` to `"warn"`
  for the next major; compatibility-sensitive and not done in this pass.
