# Per-Client Hosted Instance Deployment (Fly.io)

## Scope

This document covers deploying a **named, per-client (instance-per-tenant)
Neotoma app** to Fly.io — a private hosted instance for one client, distinct
from both the public sandbox (`docs/subsystems/sandbox_deployment.md`) and the
generic single-app deploy guide (`docs/infrastructure/deployment.md`).

It exists because a per-client deploy is **not** the default `flyctl deploy`
against the repo's own `fly.toml`, and several of its differences are silent
foot-guns: a wrong flag produces a running-but-broken instance (sandbox banner,
blank Inspector, or a volume conflict) rather than a clear failure.

This guide names **no specific client**. The concrete binding for any given
client instance — which Fly app, which domain, which secret set — is operator
data and lives in a Neotoma config entity (see
[Operator-specific binding](#operator-specific-binding) below), never in this
public repo. The July 2026 privacy scrub deliberately removed client-specific
Fly config from the repo; do not reintroduce it.

## The deploy that works

```bash
# From a CLEAN checkout of origin/main (see "Deploy from main" below).
# /tmp worktrees get wiped between sessions — use a stable path.
git worktree add ~/repos/neotoma-deploy origin/main
cd ~/repos/neotoma-deploy

flyctl deploy \
  --app "$CLIENT_FLY_APP" \
  --build-arg VITE_NEOTOMA_SANDBOX_UI="" \
  --build-arg VITE_PUBLIC_BASE_PATH="/" \
  --no-cache
```

Everything below explains why each of those pieces is load-bearing.

## The five load-bearing rules

### 1. Deploy from `main`, not a feature branch

As of PR #1924 (2026-07-17, merged as `213d28273`) the full client feature
stack — Inspector "Sign in" OAuth, Google sign-in by approved-email allowlist,
shared-graph opt-in, contact v1.1 schema, company resolution — is **on main**.
The old "deploy only from branch X, never main" special case is retired and was
a repeated source of breakage. Deploy from a clean `origin/main` checkout.

### 2. Pass `--app <name>` explicitly — do NOT rely on `-c fly.toml`

The repo's `fly.toml` declares `app = 'neotoma-sandbox'`. A bare `flyctl deploy`
in the repo therefore targets the **sandbox app**, not the client instance.
Always pass `--app "$CLIENT_FLY_APP"` explicitly. Read the app name from the
operator binding (below), never hardcode it here.

### 3. Never use `fly.sandbox.toml` for a client instance

`fly.sandbox.toml` is for the public sandbox only. It sets:

- `VITE_NEOTOMA_SANDBOX_UI = "1"` → renders the "Public sandbox" banner, wrong
  for a private client instance.
- a `persistent_sandbox` volume → conflicts with the client instance's own
  `data` volume.

Deploying a client instance with `-c fly.sandbox.toml` produces a
running-but-wrong instance. Use `--app` + explicit `--build-arg`s instead.

### 4. Keep the sandbox UI off: `VITE_NEOTOMA_SANDBOX_UI=""`

A private client instance is not the public sandbox. The Dockerfile already
defaults this arg to `""`, but pass it explicitly so an inherited environment
value can't flip the banner on.

### 5. Base path must resolve to `/` — pass `VITE_PUBLIC_BASE_PATH="/"`

The Dockerfile defaults `VITE_PUBLIC_BASE_PATH="/inspector/"` (the router
basename for installs that reach the Inspector at `/inspector`). A client
instance that serves the Inspector at the **site root** must build with `"/"`,
or `<Router basename="/inspector">` cannot match `/` and the Inspector renders
a **blank page**.

Only `fly.sandbox.toml` overrides this to `/` automatically. Since a client
deploy must NOT use that file (rule 3), you must pass
`--build-arg VITE_PUBLIC_BASE_PATH="/"` yourself. This is the single most
common silent break: a healthy server behind a blank landing page.

## Secrets

Each client instance needs its own secret set, materialized from the private
secrets store (`ateles-private`, SOPS+age — see `docs/secrets_management.md`),
never committed here. At minimum:

| Secret | Purpose |
|---|---|
| `NEOTOMA_BEARER_TOKEN` | API/MCP auth for the instance |
| `SOPS_AGE_KEY` | (CI only) decrypt the offline secrets snapshot |
| `OPENAI_API_KEY` | embeddings (optional; snapshots gate on it) |
| Google OIDC allowlist config | approved-email Google sign-in, if enabled |

Set via `flyctl secrets set --app "$CLIENT_FLY_APP" KEY=value`. Secrets persist
on the Fly app across code-only deploys.

## Always-on

Per-client instances should not scale to zero (an auth session dies with the
machine, and the next request pays a cold-start). Set on the Fly app itself
(survives code-only deploys):

- `auto_stop_machines = "off"`
- `min_machines_running = 1`

## Operator-specific binding

The concrete per-client values — Fly app name, public domain, region, which
secrets, whether Google sign-in is enabled — are **operator/client data**, not
repo content. They live in a Neotoma config entity (a `deploy_target` /
`vendor_binding`) resolved at deploy time, so:

- this public repo names no client, and
- a deploy agent (see below) can redeploy the right instance without a human
  recalling the flags.

A deploy runner reads the binding, then executes [the deploy that
works](#the-deploy-that-works) with `$CLIENT_FLY_APP` and the build args filled
in from it.

## Swarm-managed redeploys

Redeploying a client instance is a mechanical, well-specified operation — a good
candidate for the swarm to own rather than a human running `flyctl` by hand.
The intended shape:

1. A `deploy_target` Neotoma entity per client instance holds the binding.
2. A deploy capability (Apus or a dedicated deploy agent) reads the target,
   checks out a clean `origin/main`, and runs the deploy with the correct
   `--app` and build args.
3. Post-deploy it verifies `/health` and the landing page render before
   reporting success — catching the blank-page (rule 5) and sandbox-banner
   (rules 3/4) failure modes automatically.

This closes the loop that made the manual path fragile: the knowledge of *how*
to deploy each instance lives in the repo (this doc) and *which* instance lives
in Neotoma, so no single wrong flag silently ships a broken instance.

## Related

- `docs/infrastructure/deployment.md` — generic single-app Fly deploy.
- `docs/subsystems/sandbox_deployment.md` — the public sandbox.
- `docs/infrastructure/multi_tenant_deployment_topology.md` — when to run
  instance-per-tenant vs shared-node.
- `docs/secrets_management.md` — SOPS+age secret materialization.
