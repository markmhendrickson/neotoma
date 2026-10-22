import { afterEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import type { DbDatabase } from "../../src/repositories/db/driver.js";
import { EmbeddedRuntimeContext } from "../../src/core/runtime_context.js";
import { createEmbeddedRuntimeConfiguration } from "../../src/core/runtime_configuration.js";
import { initializeFreshEmbeddedDatabase } from "../../src/core/runtime_database.js";
import { createInternalReadKernel } from "../../src/core/read_kernel.js";
import { createOperations } from "../../src/core/operations.js";
import { OperationError } from "../../src/core/operation_error.js";
import { lifecycleDatabaseScope } from "../../src/repositories/db/scope.js";

const resources: Array<{ context: EmbeddedRuntimeContext; database: AsyncSqliteDatabase }> = [];
function runtime(database: DbDatabase) {
  return new EmbeddedRuntimeContext({
    database,
    configuration: createEmbeddedRuntimeConfiguration({
      dataDirectory: join(process.cwd(), ".vitest", "read-kernel"),
      packageRoot: process.cwd(),
    }),
    legacyIdentityPolicy: { tenantScopedEntityIds: false },
    attributionPolicy: { anonymous_writes: "allow" },
    adapters: {},
  });
}
async function fixture() {
  const database = new AsyncSqliteDatabase(":memory:");
  const context = runtime(database);
  resources.push({ context, database });
  await initializeFreshEmbeddedDatabase(context);
  const userId = randomUUID();
  const operations = createOperations({ userId });
  const entityType = "kernel_note";
  await context.run(() =>
    operations.executeTool("register_schema", {
      entity_type: entityType,
      schema_version: "1.0",
      activate: true,
      user_specific: true,
      schema_definition: {
        fields: { title: { type: "string" }, value: { type: "number" } },
        canonical_name_fields: ["title"],
      },
      reducer_config: {
        merge_policies: { title: { strategy: "last_write" }, value: { strategy: "last_write" } },
      },
    })
  );
  const stored = await context.run(() =>
    operations.store({
      entities: [{ entity_type: entityType, title: "Shared fixture", value: 1 }],
      idempotency_key: "first",
    })
  );
  const id = (stored.entities as Array<{ entity_id: string }>)[0].entity_id;
  await new Promise((resolve) => setTimeout(resolve, 2));
  await context.run(() =>
    operations.correct({
      entity_id: id,
      entity_type: entityType,
      field: "value",
      value: 2,
      idempotency_key: "second",
    })
  );
  return { database, context, userId, id, operations };
}
afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.context.dispose();
    await resource.database.close();
  }
});

