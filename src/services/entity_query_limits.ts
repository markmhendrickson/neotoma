// #1943: pagination bounds for entity queries. Kept in a standalone,
// dependency-free module (no `db` import) so both the request-schema layer
// (src/shared/action_schemas.ts) and the query implementation
// (src/services/entity_queries.ts) can share them without the schema layer
// transitively pulling in the database driver.

/**
 * Hard cap on how many visible rows the legacy `offset` path will
 * scan-and-discard in JS. Offset pagination is O(offset) and blocks the event
 * loop; keyset cursors are the supported way to page deep. Requests whose
 * `offset` exceeds this bound are rejected at the request-schema layer with a
 * message pointing at `cursor`, so the unbounded deep scan can no longer be
 * triggered even by a legacy client. Set comfortably above the reported
 * production repro depth (offset:1300) so that exact back-compat case keeps
 * working under the legacy path while still bounding worst-case scan cost.
 */
export const MAX_QUERY_OFFSET = 2000;

/**
 * Hard cap on page size when `include_snapshots:true`, so a single call cannot
 * ask the server to synchronously hydrate an unbounded number of full snapshots
 * (each is a JSON blob + provenance + raw_fragments join) on the event loop.
 * Lightweight (`include_snapshots:false`) listings are not capped here.
 * Enforced at the request-schema layer.
 */
export const MAX_SNAPSHOT_PAGE_SIZE = 500;
