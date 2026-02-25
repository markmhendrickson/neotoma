---
name: Me and get_authenticated_user response updates
overview: Add optional local storage details to GET /me and POST /get_authenticated_user (and MCP get_authenticated_user), keep email as optional, and include Supabase-removal cleanup where relevant.
todos:
  - id: me-storage
    content: Add optional storage object to GET /me when storageBackend is local (actions.ts)
    status: pending
  - id: get-auth-user-storage
    content: Add optional storage to POST /get_authenticated_user and MCP get_authenticated_user when local
    status: pending
  - id: openapi-schemas
    content: Extend OpenAPI and types for /me and get_authenticated_user with optional storage
    status: pending
  - id: remove-auth-ui
    content: Remove all frontend auth UI flows (SigninForm, SignupForm, OAuthButtons, PasswordReset, AuthCallback, pages, AuthDialog)
    status: pending
  - id: supabase-cleanup
    content: Trim auth shim stubs and doc fixes (see plan section)
    status: pending
isProject: false
---

# Me and get_authenticated_user response updates

## Current behavior

- **GET /me** ([src/actions.ts](src/actions.ts) ~1181–1192): returns `{ user_id, email? }`. `email` is set only when the request is authenticated via **session token** (OAuth path in auth middleware); for local dev, key-derived token, or `NEOTOMA_BEARER_TOKEN`, `authenticatedUserEmail` is never set, so `email` is omitted.
- **POST /get_authenticated_user** (same file ~4170–4186): returns `{ user_id }` only.
- **MCP get_authenticated_user** ([src/server.ts](src/server.ts) ~457–469): returns JSON text `{ user_id, authenticated: true }`.

Email is **only** set in [src/actions.ts](src/actions.ts) at line 1163 when `validateSessionToken(bearerToken)` succeeds (session/OAuth). The CLI uses `email` when present for display. The frontend does **not** call `/me`; it uses the **local auth shim** ([frontend/src/lib/auth.ts](frontend/src/lib/auth.ts)) with guest sign-in only (no Supabase).

## Recommendations

### 1. Keep `email` on GET /me (do not remove)

In local mode we do not set it; that's expected. Removing it would break CLI display for OAuth/session users. No change to email handling.

### 2. Add optional `storage` when backend is local

When `config.storageBackend === "local"`, include an optional **storage** object. Source: [src/config.ts](src/config.ts) (`config.dataDir`, `config.sqlitePath`).

- **GET /me**: add `storage?: { storage_backend: "local"; data_dir: string; sqlite_db: string }`.
- **POST /get_authenticated_user** and **MCP get_authenticated_user**: same optional `storage` when local.

### 3. No other new fields for now

Identity (`user_id`, optional `email` on /me) plus optional `storage` is sufficient.

---

## Supabase removal – further cleanup

Supabase-based functionality has been removed: no `@supabase/` in package.json, and the frontend uses a **local auth shim** ([frontend/src/lib/auth.ts](frontend/src/lib/auth.ts)) that mimics a Supabase-like API (getSession, signInAnonymously, signOut, setSession, plus stubs for signInWithOtp, signInWithPassword, signUp, resetPasswordForEmail, signInWithOAuth) that return "disabled in local-only mode."

### Remove all frontend auth UI flows

Remove the components and pages that implement sign-in, sign-up, OAuth, and password-reset flows; they all call auth methods that in local-only mode return "disabled" errors and cannot succeed.

**Files to delete (9):**

- [frontend/src/components/auth/SigninForm.tsx](frontend/src/components/auth/SigninForm.tsx)
- [frontend/src/components/auth/SignupForm.tsx](frontend/src/components/auth/SignupForm.tsx)
- [frontend/src/components/auth/OAuthButtons.tsx](frontend/src/components/auth/OAuthButtons.tsx)
- [frontend/src/components/auth/PasswordReset.tsx](frontend/src/components/auth/PasswordReset.tsx)
- [frontend/src/components/auth/AuthCallback.tsx](frontend/src/components/auth/AuthCallback.tsx)
- [frontend/src/components/auth/SignInPage.tsx](frontend/src/components/auth/SignInPage.tsx)
- [frontend/src/components/auth/SignUpPage.tsx](frontend/src/components/auth/SignUpPage.tsx)
- [frontend/src/components/auth/ResetPasswordPage.tsx](frontend/src/components/auth/ResetPasswordPage.tsx)
- [frontend/src/components/auth/AuthDialog.tsx](frontend/src/components/auth/AuthDialog.tsx)

**Routing:** The current app ([MainApp.tsx](frontend/src/components/MainApp.tsx)) does not mount routes for `/signin`, `/signup`, `/auth/callback`, or `/reset-password`; no route changes are required. If any other entry references these components or paths, remove those references.

### Auth shim trim

After removing the auth UI, [frontend/src/lib/auth.ts](frontend/src/lib/auth.ts) can be trimmed: remove or simplify the Supabase-shaped stubs that were only used by the removed components—`signInWithOtp`, `signInWithPassword`, `signUp`, `resetPasswordForEmail`, `signInWithOAuth`, and `oauth.getAuthorizationDetails`. Keep the minimal set used by AuthContext and any remaining callers: `getSession`, `signInAnonymously`, `signOut`, `onAuthStateChange`, `setSession`.

### Docs and comments

- Correct any in-repo docs that still claim the frontend uses Supabase to "local auth shim" / "guest sign-in only."
- Confirm no Supabase packages or imports remain (already the case).

### Optional (out of scope or follow-up)

- **Frontend identity vs backend:** AuthContext currently provides `user.id` and `sessionToken` from the local shim. Optional improvement: have the frontend call GET /me to show consistent `user_id` and optional storage.
- Historical/competitive docs in `docs/private/` that mention Supabase can stay as-is or be updated in a separate pass.

---

## Implementation summary

| Area                                                       | Change                                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [src/actions.ts](src/actions.ts)                           | GET /me: build response with optional `storage` when `config.storageBackend === "local"`. Keep `user_id` and `email: email ?? undefined`.                          |
| [src/actions.ts](src/actions.ts)                           | POST /get_authenticated_user: same optional `storage` when local.                                                                                                  |
| [src/server.ts](src/server.ts)                             | MCP `getAuthenticatedUser`: when local, include same `storage` in object passed to `buildTextResponse`.                                                            |
| [openapi.yaml](openapi.yaml)                               | Extend GET /me and POST /get_authenticated_user response schemas with optional `storage` object.                                                                   |
| [src/shared/openapi_types.ts](src/shared/openapi_types.ts) | Add optional `storage` to response types for getMe and getAuthenticatedUser (if not generated).                                                                    |
| Frontend auth                                              | See "Remove all frontend auth UI flows" and "Auth shim trim" above: delete 9 auth component files, trim auth shim stubs, doc fixes. Optional: GET /me integration. |

## Response shape (after change)

**GET /me (200):**

```json
{
  "user_id": "...",
  "email": "user@example.com",
  "storage": {
    "storage_backend": "local",
    "data_dir": "/path/to/data",
    "sqlite_db": "/path/to/data/neotoma.db"
  }
}
```

(`email` and `storage` optional. `storage` only when storageBackend is local.)

**POST /get_authenticated_user (200):** same structure (no `email`; optional `storage` when local). **MCP get_authenticated_user:** same fields in JSON text (including `authenticated: true`; optional `storage` when local).

## Testing

- Call GET /me and POST /get_authenticated_user with local backend; assert `storage` is present with correct paths.
- Contract tests: update expectations to allow optional `storage` and keep optional `email` for /me.
- After auth UI removal: verify app loads and guest flow works; no references to removed auth components or routes.
