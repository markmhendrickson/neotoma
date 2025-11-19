# External Importers

Neotoma ingests data from third-party services through modular **connectors**. Each connector knows how to authenticate, fetch updates, normalize records, and store them inside the canonical `records` table.

## Connector schema recap

- `external_connectors` stores provider metadata, encrypted secrets (AES-256-GCM), cursor positions, and status fields.
- `external_sync_runs` tracks importer executions (start/completion timestamps, counts, cursor snapshots).
- `records` exposes `external_source`, `external_id`, and `external_hash` columns so imports can upsert deterministically.

## OAuth-capable providers

Some providers (starting with Gmail) require OAuth instead of manual token entry. Provider definitions in `src/integrations/providers/metadata.ts` now describe their OAuth needs (authorization URL, token URL, scopes, PKCE requirement, etc.).

### Environment variables

| Variable | Description |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth client ID created in Google Cloud Console |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` *(optional)* | Override callback URL if it is not `http(s)://<api-host>/oauth/google/callback` |
| `PUBLIC_URL` *(optional)* | Public base URL for the HTTP Actions server; used to build callback URLs |

> **Note:** Leave `GOOGLE_OAUTH_REDIRECT_URI` empty during local development. The server will default to `http://localhost:<HTTP_PORT>/oauth/google/callback`.

### Flow

1. Frontend POSTs `POST /oauth/:provider/start` with the user’s bearer token to obtain an authorization URL (state + PKCE challenge are generated).
2. User is redirected to the provider’s OAuth consent page.
3. Provider calls `GET /oauth/:provider/callback` with the authorization code.
4. The server exchanges the code for tokens, fetches the user's profile (email), and upserts or updates an `external_connectors` row with encrypted secrets.
5. The user is redirected back to the UI with `?oauth=success&provider=gmail`.

State entries expire after 10 minutes and are tied to the bearer token used to initiate the flow.

### HTTP endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/oauth/:provider/start` | Returns `authorization_url` for the provider |
| `GET` | `/oauth/:provider/callback` | Handles provider redirects, exchanges codes, and persists connectors |