describe("bounded internal shared read kernel", () => {
  it("returns the existing owned history page and refuses every unconverted name without fallback", async () => {
    const { context, userId, id } = await fixture();
    const binding = { runtime: context, userId };
    const kernel = createInternalReadKernel(binding);
    binding.userId = randomUUID();
    try {
      const page = await kernel.listObservations({ entity_id: id });
      expect(page.observations.map((row) => row.fields.value)).toEqual([2, 1]);
      expect(page.total).toBe(2);
      const recent = page.observations[0].observed_at;
      const single = await kernel.execute("list_observations", {
        entity_id: id,
        limit: 1,
        offset: 1,
      });
      expect(single.observations.map((row) => row.fields.value)).toEqual([1]);
      expect(single.total).toBe(2);
      for (const name of ["updated_since", "created_since"])
        expect(
          (await kernel.execute("list_observations", { entity_id: id, [name]: recent }))
            .observations
        ).toHaveLength(1);
      for (const name of ["retrieve_entity_snapshot", "register_schema", "store", "unknown"]) {
        await expect(kernel.execute(name, { entity_id: id })).rejects.toMatchObject({
          name: "OperationError",
        });
      }
      await expect(kernel.execute("npm_check_update", { entity_id: id })).rejects.toSatisfy(
        (error: OperationError) => error.toErrorEnvelope().error_code === "NETWORK_DISABLED"
      );
      await expect(
        lifecycleDatabaseScope.run({ database: {} as DbDatabase, active: true }, () =>
          kernel.listObservations({ entity_id: id })
        )
      ).rejects.toSatisfy(
        (error: OperationError) => error.toErrorEnvelope().error_code === "DB_QUERY_FAILED"
      );
      const foreign = createInternalReadKernel({ runtime: context, userId: randomUUID() });
      expect((await foreign.listObservations({ entity_id: id })).observations).toEqual([]);
      await foreign.dispose();
      expect(
        (await kernel.execute("list_observations", { entity_id: id, user_id: randomUUID() })).total
      ).toBe(2);
      await expect(
        kernel.execute("list_observations", { entity_id: id, limit: 0 })
      ).rejects.toSatisfy(
        (error: OperationError) =>
          error.toErrorEnvelope().error_code === "VALIDATION_INVALID_FORMAT"
      );
    } finally {
      await kernel.dispose();
    }
  });

  it("drains active reads and preserves the borrowed runtime and database", async () => {
    const { context, userId, id, database } = await fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const original = database.prepare.bind(database);
    const spy = vi.spyOn(database, "prepare").mockImplementation((sql) => {
      const statement = original(sql);
      if (sql.startsWith("SELECT * FROM observations")) {
        const all = statement.all.bind(statement);
        statement.all = async (...args) => {
          started();
          await gate;
          return all(...args);
        };
      }
      return statement;
    });
    const kernel = createInternalReadKernel({ runtime: context, userId });
    const reading = kernel.listObservations({ entity_id: id });
    await ready;
    try {
      let disposed = false;
      const closing = kernel.dispose().then(() => {
        disposed = true;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(disposed).toBe(false);
      await expect(kernel.listObservations({ entity_id: id })).rejects.toBeInstanceOf(
        OperationError
      );
      release();
      expect((await reading).total).toBe(2);
      await closing;
      await kernel.dispose();
      spy.mockRestore();
      const another = createInternalReadKernel({ runtime: context, userId });
      expect((await another.listObservations({ entity_id: id })).total).toBe(2);
      await another.dispose();
      expect(await database.prepare("SELECT 1 AS usable").get()).toEqual({ usable: 1 });
    } finally {
      release();
      await reading;
      spy.mockRestore();
      await kernel.dispose();
    }
  });

  it("returns neutral DB errors without closing or reopening an injected failed handle", async () => {
    const failure = Object.assign(new Error("private backend detail"), { code: "SQLITE_IOERR" });
    const close = vi.fn();
    const prepare = vi.fn(() => ({
      get: async () => {
        throw failure;
      },
      all: async () => {
        throw failure;
      },
    }));
    const context = runtime({ prepare, close } as unknown as DbDatabase);
    const kernel = createInternalReadKernel({ runtime: context, userId: randomUUID() });
    try {
      for (const operation of ["store", "unknown", "npm_check_update", "toString", "__proto__"])
        await expect(kernel.execute(operation, { entity_id: "fixture" })).rejects.toBeInstanceOf(
          OperationError
        );
      await expect(
        kernel.execute("retrieve_field_provenance", { entity_id: "fixture" })
      ).rejects.toSatisfy(
        (error: OperationError) =>
          error.toErrorEnvelope().error_code === "VALIDATION_INVALID_FORMAT"
      );
      expect(prepare).not.toHaveBeenCalled();
      await expect(kernel.listObservations({ entity_id: "fixture" })).rejects.toSatisfy(
        (error: OperationError) =>
          error.toErrorEnvelope().error_code === "DB_QUERY_FAILED" &&
          !error.message.includes("private")
      );
      expect(close).not.toHaveBeenCalled();
    } finally {
      await kernel.dispose();
      await context.dispose();
    }
  });
});
