/**
 * Side-effect import that declares this process a long-lived server, so
 * `src/config.ts` picks a DB backend appropriate to it:
 *
 *     import "./process_role.js";
 *
 * Servers get the worker-hosted backend (statements off the event loop);
 * one-shot CLI processes keep the synchronous driver, where the worker spawn
 * would be pure overhead. See `defaultDbBackend()` in src/config.ts.
 *
 * Ordering is NOT load-bearing: config resolves the backend lazily, at first
 * DB use, so importing this after config still takes effect. Entrypoints
 * nonetheless import it first, so the declaration is visible at the top of the
 * file rather than buried.
 *
 * Why an entrypoint import rather than an env var in the Dockerfile or fly
 * config: the same server code runs from `npm run start:server`, the Docker
 * CMD, launchd, and the dev watcher. Marking the entrypoint covers all of them
 * at once and cannot drift the way a value duplicated across five deployment
 * files does. neotoma#2280 is precisely that drift — the non-blocking backend
 * existed for a month behind an env var that no deployment ever set.
 *
 * The flag itself lives in process_role_state.ts (see the note there on why it
 * is not an env var).
 */

import { markServerProcess } from "./process_role_state.js";

markServerProcess();
