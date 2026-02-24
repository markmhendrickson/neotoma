/** Thrown when user exits a prompt via Cmd+D (EOF). Init catches and exits 0. */
export class InitAbortError extends Error {
  constructor() {
    super("Init aborted by user (EOF)");
    this.name = "InitAbortError";
  }
}
