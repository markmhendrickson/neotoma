# CLI tests (`tests/cli/`)

## Lane contract: unit / `no DB` vs live HTTP

The CI step labelled **Run unit Vitest suite (no DB)** (`npm run test:unit`) must **not** depend on a live HTTP server. Cases that call a real API on `NEOTOMA_SESSION_DEV_PORT` / `NEOTOMA_HTTP_PORT` belong in the **integration** lane (`npm run test:integration`), **or** must use the shared fail-fast helper:

- `tests/cli/support/live_api_probe.ts` — `resolveTestApiBaseUrl`, `probeLiveApi`, `formatLiveApiUnavailableMessage`
- Probe timeout defaults to **800ms** (≪ Vitest’s global `testTimeout: 60000`)

Sibling sweep search term: `resolveTestApiBaseUrl` under `tests/cli/`.

### Example test title (live-server cue)

```text
issues message --entity-id … --body … --json exercises POST /issues/add_message (requires live API on NEOTOMA_*_PORT)
```

### Example probe-failure message

```text
[COPY: Live API not listening] on 127.0.0.1:18080 (NEOTOMA_SESSION_DEV_PORT / NEOTOMA_HTTP_PORT). [COPY: Start the local server, or run this test in the integration lane.]
```

Set `NEOTOMA_SESSION_DEV_PORT` or `NEOTOMA_HTTP_PORT` to a running local server, or run the case in the integration lane.
