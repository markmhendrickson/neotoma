Neotoma v0.29.2 is a patch release. This draft supplement collects upgrade notes for changes merged after v0.29.1; release prep completes the remaining sections.

## Highlights

- **Outbound requests to caller-supplied hosts follow the server's bind address.** A server bound beyond loopback refuses webhooks and peer-sync requests to private and internal hosts, whatever `NEOTOMA_HOSTED_MODE` says.

## Behavior changes

- **The outbound host guard now follows the bind host (#2898).** The guard checks the host of every caller-supplied outbound URL: new webhook subscriptions, webhook mirrors, peer health checks, peer sync (pushes and snapshot pulls), conflict resolution with `prefer_remote`, and repo-discovery manifest resolution. It refuses private, loopback, link-local and platform-internal hosts. It used to be off unless `NEOTOMA_HOSTED_MODE` was set. Now the HTTP bind address (`NEOTOMA_HTTP_HOST`) sets the default:
  - Bound to loopback (the default `127.0.0.1`, `localhost` or `::1`): the guard is off. `NEOTOMA_HOSTED_MODE=1` still turns it on (any non-empty value except `0`, `false`, `no` and `off` does).
  - Bound beyond loopback (for example `0.0.0.0`, `::` or a LAN address): the guard is on. No value of `NEOTOMA_HOSTED_MODE` turns it off.
- The v0.24.0 notes say self-hosted installs with `NEOTOMA_HOSTED_MODE` unset need no migration. That no longer holds for a self-hosted server bound beyond loopback. See Breaking changes.

## Breaking changes

**Self-hosted servers bound beyond loopback no longer send webhooks or peer sync to private addresses.**

- **Who is affected:** a self-hosted server with `NEOTOMA_HTTP_HOST` set to a non-loopback address, such as `0.0.0.0`, that sends webhooks or peer sync to private or internal addresses. A typical case is two instances on a home network. One listens on `0.0.0.0`, and its peer or webhook target is `http://192.168.1.20:3180`.
- **What you will see:** these requests are refused before they are sent. The signal depends on where the request comes from:
  - **Existing webhook subscriptions to private hosts stop delivering, and are then switched off for good.** After the upgrade every delivery goes through the guard. Each refused delivery counts as a failure. After `max_failures` failures (10 by default) the subscription is deactivated and stays inactive, even if you later rebind to loopback. The only traces are the server log lines `[subscriptions] webhook POST failed` and `subscription auto-deactivated`. A server that already has such subscriptions sees this first.
  - Creating a webhook subscription fails with `webhook_url must be a public host: private, loopback, link-local, and platform-internal targets are rejected`.   - An inbound peer sync webhook whose configured peer host is private is refused: the receiving server logs `SENDER_PEER_URL_PRIVATE_HOST`, and the sending peer sees `http_500`. `REMOTE_FETCH_FAILED:refused` appears only when a snapshot fetch is redirected to a private host or fails on the network.
  - An outbound peer sync push, a bilateral pull and a peer health check return `peer_url_not_public`. None of them names the refused host.
  - Conflict resolution with `prefer_remote` is refused with ``prefer_remote: `sender_peer_url` must be a public host.``
  - Repo-discovery manifest resolution returns `peer_url_private_host`.
  - A webhook mirror URL is dropped without an error to the caller. Look for `webhook mirror URL rejected as non-public` in the server log.
  - To confirm the guard is on, look for the startup log line that starts with `[outbound_host_guard] on because NEOTOMA_HTTP_HOST is not loopback`.
  - Only `127.0.0.1`, `localhost` and `::1` count as loopback. A bind such as `127.0.0.2` or `[::1]` is treated as non-loopback and turns the guard on.
- **What to do:**
  - After you change the bind or the targets, list your webhook subscriptions and re-activate any that were switched off.
  - For a local-only setup, bind to loopback: unset `NEOTOMA_HTTP_HOST` or set it to `127.0.0.1`. The guard is then off unless `NEOTOMA_HOSTED_MODE` turns it on.
  - To keep a non-loopback bind, point webhooks and peers at publicly routable addresses.
  - No setting turns the guard off on a non-loopback bind. Setting `NEOTOMA_HOSTED_MODE=0` or `false` does not restore the old behavior.

This draft leaves the Security hardening section to release prep, which adds the guard change to it.
