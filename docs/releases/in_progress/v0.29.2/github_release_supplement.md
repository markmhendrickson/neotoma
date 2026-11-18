Neotoma v0.29.2 is a patch release. This draft supplement collects upgrade notes for changes merged after v0.29.1; release prep completes the remaining sections.

## Highlights

- **Outbound requests to caller-supplied hosts follow the server's bind address.** A server bound beyond loopback refuses webhooks and peer-sync requests to private and internal hosts, whatever `NEOTOMA_HOSTED_MODE` says.

## Behavior changes

- **The outbound host guard now follows the bind host (#2898).** The guard checks the host of every caller-supplied outbound URL: subscription webhooks, webhook mirrors, peer health checks and peer sync. It refuses private, loopback, link-local and platform-internal hosts. It used to be off unless `NEOTOMA_HOSTED_MODE` was set. Now the HTTP bind address (`NEOTOMA_HTTP_HOST`) sets the default:
  - Bound to loopback (the default `127.0.0.1`, `localhost` or `::1`): the guard is off. `NEOTOMA_HOSTED_MODE=1` still turns it on.
  - Bound beyond loopback (for example `0.0.0.0`, `::` or a LAN address): the guard is on. No value of `NEOTOMA_HOSTED_MODE` turns it off.
- The v0.24.0 notes say self-hosted installs with `NEOTOMA_HOSTED_MODE` unset need no migration. That no longer holds for a self-hosted server bound beyond loopback. See Breaking changes.

## Breaking changes

**Self-hosted servers bound beyond loopback no longer send webhooks or peer sync to private addresses.**

- **Who is affected:** a self-hosted server with `NEOTOMA_HTTP_HOST` set to a non-loopback address, such as `0.0.0.0`, that sends webhooks or peer sync to private or internal addresses. A typical case is two instances on a home network. One listens on `0.0.0.0`, and its peer or webhook target is `http://192.168.1.20:3180`.
- **What you will see:** these requests are refused before they are sent. A peer snapshot fetch fails with `REMOTE_FETCH_FAILED:refused`. Webhook deliveries and peer health checks to those hosts are not sent; the fetch fails with an error that names the refused host.
- **What to do:**
  - For a local-only setup, bind to loopback: unset `NEOTOMA_HTTP_HOST` or set it to `127.0.0.1`. The guard is then off unless `NEOTOMA_HOSTED_MODE` turns it on.
  - To keep a non-loopback bind, point webhooks and peers at publicly routable addresses.
  - No setting turns the guard off on a non-loopback bind. Setting `NEOTOMA_HOSTED_MODE=0` or `false` does not restore the old behavior.
