import { describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

vi.mock("../../src/services/schema_registry.js", () => ({
  schemaRegistry: {
    loadActiveSchema: vi.fn().mockResolvedValue(null),
  },
}));

import { observationReducer } from "../../src/reducers/observation_reducer.js";

describe("fixture replay snapshots", () => {
  it("matches expected contact snapshot output", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-02-01T00:00:00.000Z"));

    const observations = [
      {
        id: "obs_20240102",
        entity_id: "ent_test_contact",
        entity_type: "contact",
        schema_version: "1.0",
        source_id: "src_contact_02",
        observed_at: "2024-01-02T00:00:00Z",
        specificity_score: 1.0,
        source_priority: 100,
        fields: {
          name: "Jane Doe",
          email: "jane@example.com",
        },
        created_at: "2024-01-02T00:00:00Z",
        user_id: "usr_test",
      },
      {
        id: "obs_20240101",
        entity_id: "ent_test_contact",
        entity_type: "contact",
        schema_version: "1.0",
        source_id: "src_contact_01",
        observed_at: "2024-01-01T00:00:00Z",
        specificity_score: 1.0,
        source_priority: 100,
        fields: {
          name: "Jane Doe",
          phone: "555-0100",
        },
        created_at: "2024-01-01T00:00:00Z",
        user_id: "usr_test",
      },
    ];

    const snapshot = await observationReducer.computeSnapshot(
      "ent_test_contact",
      observations
    );

    const expectedPath = path.join(
      process.cwd(),
      "tests/fixtures/expected/contact_snapshot.json"
    );
    const expectedRaw = await fs.readFile(expectedPath, "utf-8");
    const expected = JSON.parse(expectedRaw);

    expect(snapshot).toEqual(expected);

    vi.useRealTimers();
  });

  it("matches expected transaction snapshot output", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-02-01T00:00:00.000Z"));

    const observations = [
      {
        id: "obs_tx_20240103",
        entity_id: "ent_test_transaction",
        entity_type: "transaction",
        schema_version: "1.0",
        source_id: "src_tx_03",
        observed_at: "2024-01-03T00:00:00Z",
        specificity_score: 1.0,
        source_priority: 100,
        fields: {
          amount: 42.5,
          currency: "USD",
          merchant: "Example Market",
        },
        created_at: "2024-01-03T00:00:00Z",
        user_id: "usr_test",
      },
      {
        id: "obs_tx_20240101",
        entity_id: "ent_test_transaction",
        entity_type: "transaction",
        schema_version: "1.0",
        source_id: "src_tx_01",
        observed_at: "2024-01-01T00:00:00Z",
        specificity_score: 1.0,
        source_priority: 100,
        fields: {
          status: "posted",
        },
        created_at: "2024-01-01T00:00:00Z",
        user_id: "usr_test",
      },
    ];

    const snapshot = await observationReducer.computeSnapshot(
      "ent_test_transaction",
      observations
    );

    const expectedPath = path.join(
      process.cwd(),
      "tests/fixtures/expected/transaction_snapshot.json"
    );
    const expectedRaw = await fs.readFile(expectedPath, "utf-8");
    const expected = JSON.parse(expectedRaw);

    expect(snapshot).toEqual(expected);

    vi.useRealTimers();
  });
});
