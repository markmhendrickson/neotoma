# Guest Access Policy

Guest access policies control what AAuth-verified callers — who are _not_ admitted via a specific `agent_grant` — can do with each entity type. This is complementary to the per-agent grant system: grants whitelist specific agents, while guest access policies define default capabilities for any authenticated guest.

## Policy Modes

From most restrictive to most open:

| Mode | Writes | Reads | Scope |
|------|--------|-------|-------|
| `closed` (default) | No | No | — |
| `read_only` | No | Yes | All |
| `submit_only` | Yes | No | — |
| `submitter_scoped` | Yes | Yes | Own entities only |
| `open` | Yes | Yes | All |

## Guest tokens

A guest token (the `access_token` query parameter or `Authorization: Bearer`, minted for example by `publish_rendered_page`) is checked in one place on every guest-readable route, alongside the mode above:

- On `GET /entities/:id` and `GET /entities/:id/html`, a valid token that names the requested entity grants read access to that entity whatever its type's mode, including `closed`. A merged entity is not served through a token, and a deleted entity answers `404`.
- On the other guest-readable routes (`/entities/:id/observations`, `/entities/:id/relationships`, the issue, subscription and event-stream routes), a caller that holds only a token must present one that covers the requested item (it names the item, or, for an issue, it is the submitter's token), and the type's mode must also allow the operation.
- Writes follow the mode; a token never takes precedence over it on a write route.
- `GET /entities/:id/relationships?expand_entities=true` expands a related entity for a non-owner caller only when that caller could read it through `GET /entities/:id`.
- A token that is unknown, malformed, expired, revoked or deleted, or presented as `access_token` on a route that does not accept tokens, returns `401 GUEST_TOKEN_INVALID`. A valid token for an item it does not cover returns `403 GUEST_TOKEN_SCOPE`. Lifetime and renewal are described in [`docs/rendered_page.md`](../rendered_page.md).
- An AAuth agent admitted through a matching `agent_grant` that presents no guest token reads `GET /entities/:id` and its `/observations`, `/relationships` and `/html` sub-routes as its grant owner, so the mode does not apply to it there.

## Configuration

### SchemaMetadata (recommended)

Guest access policy is declared on `SchemaMetadata.guest_access_policy`. This makes the policy observable (schema metadata changes create observations), auditable, and manageable via the Inspector and CLI.

```typescript
export interface SchemaMetadata {
  // ... other fields ...
  guest_access_policy?: "closed" | "read_only" | "submit_only" | "submitter_scoped" | "open";
}
```

Set via CLI:

```bash
neotoma access set <entity_type> <mode>
neotoma access reset <entity_type>
neotoma access list
```

`neotoma access reset <entity_type>` clears any deprecated config-file fallback
for the entity type and, when a schema exists, writes an explicit `closed`
policy to SchemaMetadata. If a higher-precedence environment variable still
applies, the CLI reports that remaining effective source instead of claiming the
effective policy is closed.

Access mutations are local-only today. `neotoma access set`, `reset`, `enable-issues`, and `disable-issues`
reject `--base-url` / `--api-only` (and the equivalent `NEOTOMA_BASE_URL` / `NEOTOMA_API_ONLY`
overrides) instead of pretending to change a remote instance.

Shortcut for issue submission types:

```bash
neotoma access enable-issues   # sets issue, conversation, conversation_message to submitter_scoped
neotoma access disable-issues  # resets all three to closed
```

### Resolution Precedence

When resolving the effective policy for an entity type, the following sources are checked in order (highest priority first):

1. **Environment variable** `NEOTOMA_ACCESS_POLICY_<ENTITY_TYPE_UPPERCASED>=<mode>` — operator escape hatch for quick overrides without schema mutation.
2. **SchemaMetadata.guest_access_policy** on the active schema row — the canonical source. Managed via `neotoma access set`.
3. **Config file** `~/.config/neotoma/config.json` under `access_policies` — **deprecated fallback**. Kept for backward compatibility with pre-v0.12 installs. A deprecation warning is logged when this source is used. Migrate to SchemaMetadata via `neotoma access set <type> <mode>`.
4. **Default**: `closed`.

`neotoma access list` uses the same effective precedence and omits entries whose
winning policy is the default `closed`.

### Default Seeds

The following entity types are seeded with `guest_access_policy: "submitter_scoped"` at schema registration:

- `issue` — via `seed_issue_schema.ts`
- `conversation` — via code-defined fallback in `schema_definitions.ts`
- `conversation_message` — via code-defined fallback in `schema_definitions.ts`

These defaults enable the GitHub Issues submission pipeline for external agents out of the box.

On startup, issue schema seeding also repairs active `issue` schema rows from
older installs that are missing `metadata.guest_access_policy`, including
user-scoped rows. The repair preserves any valid explicit operator policy (for
example `closed`) and only fills a missing or invalid value with
`submitter_scoped`.

## API

### GET /access_policies

Returns the effective resolved policy for every entity type that has a non-default (non-`closed`) policy.
Resolution follows the same precedence as runtime authorization: env var,
SchemaMetadata, deprecated config fallback, then default. Effective `closed`
policies are omitted from the map because they match `default_mode`.

**Response:**

```json
{
  "policies": {
    "issue": "submitter_scoped",
    "conversation": "submitter_scoped",
    "conversation_message": "submitter_scoped"
  },
  "default_mode": "closed"
}
```

Requires authentication.

## Inspector

Guest access policies are visible in two places in the Inspector:

1. **Schema detail page** — a "Guest Access Policy" card shows the schema metadata policy for that entity type; callers should use the effective policy API when env/config precedence matters.
2. **Access Policies page** (`/access-policies`) — a global table listing all entity types with non-default policies. Linked from the sidebar.

## Deprecation: Config File

The `~/.config/neotoma/config.json` `access_policies` section is deprecated as of v0.12. It remains as the lowest-priority fallback for types that do not yet have a schema in the registry. A warning is logged whenever a policy is resolved from this source.

To migrate:

```bash
neotoma access set <entity_type> <mode>
```

This writes `guest_access_policy` to SchemaMetadata, which takes priority over the config file.
