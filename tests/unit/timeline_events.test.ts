import { describe, expect, it } from "vitest";
import {
  deriveTimelineEventsFromSnapshot,
  toISODate,
} from "../../src/services/timeline_events.js";

describe("timeline_events", () => {
  it("derives events from ISO fields not in legacy whitelist (e.g. started_at)", () => {
    const rows = deriveTimelineEventsFromSnapshot(
      "conversation",
      "ent_1",
      "src_1",
      "user_1",
      {
        title: "x",
        started_at: "2024-06-01T12:00:00.000Z",
      }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].source_field).toBe("started_at");
    expect(rows[0].event_timestamp).toMatch(/^2024-06-01/);
  });

  it("skips denylisted system timestamps", () => {
    const rows = deriveTimelineEventsFromSnapshot(
      "task",
      "ent_1",
      "src_1",
      "user_1",
      {
        due_date: "2025-01-15T00:00:00.000Z",
        observed_at: "2025-01-10T00:00:00.000Z",
      }
    );
    const fields = rows.map((r) => r.source_field);
    expect(fields).toContain("due_date");
    expect(fields).not.toContain("observed_at");
  });

  it("toISODate rejects small numbers (amounts, not epoch)", () => {
    expect(toISODate(12345)).toBeNull();
    expect(toISODate(99.5)).toBeNull();
  });

  it("toISODate accepts plausible epoch ms", () => {
    const ms = Date.UTC(2024, 0, 2);
    const iso = toISODate(ms);
    expect(iso).not.toBeNull();
    expect(iso!.startsWith("2024-01-02")).toBe(true);
  });
});
