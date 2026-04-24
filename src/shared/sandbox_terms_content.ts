/**
 * Canonical sandbox terms-of-use text. Shared by the HTTP JSON endpoint
 * (`GET /sandbox/terms` via `src/services/sandbox/terms.ts`) and the
 * marketing-site HTML page (`/sandbox/terms-of-use`).
 *
 * Keep aligned with `docs/subsystems/sandbox_deployment.md` — policy
 * changes should bump version and effective date together.
 */

export const SANDBOX_TERMS_VERSION = "1.0.0";
export const SANDBOX_TERMS_EFFECTIVE_DATE = "2026-04-23";
export const SANDBOX_WEEKLY_RESET_UTC = "Sunday 00:00 UTC";
export const SANDBOX_ABUSE_REPORT_EMAIL = "abuse@neotoma.io";

export const SANDBOX_TERMS_MARKDOWN = `# Neotoma Public Sandbox — Terms of Use

This deployment at sandbox.neotoma.io is a public, read/write demo of
Neotoma intended to let developers evaluate the product without installing
it locally.

## What you agree to by using it

- **All data is public.** Anything you store is visible to every other
  sandbox user. Do not submit personal information, credentials, internal
  business data, or anything you would not be comfortable publishing.
- **Data is wiped weekly** at ${SANDBOX_WEEKLY_RESET_UTC}. The dataset is
  re-seeded from a fixed set of synthetic fixtures and public-domain text.
- **No abuse.** Do not submit illegal content, harassment, spam, or content
  that violates third-party rights. Violations may be purged out-of-cycle
  and the submitting IP rate-limited or blocked.
- **No production use.** The sandbox is for evaluation only. Uptime,
  correctness, and data durability are explicitly best-effort.
- **Rate-limited writes.** Writes are capped per-IP to keep the demo
  responsive. The HTTP API returns 429 when you exceed the limit.
- **Destructive admin routes are disabled.** Entity merge/split, schema
  deletion, and snapshot-recomputation return 403. Install Neotoma
  locally for the full admin surface.

## Reporting abuse or PII leaks

- Use the in-app **Report abuse** link in the Inspector banner, or POST
  directly to \`/sandbox/report\`.
- For urgent issues, email ${SANDBOX_ABUSE_REPORT_EMAIL}.
- Reports receive an access_token. Save it — it is the only way to check
  resolution status later.

## Privacy

- We log request IPs at the edge for abuse investigation. IPs are hashed
  before being stored in any abuse report record.
- Emails, phone numbers, and API tokens present in submitted content are
  automatically redacted to \`<LABEL:hash>\` placeholders.
- No cookies or accounts are required.

## No warranty

The sandbox is provided "as is" without warranty of any kind.
`;
