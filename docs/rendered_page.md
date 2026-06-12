# rendered_page

A `rendered_page` is a bespoke HTML expression of something — a proposal page, public memo, report, one-pager, or shareable narrative. It is intentionally **distinct from the data entities it describes**: the `rendered_page` holds presentation, and `REFERS_TO` relationships link it to the data. Keeping presentation separate from data prevents evidence (`source`) and presentation from colliding, and keeps every other entity type from growing presentation fields it doesn't need.

## Fields

| Field              | Required | Notes                                                                                                                                                           |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`            | ✓        | Rendered into `<title>` and the `<h1>` if `html_body` has no header override.                                                                                   |
| `html_body`        | ✓        | Injected **verbatim** into `<body>`. **Do not include `<html>`/`<head>`/`<body>` wrappers** — the server wraps it in a minimal template. Not escaped on render. |
| `meta_description` |          | Optional `<meta name=description>`; escaped on render.                                                                                                          |
| `custom_css`       |          | Optional CSS injected as an inline `<style>` in `<head>`.                                                                                                       |
| `slug`             |          | Optional URL-safe identifier; reserved for future pretty-URL routing (`/p/<slug>`).                                                                             |
| `created_at`       |          | Page creation timestamp.                                                                                                                                        |

## Serving

A `rendered_page` is served as standalone HTML at:

```
GET /entities/:id/html
```

This route 404s for any entity type other than `rendered_page`, keeping the publish surface explicit.

## Guest access (sharing with a non-user)

The schema ships `guest_access_policy: submitter_scoped`. A **bare** `…/entities/:id/html` URL therefore **401s for an unauthenticated viewer**. To share the page with someone outside the operator's account, the URL must carry a guest token:

```
GET /entities/:id/html?access_token=<guest_token>
```

The token is a `guest_access_token` scoped to that page's entity id.

### The one-step path: `publish_rendered_page`

Rather than minting the token by hand, call the **`publish_rendered_page`** MCP tool. It:

1. accepts an existing `rendered_page` `entity_id`, **or** inline `{ title, html_body, custom_css, meta_description }` to create one first;
2. mints a `guest_access_token` scoped to that entity;
3. returns the ready-to-share `…/entities/<id>/html?access_token=<token>` URL plus `ttl_seconds`.

Notes:

- The existing-entity path is **owner-scoped**: you can only publish a `rendered_page` you own (tenant isolation).
- Guest tokens are stored **hash-only** (SHA-256) at rest; the raw token cannot be recovered, so each call mints a fresh token rather than re-returning a prior one.
- Token lifetime is bounded by `NEOTOMA_GUEST_TOKEN_TTL_SECONDS` (default 30 days).

## Example

```jsonc
// 1. store a rendered_page (or pass these inline to publish_rendered_page)
{
  "entity_type": "rendered_page",
  "title": "Q3 Preview",
  "html_body": "<h1>Q3 Preview</h1><p>…</p>",
  "custom_css": "body { font-family: system-ui; max-width: 42rem; margin: 2rem auto; }"
}

// 2. publish_rendered_page → returns:
{
  "entity_id": "ent_…",
  "share_url": "https://…/entities/ent_…/html?access_token=…",
  "access_token": "…",
  "ttl_seconds": 2592000,
  "created": false
}
```
