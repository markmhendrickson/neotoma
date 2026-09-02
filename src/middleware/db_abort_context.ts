/**
 * Request-cancellation context for database reads (issue #2217).
 *
 * A client that gives up — an HTTP connection closed, an MCP call cancelled —
 * does not stop the server-side work it started. On the worker-hosted local
 * backend that work is holding a reader-pool slot, and the pool is small: two
 * abandoned reads were enough to make a hosted instance serve nothing while
 * `/health` stayed green, because nothing reclaimed their readers.
 *
 * This middleware binds an AbortSignal that fires when the response closes
 * before it finished, and runs the rest of the request inside
 * {@link withDbAbortSignal}. Reads issued downstream pick the signal up
 * ambiently; when it fires, the reader executing them is terminated and the
 * slot returns to the pool immediately rather than at the query's natural end.
 *
 * Deliberately reads-only. Writes are not abandoned: a caller hanging up
 * mid-write must not leave a half-applied mutation, so `routeWrite` and
 * everything inside a transaction ignore the signal (see
 * `worker_file_database.ts`). Backends other than the worker-hosted one ignore
 * the context entirely, so mounting this is a no-op for them.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { withDbAbortSignal } from "../repositories/worker/worker_file_database.js";

export function dbAbortContext(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const controller = new AbortController();

    // `close` fires on both a completed response and an aborted one. Only the
    // latter should cancel: aborting after a normal finish would tear down a
    // reader that is legitimately serving the NEXT request, since the signal
    // is consulted at dispatch time.
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once("close", onClose);
    res.once("finish", () => res.removeListener("close", onClose));

    withDbAbortSignal(controller.signal, () => {
      next();
    });
  };
}
