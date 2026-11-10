import type { Worker } from "node:worker_threads";
import type { WorkerFileDatabase } from "../../src/repositories/worker/worker_file_database.js";

/** Hold a real pinned worker while its caller's deadline/cleanup can expire. */
type HeldConnection = {
  worker: Worker;
  request(
    op: string,
    sql: string,
    params: unknown[],
    options: { signal: AbortSignal }
  ): Promise<unknown>;
};

function hold(connection: HeldConnection, signal: AbortSignal) {
  const flags = new Int32Array(new SharedArrayBuffer(8));
  const worker = connection.worker;
  const pending = connection.request("get", "__hold_for_test__", [flags.buffer], { signal });
  return {
    worker,
    flags,
    pending,
    release: () => {
      Atomics.store(flags, 1, 1);
      Atomics.notify(flags, 1);
    },
  };
}

export function holdPinnedWorker(database: WorkerFileDatabase) {
  const owned = database as unknown as {
    pinnedReader: HeldConnection;
    pinnedReadAbort: AbortController;
  };
  return hold(owned.pinnedReader, owned.pinnedReadAbort.signal);
}

export function holdOrdinaryWorker(database: WorkerFileDatabase, signal: AbortSignal) {
  const owned = database as unknown as { readers: HeldConnection[] };
  return hold(owned.readers[0], signal);
}
