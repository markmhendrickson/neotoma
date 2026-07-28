# Security review — v0.18.9

**Base:** v0.18.8 · **Head:** `claude/issue-1943-keyset-pagination`
**`npm run security:classify-diff`:** `sensitive=true`
**Flagged surface:** `openapi-security: openapi.yaml`, `auth-middleware: src/actions.ts`
**Verdict: ship — no security regression.**

## Why the classifier flagged `sensitive=true`

Both hits are path-based, not behavioural:

- **`openapi.yaml`** — the diff adds a `cursor` request param, a `next_cursor` response field, and a `400` response declaration to `POST /entities/query`. No security scheme, scope, or auth requirement is touched.
- **`src/actions.ts`** — the diff touches `handleApiError` (a new `CursorError` branch) and `sendValidationError` (lifts a structured `hint` to `details.hint`). Neither is on the authentication or authorization path. `getAuthenticatedUserId` is unchanged, and the `/entities/query` route's auth posture is unchanged.

## Assessment per changed area

**Cursor token contents.** The cursor is base64url-encoded JSON: `{v, sort_by, sort_order, entity_id}`. It carries no PII, no user identifier, no auth material, and no capability — only an entity id the caller has already been served in the previous page's response body, plus the sort contract. Base64url is an encoding, not encryption, and is not treated as one: nothing in the token is secret.

**No authorization bypass via cursor.** The cursor only supplies a seek position (`WHERE id > :cursor`). Every other filter — including `user_id` scoping from `getAuthenticatedUserId` — is applied independently on each request, exactly as on the offset path. A cursor minted by user A and replayed by user B yields user B's rows from that position, not user A's: the token cannot widen scope because it carries none. Cross-user scoping is covered by the existing `tests/security/cross_user_read_scoping.test.ts`.

**Cursor tampering.** A forged or edited token fails `decodeCursor` validation (version, `sort_by`, `sort_order`, non-empty `entity_id`) and returns `400 INVALID_CURSOR`. A structurally-valid token with an arbitrary `entity_id` is not a vulnerability — it seeks to a position within the caller's own authorized result set.

**New rejection paths are fail-closed.** Both tightenings (`offset > 2000`, `limit > 500` with snapshots) reject at the request-schema layer before any query executes. They narrow what the server accepts; they cannot widen it.

**Resource exhaustion — improved.** This release *reduces* the DoS surface it was written to fix. The pre-fix deep-offset path let one unauthenticated-cost request monopolize the single Node event loop for 4.8–7.5s. Both new bounds cap that, and the keyset path makes deep pagination O(page) instead of O(offset).

**`details.hint` lift.** The lifted value is a static, developer-authored migration string from a module constant — never user input, never interpolated from the request. No injection or reflection surface.

**Index addition.** `observations(entity_id, source_priority, observed_at)` is a read-performance index. No schema change, no data migration, no access-path change.

## Conclusion

Ship. Two path-based classifier hits, neither touching auth. The release's net security effect is positive: it closes an event-loop-exhaustion vector reachable by any authenticated caller, and adds two fail-closed request bounds.
