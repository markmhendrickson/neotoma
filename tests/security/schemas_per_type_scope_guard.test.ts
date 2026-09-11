/**
 * Per-type schema read must validate `user_id`, not trust it.
 *
 * Regression gate for GHSA-f48j-993h-g6qr. `GET /schemas/:entity_type`
 * initialised its user scope directly from `req.query.user_id` and ran its own
 * Bearer/session handling, never calling `getAuthenticatedUserId`. Its sibling
 * `GET /schemas` resolves the same query value through that guard. So one route
 * treated the value as a *request* for a scope to be validated against the
 * authenticated principal, and the other treated it as the scope itself.
 *
 * Why that matters mechanically: `loadActiveSchema(entityType, userId)` prefers
 * a user-scoped `schema_registry` row over the global one (the multi-tenancy
 * model restated in commit 49a0508e9). Naming another principal's id therefore
 * selects that principal's override wherever such a row exists.
 *
 * The planted negative is the second case below — it fails against the pre-fix
 * handler, which is what makes this file evidence rather than decoration. The
 * positive controls around it pin the legitimate callers the fix must not break:
 * a caller passing their OWN user_id, and a caller passing none at all (the CLI
 * and eval-harness default, which must still resolve the global row).
 *
 * The route is driven in-process behind a principal-stamping shim rather than
 * over a listening socket, for the same reason
 * `ed25519_forged_key_auth_bypass.test.ts` drives its target function directly:
 * a 127.0.0.1 request resolves to LOCAL_DEV_USER_ID, for which
 * getAuthenticatedUserId *intentionally* honours a user_id override (CLI and dev
 * flows). Asserting through that boot mode would be tautological — it would pass
 * pre-fix. Stamping a non-dev principal is what exercises the guard.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";

const PREFIX = "schemas_scope_guard_test";

/** The entity_type both principals hold a user-scoped override for. */
const ENTITY_TYPE = `${PREFIX}_type_${randomUUID().slice(0, 8)}`;

const ALICE_ID = randomUUID();
const BOB_ID = randomUUID();

/** Marker fields, unique per principal, so a leak is detectable by value alone. */
const ALICE_MARKER = `${PREFIX}_alice_only`;
const BOB_MARKER = `${PREFIX}_bob_only`;
const GLOBAL_MARKER = `${PREFIX}_global`;

async function seedSchemaRow(opts: {
  scope: "global" | "user";
  userId: string | null;
  marker: string;
  version: string;
}): Promise<void> {
  await db.from("schema_registry").insert({
    id: randomUUID(),
    entity_type: ENTITY_TYPE,
    schema_version: opts.version,
    schema_definition: JSON.stringify({
      entity_type: ENTITY_TYPE,
      schema_version: opts.version,
      fields: { [opts.marker]: { type: "string" } },
    }),
    reducer_config: JSON.stringify({}),
    active: 1,
    scope: opts.scope,
    user_id: opts.userId,
    created_at: new Date().toISOString(),
  });
}

/**
 * Extract the real `GET /schemas/:entity_type` handler off the app's router and
 * remount it behind a shim that stamps an arbitrary principal — exactly what the
 * auth middleware does for a validated Bearer or session token. This runs the
 * route's own code, not a reimplementation of it.
 */
function buildHarness(): express.Express {
  const layer = (app as unknown as { _router: { stack: any[] } })._router.stack.find(
    (l: any) => l.route?.path === "/schemas/:entity_type" && l.route?.methods?.get
  );
  if (!layer) throw new Error("could not locate the GET /schemas/:entity_type route layer");
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;

  const harness = express();
  harness.get("/schemas/:entity_type", (req, res, next) => {
    // `as_user` selects which principal the middleware is pretending to have
    // resolved. Omitting it models a request the middleware resolved to nobody.
    const asUser = req.query.as_user as string | undefined;
    if (asUser) {
      (req as any).authenticatedUserId = asUser;
      (req as any).principal = { kind: "user", userId: asUser };
    }
    return handler(req, res, next);
  });
  return harness;
}

