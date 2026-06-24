---
path: /embed-graph
locale: en
page_title: Embeddable graph
shell: detail
translation_status: canonical
nav_group: reference
nav_order: 33
---

The Neotoma Inspector graph can be embedded inside another product as a chrome-less iframe — no sidebar, no header, no app shell. Point an iframe at `/embed/graph`, pass `?apiBase=` to target your Neotoma instance, and theme the widget with the same `NEOTOMA_INSPECTOR_SKIN` mechanism used for the full Inspector.

## Quick start

```html
<iframe
  src="https://your-neotoma-host/embed/graph?apiBase=https://your-neotoma-host&node=ent_abc123"
  width="100%"
  height="600"
  frameborder="0"
></iframe>
```

Replace `your-neotoma-host` with the URL of your Neotoma instance. `node=ent_abc123` pre-loads that entity on mount; omit it to start with an empty search field.

## Query parameters

| Parameter | Description |
|---|---|
| `apiBase` | Target API origin (e.g. `https://neotoma.example.com`). Falls back to the Inspector's own configured URL when omitted. |
| `node` | Entity ID or source ID to pre-load on mount. |

## Theming

The embed inherits CSS variable skin tokens from the page. Apply a skin via the existing `NEOTOMA_INSPECTOR_SKIN` or `NEOTOMA_INSPECTOR_SKIN_CONFIG` environment variables — no rebuild required. The `NEOTOMA_INSPECTOR_SKIN=<preset>` variable loads a named preset from `dist/inspector/skins/<name>.json`; `NEOTOMA_INSPECTOR_SKIN_CONFIG=/path/to/custom.json` loads an arbitrary skin file. Palette tokens use the shadcn/Tailwind HSL triplet format (`"hue sat% lum%"`). See the [Inspector reference](/inspector) for the full operator guide.

## postMessage events

When a user double-clicks a node in the embed, the embed emits a `postMessage` to `window.parent`:

```json
{
  "type": "neotoma-inspector-embed:node-dblclick",
  "entity_id": "ent_abc123",
  "source_id": null,
  "raw": { ... }
}
```

Listen in the host page to open the entity in your own UI, navigate to a detail view, or log a selection:

```js
window.addEventListener("message", (event) => {
  if (event.data?.type === "neotoma-inspector-embed:node-dblclick") {
    const { entity_id } = event.data;
    // open entity_id in your product
  }
});
```

The embed does not navigate within itself on double-click (there is no Inspector shell to navigate to). The `postMessage` is the only click-through mechanism.

## Multi-origin isolation

The `?apiBase=` parameter is consumed by an `ApiBaseProvider` context. TanStack Query cache keys are scoped by `apiBase`, so multiple embed instances on the same page targeting different Neotoma origins stay isolated — no cache collisions.

## What this release covers (phases 1–2)

This release implements the first two phases of the embeddable Inspector (#1606):

- **Phase 1** — `ApiBaseProvider` / `useApiBase` context and `*WithBase` query hooks. Zero behavior change when no provider is mounted; the normal Inspector at `/graph` is unchanged.
- **Phase 2** — Chrome-less `/embed/graph` route with `?apiBase=` and `?node=` support, skin token inheritance, and `postMessage` on node double-click.

Later phases (entity-list embed, multi-instance aggregate view) are tracked in #1606 and will ship in subsequent releases.

## The normal `/graph` route is unchanged

Embedding does not affect the standard Inspector graph at `/graph`. Both routes coexist and share the same underlying hooks. The embed route simply omits the app shell and adds the `postMessage` handler.

Shipped in v0.17.0 (PRs #1606, #1698). See the [Inspector reference](/inspector) for the full operator guide, and the [changelog](/changelog) for v0.17.0 release notes.