Existing management endpoints remain:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/import/providers` | List registered providers + capabilities |
| `GET` | `/connectors` | List stored connectors (secrets redacted) |
| `POST` | `/import/:provider/link` | Manual token/linking flow (non-OAuth providers) |
| `POST` | `/import/:provider/sync` | Trigger importer runs |
| `DELETE` | `/connectors/:id` | Remove a connector |

## Running importers

- CLI: `npm run import:connector -- --connector-id <uuid>` or `--provider gmail`.
- HTTP/MCP: `/import/:provider/sync` or `sync_external_connector` tool.

Each run updates `external_sync_runs`, maintains cursors, and uses `upsertExternalRecords` so repeated syncs stay idempotent.

## Frontend UX

`frontend/src/components/KeyManagementDialog.tsx` now exposes an “Integrations” tab:

- OAuth-ready providers (e.g., Gmail) show a single **Connect** button that launches the OAuth flow.
- Legacy/manual providers still expose the token form for backfilling credentials.
- The list of connected integrations shows status, labels, and last sync timestamps with quick **Sync**/**Delete** actions.

## Testing

- `src/services/__tests__/oauth_state.test.ts` covers PKCE state creation and expiration.
- Provider client tests live under `src/integrations/providers/__tests__`.

# External Importers

Neotoma ingests social and productivity data from the same pipeline, using **connectors** that wrap each provider’s API. Connectors persist OAuth credentials (encrypted), cursors, and sync history so that the importer service can run initial backfills and incremental refreshes without custom code for every source.

## Provider Catalog (popularity order)

| Rank | Provider (id) | Category | Canonical record(s) | Key capabilities |
|------|---------------|----------|---------------------|------------------|
| 1 | X / Twitter (`x`) | Social | `message`, `media_asset` | Tweets, quoted threads, media metrics |
| 2 | Facebook (`facebook`) | Social | `message`, `media_asset` | Page/user feed posts, stories, attachments |
| 3 | Instagram (`instagram`) | Social | `media_asset` | Photos, reels, captions, engagement |
| 4 | LinkedIn (`linkedin`) | Social | `message` | Company/user posts, comments |
| 5 | TikTok (`tiktok`) | Social | `media_asset` | Videos, likes, shares |
| 6 | Snapchat (`snapchat`) | Social | `media_asset`, `message` | Stories, Spotlight |
| 7 | YouTube (`youtube`) | Social | `media_asset` | Videos, playlists, stats |
| 8 | Pinterest (`pinterest`) | Social | `media_asset` | Pins, boards |
| 9 | Reddit (`reddit`) | Social | `message` | Posts, comments |
| 10 | Tumblr (`tumblr`) | Social | `note`, `media_asset` | Blog posts |
| 11 | Threads (`threads`) | Social | `message` | Threads posts/replies |
| 12 | Discord (`discord`) | Social | `message` | Guild/channel messages |
| 13 | Telegram (`telegram`) | Social | `message` | Channel updates, chats |
| 14 | WhatsApp Business (`whatsapp-business`) | Social | `message` | Conversations |
| 15 | WeChat (`wechat`) | Social | `message` | Official account broadcasts |
| 16 | Line (`line`) | Social | `message` | Channel conversations |
| 17 | Gmail (`gmail`) | Productivity | `message` | Emails, labels, snippet |
| 18 | Outlook (`outlook`) | Productivity | `message` | Exchange mail |
| 19 | Microsoft Teams (`microsoft-teams`) | Productivity | `message` | Channel chats |
| 20 | Slack (`slack`) | Productivity | `message` | Workspace channels/DMs |
| 21 | Notion (`notion`) | Productivity | `note`, `task` | Pages, databases |
| 22 | Asana (`asana`) | Productivity | `task` | Tasks, projects |
| 23 | Trello (`trello`) | Productivity | `task` | Cards, boards |
| 24 | Monday.com (`monday`) | Productivity | `task` | Items, boards |
| 25 | ClickUp (`clickup`) | Productivity | `task` | Tasks, docs |
| 26 | Jira (`jira`) | Productivity | `task` | Issues, sprints |
| 27 | Linear (`linear`) | Productivity | `task` | Issues, cycles |
| 28 | Basecamp (`basecamp`) | Productivity | `task`, `message` | To-dos, message boards |
| 29 | Airtable (`airtable`) | Productivity | `note` | Rows/records |
| 30 | Google Drive (`google-drive`) | Productivity | `media_asset` | Files, revisions |
| 31 | OneDrive (`onedrive`) | Productivity | `media_asset` | Files, sharing metadata |
| 32 | Box (`box`) | Productivity | `media_asset` | Files, comments |
| 33 | Dropbox (`dropbox`) | Productivity | `media_asset` | Files, revisions |
| 34 | Evernote (`evernote`) | Productivity | `note` | Notes, notebooks |
| 35 | Confluence (`confluence`) | Productivity | `note` | Pages, spaces |
| 36 | Salesforce (`salesforce`) | Productivity | `note`, `task` | Leads, activities |
| 37 | HubSpot (`hubspot`) | Productivity | `note`, `task` | Deals, engagements |
| 38 | Zendesk (`zendesk`) | Productivity | `task` | Tickets, comments |
| 39 | Intercom (`intercom`) | Productivity | `message`, `task` | Conversations, tickets |
| 40 | Front (`front`) | Productivity | `message` | Shared inbox threads |
| 41 | Calendly (`calendly`) | Productivity | `event` | Scheduling webhooks |
| 42 | Google Calendar (`google-calendar`) | Productivity | `event` | Calendars, attendees |
| 43 | Apple Calendar (`apple-calendar`) | Productivity | `event` | CalDAV events |
| 44 | Zoom (`zoom`) | Productivity | `event`, `media_asset` | Meetings, recordings |
| 45 | Google Meet (`google-meet`) | Productivity | `event`, `media_asset` | Meetings, recordings |
| 46 | Microsoft Graph (`microsoft-graph`) | Productivity | `event`, `task` | Outlook calendar/tasks |
| 47 | Todoist (`todoist`) | Productivity | `task` | Tasks, sections |

Only five providers (X, Facebook, Instagram, Gmail, Asana) have fully implemented clients today; the remaining providers already appear in the catalog for UI, connector registration, and scheduling. Each entry declares `providerType`, default record type, capabilities, and preferred OAuth scopes so the UI can present consistent onboarding instructions.

## Record normalization

Every importer emits canonical Neotoma record types:

| Provider family | Canonical types | Typical properties |
|-----------------|-----------------|--------------------|
| Social posts (X, Facebook, Instagram, Reddit, Threads) | `message`, `media_asset` | `external_id`, `text/caption`, `engagement_stats`, `permalink`, `media` |
| Messaging platforms (Slack, Teams, Discord, Telegram, WhatsApp, Front) | `message` | `thread_id`, `channel`, `participants`, `attachments`, `reactions` |
| Task / issue trackers (Asana, Jira, Linear, ClickUp, Todoist) | `task` | `name`, `status`, `assignee`, `due_on`, `project`, `tags`, `custom_fields` |
| Notes / docs (Notion, Evernote, Confluence, Airtable) | `note` | `title`, `content`, `workspace`, `url`, `engagement_stats` |
| Email (Gmail, Outlook, Front) | `message` | `subject`, `to`, `from`, `snippet`, `label_ids`, `thread_id` |
| Calendar / scheduling (Calendly, Google Calendar, Zoom) | `event` | `start`, `end`, `attendees`, `location`, `conference` |
| File storage (Drive, Box, Dropbox, OneDrive) | `media_asset` | `file_name`, `mime_type`, `size`, `sharing`, `version` |

`external_source` and `external_id` columns ensure upserts are idempotent. Providers without stable IDs fall back to deterministic `external_hash` values (e.g., hashed subject + timestamp for legacy email exports).

## Connectors & schema

`supabase/schema.sql` now defines:

- `external_connectors`: connector metadata, secrets (AES-256-GCM envelope stored in `secrets_envelope`), OAuth scopes, cursors, and `provider_type`.
- `external_sync_runs`: execution log for each importer run (status, stats, cursor snapshot, error payload).
- `records` table columns `external_source`, `external_id`, `external_hash` plus a unique `(external_source, external_id)` index for fast dedupe.

Set `CONNECTOR_SECRET_KEY` (32+ chars) to enable secret encryption:

```bash
CONNECTOR_SECRET_KEY="long-random-string"
```

## Creating connectors

1. Call the HTTP endpoint:

```bash
curl -X POST http://localhost:8080/import/gmail/link \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "account_identifier": "founder@example.com",
    "metadata": { "label": "Founder inbox" },
    "secrets": { "accessToken": "ya29.a0Af..." }
  }'
