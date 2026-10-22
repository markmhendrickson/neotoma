import { AsyncLocalStorage } from "node:async_hooks";
import type { NeotomaConfiguration } from "../config.js";
import type { DbDatabase } from "../repositories/db/driver.js";

interface OperationScope {
  context: EmbeddedRuntimeContext;
  active: boolean;
}

const currentOperation = new AsyncLocalStorage<OperationScope>();

export interface EmbeddedRuntimeContextOptions {
  database: DbDatabase;
  configuration: Readonly<NeotomaConfiguration>;
  /** Adapter objects remain caller-owned. This internal seam does not admit capabilities. */
  adapters: Readonly<Record<string, unknown>>;
  /** An injected handle remains caller-owned unless explicitly transferred. */
  databaseOwnership?: "caller" | "runtime";
}

/**
 * Internal per-runtime resource scope for the shared operation kernel.
 * Does not initialize schema, import the legacy dispatcher, or authorize data access.
 */
export class EmbeddedRuntimeContext {
  readonly database: DbDatabase;
  readonly configuration: Readonly<NeotomaConfiguration>;
  readonly adapters: Readonly<Record<string, unknown>>;
  private readonly ownsDatabase: boolean;
  private state: "open" | "closing" | "closed" = "open";
  private activeOperations = 0;
  private idleResolve?: () => void;
  private disposal?: Promise<void>;

  constructor(options: EmbeddedRuntimeContextOptions) {
    if (
      options.databaseOwnership !== undefined &&
      options.databaseOwnership !== "caller" &&
      options.databaseOwnership !== "runtime"
    ) {
      throw new Error("EXPLICIT_RUNTIME_OWNERSHIP_INVALID");
    }
    this.database = options.database;
    const configuration = structuredClone(options.configuration);
    Object.freeze(configuration.encryption);
    Object.freeze(configuration.iconGeneration);
    Object.freeze(configuration.oauthTrustedCallbackUrls);
    this.configuration = Object.freeze(configuration);
    this.adapters = Object.freeze({ ...options.adapters });
    this.ownsDatabase = options.databaseOwnership === "runtime";
  }

  async run<T>(operation: () => Promise<T> | T): Promise<T> {
    if (this.state !== "open") throw new Error("EXPLICIT_RUNTIME_CLOSED");
    const scope: OperationScope = { context: this, active: true };
    this.activeOperations += 1;
    try {
      return await currentOperation.run(scope, operation);
    } finally {
      scope.active = false;
      this.activeOperations -= 1;
      if (this.activeOperations === 0) this.idleResolve?.();
    }
  }

  dispose(): Promise<void> {
    const scope = currentOperation.getStore();
    if (scope?.context === this && scope.active) {
      return Promise.reject(new Error("EXPLICIT_RUNTIME_DISPOSE_INSIDE_OPERATION"));
    }
    if (this.disposal) return this.disposal;
    this.state = "closing";
    const idle =
      this.activeOperations === 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            this.idleResolve = resolve;
          });
    this.disposal = idle
      .then(async () => {
        if (this.ownsDatabase) await this.database.close();
      })
      .finally(() => {
        this.state = "closed";
      });
    return this.disposal;
  }
}

/** Expired async descendants must fail rather than fall through to the ambient database. */
export function getEmbeddedRuntimeContext(): EmbeddedRuntimeContext | null {
  const scope = currentOperation.getStore();
  if (!scope) return null;
  if (!scope.active) throw new Error("EXPLICIT_RUNTIME_OPERATION_EXPIRED");
  return scope.context;
}
