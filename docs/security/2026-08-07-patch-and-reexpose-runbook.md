# Patch-and-re-expose runbook — 2026-08-07 hotfix

The operator's personal instance and the bottega8 client instance are OFFLINE
because they ran the vulnerable code. This runbook gets a **patched** build live
and verified-safe before any instance accepts public traffic again.

## Key principle: patch is decoupled from disclosure

`flyctl deploy` builds from the **local working directory**, not from a git
remote. So the instance can be patched from the hotfix worktree with **no GitHub
push, PR, tag, or npm publish**. Protecting the operator's own data does NOT wait
on public-disclosure logistics.

- **Patch track (do first):** local deploy of the hotfix worktree → probe → re-expose.
- **Disclosure track (decoupled, follows):** draft private GHSAs → push branch →
  PR → tag → release → npm publish. This is for *other operators and the advisory
  record*, on its own timeline.

**Caveat — not a substitute for the push.** A local deploy means the running code
exists only in the worktree and on Fly, in version control nowhere. Acceptable for
hours/days to stop the bleeding; NOT a permanent state. The push still happens — it
just stops gating uptime. Do not delete the hotfix worktree until the branch is
pushed.

## ⚠️ Do NOT deploy from origin/main

The standard client-deploy runbook says "deploy from a clean origin/main checkout."
That is WRONG here: origin/main (`9a21de393`, v0.21.3) contains the vulnerable
code. Deploy from the **hotfix worktree** instead:

    /Users/markmhendrickson/repos/neotoma-wt-sec-advisories
    (branch hotfix/v0.21.4-ed25519-auth-and-sortby-sqli)

## Deploy binding — VERIFIED via flyctl 2026-08-07

Confirmed directly against Fly (read-only `flyctl` queries), not from a stale
Neotoma snapshot:

- App: `neotoma-markmhendrickson` (Fly org `neotoma`), **status: suspended**.
- **No machines exist** — the app was suspended by destroying its machine. The
  deploy will CREATE a new machine and attach it to the existing volume. This is
  why `--primary-region ams` is mandatory (see below).
- Volume `vol_4ojlng96ng9kql2r`: `ams`, 20GB, **encrypted**, 30-day snapshot
  retention, scheduled snapshots on, currently **unattached** (STATE: created).
  **Operator data is intact and backed up on this volume.**
- Public IPs allocated: v4 `66.241.124.140` (shared), v6 dedicated. DNS
  `neotoma.markmhendrickson.com` still resolves to the fly.dev host.
- Machine sizing target: 2 vCPU / 4096MB (a deploy can reset to 1GB; re-apply after).

Confirm still current before deploying:

    flyctl status --app neotoma-markmhendrickson
    flyctl volumes list --app neotoma-markmhendrickson    # vol in ams, unattached
    flyctl machine list  --app neotoma-markmhendrickson    # expect none pre-deploy

Once Neotoma is back, still cross-check the `deployment_configuration` entity for
build-args/secret-names/gotchas narrative (the flyctl facts above cover
app/region/volume/sizing, which is what gates a safe deploy).

## ⚠️ There is NO natural shielded window — DNS is live and IPs are public

Because DNS already points at Fly and the app has public ingress IPs, a normal
deploy makes the instance PUBLIC the instant the machine boots. The patched build
is deployed, so this is exposing the FIX, not the vulnerable code — but choose a
shielding posture deliberately:

- **Option A (true-shielded, belt-and-suspenders):** release the public IPs,
  deploy, probe over `flyctl proxy` (private WireGuard tunnel), then re-add IPs
  only after the probe passes. Zero public seconds on unverified-in-prod code.

      flyctl ips release 66.241.124.140 --app neotoma-markmhendrickson
      flyctl ips release <v6> --app neotoma-markmhendrickson
      # deploy (below), then:
      flyctl proxy 8080:3180 --app neotoma-markmhendrickson   # reach at http://127.0.0.1:8080
      bash scripts/security/adversarial_probe.sh --host http://127.0.0.1:8080 --entity-type contact
      # on PASS, re-allocate:
      flyctl ips allocate-v4 --shared --app neotoma-markmhendrickson
      flyctl ips allocate-v6 --app neotoma-markmhendrickson

- **Option B (short patched-public window, simpler):** deploy, then immediately
  probe the public host. The exposure is "patched + being verified", categorically
  different from the vulnerable exposure that was taken down. Acceptable given the
  deployed code is the fix.

## Operator steps (need your Fly credentials — I cannot run these)

### 1. Deploy the patched build from the hotfix worktree

    cd /Users/markmhendrickson/repos/neotoma-wt-sec-advisories
    # confirm you are on the hotfix branch with the 4 fix commits:
    git log --oneline -4
    # deploy from LOCAL code (not origin/main), per-instance config, ams region:
    flyctl deploy -c fly.operator.toml \
      --app neotoma-markmhendrickson \
      --primary-region ams \
      --build-arg VITE_NEOTOMA_SANDBOX_UI="" \
      --build-arg VITE_PUBLIC_BASE_PATH="/" \
      --build-arg NEOTOMA_GIT_SHA="$(git rev-parse HEAD)"

Shielding: DNS is NOT dark and the app has public IPs, so this instance goes
public the moment the machine boots. Use Option A above (release IPs → deploy →
probe via `flyctl proxy` → re-add IPs) for zero public-unverified seconds, or
Option B (deploy then immediately probe the public host) — the deployed code is
the patched build either way.

### 2. Re-apply machine sizing if the deploy reset it (per the gotchas note)

    flyctl machine list --app neotoma-markmhendrickson
    flyctl machine update <machine-id> --app neotoma-markmhendrickson --vm-cpus 2 --vm-memory 4096 --yes
    flyctl ssh console --app neotoma-markmhendrickson -C 'free -m'   # expect ~3917, not ~962

### 3. Confirm the patched build is serving

    curl -s https://<direct-fly-url-or-shielded-host>/ | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["git_sha"])'
    # must equal the HEAD you deployed, NOT 9a21de393 / caa30f8c

## My step (I run this — the gate)

### 4. Adversarial probe against the shielded, patched instance

    bash scripts/security/adversarial_probe.sh --host https://<shielded-target> --entity-type contact

Gate: exits 0 = every adversarial probe rejected → safe to re-expose. Exits 1 =
a live exposure remains → DO NOT re-expose; investigate. Specifically, probe [2]
(forged key + nil-UUID) returning 200-with-data means the auth bypass is still
live.

## Operator step — re-expose only after the gate passes

### 5. Restore public traffic

Re-point DNS / remove the firewall scope. Then re-run the probe against the PUBLIC
hostname as a final confirmation.

## After the instance is safe — the disclosure track (decoupled)

Once your instance is patched, probed, and back up, the GitHub/release work
proceeds on its own timeline — it no longer blocks anything:

1. Draft the two private GHSAs from `docs/security/advisories/2026-08-07-*.md`;
   request CVEs; stamp the version placeholders (`X.Y.Z` → the release tag,
   `<first-affected>` → the earliest affected version).
2. Push `hotfix/v0.21.4-...`; open the PR.
3. Tag + GitHub Release + npm publish per the release skill.
4. Deploy bottega8 the same way (steps 1–5 above, its own app/region from its
   deployment_configuration), before it re-accepts public traffic.

## Rollback

A local deploy is reversible: `flyctl releases --app neotoma-markmhendrickson`
then `flyctl deploy --image <prior-release-image> --app ...`, or
`flyctl machine restart`. Nothing public was published, so there is no external
artifact to unwind.
