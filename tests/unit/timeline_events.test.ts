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

  // Audit finding #2: postal codes and account-last-4 numbers were being
  // parsed as calendar years (8036 -> 8036 AD), producing 36k+ junk timeline
  // rows. Bare integer-looking strings and small numbers must be rejected.
  it("toISODate rejects bare integer-looking strings (e.g. postal codes, masked digits)", () => {
    expect(toISODate("8036")).toBeNull();
    expect(toISODate("6560")).toBeNull();
    expect(toISODate("1234")).toBeNull();
    expect(toISODate("0001")).toBeNull();
  });

  it("toISODate rejects small numeric values that coerce to far-future years", () => {
    expect(toISODate(6560)).toBeNull();
    expect(toISODate(8036)).toBeNull();
  });

  it("toISODate accepts genuine ISO date strings", () => {
    expect(toISODate("2024-01-15")).toMatch(/^2024-01-15/);
    expect(toISODate("2024-01-15T10:30:00Z")).toMatch(/^2024-01-15T10:30:00/);
  });

  // Audit finding #2 + schema-driven temporal fields: a type like
  // contact_list has a `postal_code` field that used to leak into the
  // timeline. Without a schema declaration, postal_code must NOT produce
  // a timeline row (generic heuristic operates on name shape only).
  it("emits no timeline event for postal_code on an unseeded type", () => {
    const rows = deriveTimelineEventsFromSnapshot(
      "contact_list",
      "ent_contact",
      "src_1",
      "user_1",
      {
        postal_code: "8036",
        account_mask_last4: "6560",
        name: "Alice",
      },
    );
    expect(rows).toHaveLength(0);
  });

  // When a schema declares temporal_fields explicitly, emission is restricted
  // to exactly those fields (schema-driven). Invoice declaring `invoice_date`
  // must emit one event with event_type "InvoiceIssued" and nothing else.
  it("emits only schema-declared temporal_fields with the declared event_type", () => {
    const rows = deriveTimelineEventsFromSnapshot(
      "invoice",
      "ent_inv",
      "src_1",
      "user_1",
      {
        invoice_date: "2024-06-01T00:00:00.000Z",
        // These two would be picked up by the heuristic path but must be
        // ignored when a schema declares its own temporal_fields.
        due_date: "2024-07-01T00:00:00.000Z",
        issued_at: "2024-06-01T12:00:00.000Z",
      },
      {
        temporal_fields: [
          { field: "invoice_date", event_type: "InvoiceIssued" },
        ],
      },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].source_field).toBe("invoice_date");
    expect(rows[0].event_type).toBe("InvoiceIssued");
  });

  it("ignores snapshot fields not declared in schema.temporal_fields", () => {
    const rows = deriveTimelineEventsFromSnapshot(
      "transaction",
      "ent_tx",
      "src_1",
      "user_1",
      {
        transaction_date: "2024-06-01T00:00:00.000Z",
        account_mask_last4: "6560",
        random_stamp: "2099-12-31T00:00:00.000Z",
      },
      {
        temporal_fields: [{ field: "transaction_date" }],
      },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].source_field).toBe("transaction_date");
  });
});
