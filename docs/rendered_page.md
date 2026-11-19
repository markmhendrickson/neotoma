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

### Copyable prompts and code

Mark a complete preformatted block with `data-copyable` to get a renderer-owned
Copy button. Copying preserves the block's full `textContent`, including literal
characters, nested code spans, line breaks and a trailing newline. It never copies
the button or its status message.

```html
<pre data-copyable><code>Paste this entire prompt into your agent.</code></pre>
```

Optional attributes on that `pre` customize plain-text labels:
`data-copy-label`, `data-copied-label`, `data-copy-success` and
`data-copy-failure`. For example, `data-copy-label="Copiar petición"` changes the
button label. Authors provide no JavaScript or inline event handlers.

The template creates controls only for opted-in blocks. Two enforced CSP policies
intersect: one allows only the immutable helper's exact SHA-256 hash, and the other
permits inline scripts but has no external-script sources. Together they permit
only the fixed inline helper; arbitrary author scripts, event handlers, external
script requests and dynamic code remain blocked. Copy-enabled documents use an
opaque-origin sandbox (`allow-scripts` without `allow-same-origin`) so the helper
cannot access the app's origin, storage or cookies. Pages without copyable blocks
retain the script-free policy.

Copying runs only after a button click. The helper tries synchronous clipboard
copying while user activation is held, then the write-only Clipboard API. If both
fail, it selects the full block and displays a manual-copy instruction; it does
not report a successful copy. Verify the clipboard through the intended reader's
browser before reporting a copy affordance as working.

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

### Link lifetime and renewal

- A link works for the shorter of its stored lifetime and the currently configured `NEOTOMA_GUEST_TOKEN_TTL_SECONDS`, counted from when it was minted. The default is 30 days.
- Raising the setting does not extend links that were minted with a shorter lifetime; lowering it shortens links that already exist.
- A link covers only the page it was minted for. Revoking it, or narrowing or shortening it with a correction, takes effect on the next request; records added later can only narrow a link, never extend it.
- To renew, call `publish_rendered_page` again for the page. It mints a fresh link; the old one expires on its own schedule.
- A request that also carries a signed agent identity is judged by that identity's own grant. A guest token presented alongside it is never treated as a grant for another page.
- `GET /entities/:id/relationships?expand_entities=true` expands a related entity for a guest only when that guest could open it through `GET /entities/:id`. A related entity that is not expanded still shows its id and the relationship type on each relationship row, with no name, type or content.
- Deleting a link's token record refuses the link, and restoring the record does not lift that. A token record that was merged, or that took part in a merge or split, refuses the link rather than combining records. Like every later record, these can only narrow a link.
- A refused link returns `401` with code `GUEST_TOKEN_INVALID` when it is unknown, malformed or unreadable, expired, revoked or deleted, or when it is sent to a route that does not accept links (for example `/entities/:id/markdown`). It returns `403` with code `GUEST_TOKEN_SCOPE` when it is valid but does not cover the requested item. If the token records cannot be read from storage the response is a `5xx`, never a grant.

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