```

2. (Optional) List existing connectors:

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/connectors
```

3. Trigger syncs via HTTP, MCP, or CLI:

```bash
curl -X POST http://localhost:8080/import/gmail/sync \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "connector_id": "uuid-here", "limit": 25 }'

npm run import:connector -- --connector-id uuid-here --limit 50
```

The MCP tool `sync_provider_imports` mirrors the HTTP endpoint so ChatGPT Actions can pull live data inside conversations.

## Sync orchestration

`src/services/importers.ts` coordinates runs:

1. Loads connector + secrets (`external_connectors`).
2. Resolves provider client (`src/integrations/providers/*`) and fetches data in pages.
3. Normalizes each record → `upsertExternalRecords`, ensuring `(external_source, external_id)` uniqueness and embedding/summary generation when configured.
4. Marks removed items via `markExternalRecordRemoved`.
5. Persists cursors + timestamps on the connector row and records run status inside `external_sync_runs`.

### Scheduling

Use the provided CLI or Fly.io cron (see README) to run `npm run import:connector -- --provider gmail --max-pages 5` on a desired cadence. For hosted deployments, pair this with Fly Machines or a GitHub Actions workflow and ensure the environment includes `CONNECTOR_SECRET_KEY`, Supabase credentials, and provider-specific secrets (handled out-of-band).

### Webhooks

`POST /import/:provider/webhook` currently acknowledges events and logs payloads; provider-specific webhook validators can hook into this endpoint to trigger immediate incremental syncs in a follow-up release.




