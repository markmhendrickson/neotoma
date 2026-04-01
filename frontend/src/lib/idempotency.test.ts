import { describe, expect, it } from "vitest";
import { createIdempotencyKey } from "./idempotency";

describe("createIdempotencyKey", () => {
  it("returns the same key for equivalent objects with different property order", async () => {
    const a = {
      z: 1,
      nested: { b: 2, a: 1 },
      items: [{ y: 2, x: 1 }, "value"],
    };
    const b = {
      items: [{ x: 1, y: 2 }, "value"],
      nested: { a: 1, b: 2 },
      z: 1,
    };

    await expect(createIdempotencyKey(a)).resolves.toBe(await createIdempotencyKey(b));
  });

  it("returns different keys for different payloads", async () => {
    const first = await createIdempotencyKey({ entity_type: "task", name: "alpha" });
    const second = await createIdempotencyKey({ entity_type: "task", name: "beta" });

    expect(first).not.toBe(second);
    expect(first.startsWith("idemp_")).toBe(true);
  });
});