describe("GET /schemas/:entity_type validates user_id against the principal (GHSA-f48j-993h-g6qr)", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Global row plus a user-scoped override for each principal. This is the
    // shape the advisory describes: where multiple principals hold user-scoped
    // rows, the pre-fix path returns whichever the caller names.
    await seedSchemaRow({ scope: "global", userId: null, marker: GLOBAL_MARKER, version: "1.0.0" });
    await seedSchemaRow({ scope: "user", userId: ALICE_ID, marker: ALICE_MARKER, version: "2.0.0" });
    await seedSchemaRow({ scope: "user", userId: BOB_ID, marker: BOB_MARKER, version: "3.0.0" });

    server = createServer(buildHarness());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected a TCP listen address");
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    await db.from("schema_registry").delete().eq("entity_type", ENTITY_TYPE);
  });

  async function get(query: Record<string, string>) {
    const qs = new URLSearchParams(query).toString();
    const res = await fetch(`${baseUrl}/schemas/${ENTITY_TYPE}?${qs}`);
    const json: any = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  /**
   * `schema_definition` comes back as a JSON string on this route, so parse
   * before reading fields rather than indexing into a string and silently
   * getting `[]` — an accessor that always returns empty would make the
   * negative assertions below pass for the wrong reason.
   */
  function fieldsOf(json: any): string[] {
    const def = json?.schema_definition;
    const parsed = typeof def === "string" ? JSON.parse(def) : def;
    return Object.keys(parsed?.fields ?? {});
  }

  it("returns the caller's own user-scoped schema when they pass their own user_id", async () => {
    // Positive control: the legitimate case the guard must keep working.
    const { status, json } = await get({ as_user: ALICE_ID, user_id: ALICE_ID });
    expect(status).toBe(200);
    expect(fieldsOf(json)).toContain(ALICE_MARKER);
    // The row's own scope columns confirm which partition was resolved.
    expect(json.user_id).toBe(ALICE_ID);
    expect(json.scope).toBe("user");
  });

  it("does NOT return another principal's schema when the caller names their user_id", async () => {
    // THE PLANTED NEGATIVE. Pre-fix, `userId` came straight off the query and
    // loadActiveSchema resolved Bob's override for an Alice-authenticated
    // caller. Post-fix the guard refuses the mismatch outright.
    const { status, json } = await get({ as_user: ALICE_ID, user_id: BOB_ID });

    expect(status).toBe(403);
    // Refused as a scope mismatch, and no schema payload resolved at all — not
    // Bob's row, not a fallback row dressed up as an answer. (The 403 body does
    // echo the rejected id in its `detail`, which is the caller's own input and
    // the repo's existing diagnostic for this class; the assertion is about the
    // schema, which must be absent.)
    expect(json.error_code).toBe("FORBIDDEN");
    expect(json.schema_definition).toBeUndefined();
    expect(fieldsOf(json)).not.toContain(BOB_MARKER);
  });

  it("resolves the caller's own scope when no user_id is supplied", async () => {
    // The CLI and eval-harness default: no --user-id, so the principal decides.
    const { status, json } = await get({ as_user: ALICE_ID });
    expect(status).toBe(200);
    expect(fieldsOf(json)).toContain(ALICE_MARKER);
    expect(fieldsOf(json)).not.toContain(BOB_MARKER);
  });

  it("falls back to the global row for a principal holding no override", async () => {
    // Built-in / global schema discovery is unchanged by the fix.
    const { status, json } = await get({ as_user: randomUUID() });
    expect(status).toBe(200);
    expect(fieldsOf(json)).toContain(GLOBAL_MARKER);
    expect(fieldsOf(json)).not.toContain(ALICE_MARKER);
    expect(fieldsOf(json)).not.toContain(BOB_MARKER);
  });

  it("fails closed when the middleware resolved no principal", async () => {
    // Pre-fix, an unresolved request still got the caller-supplied scope,
    // because the route never asked who was calling.
    const { status, json } = await get({ user_id: BOB_ID });
    expect(status).toBe(401);
    expect(JSON.stringify(json)).not.toContain(BOB_MARKER);
  });
});
