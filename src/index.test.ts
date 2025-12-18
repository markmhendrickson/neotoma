import { describe, it, expect, beforeAll } from "vitest";
import { supabase } from "./db.js";
import { config } from "./config.js";

describe("MCP Server Integration Tests", () => {
  beforeAll(() => {
    expect(config.supabaseUrl).toBeTruthy();
    expect(config.supabaseKey).toBeTruthy();
  });

  it("should connect to Supabase", async () => {
    const { error } = await supabase.from("records").select("id").limit(1);
    expect(error).toBeNull();
  });

  it("should store a record", async () => {
    const testRecord = {
      type: "test_transaction",
      properties: {
        amount: 100,
        currency: "USD",
        description: "Test purchase",
      },
      file_urls: [],
    };

    const { data, error } = await supabase
      .from("records")
      .insert(testRecord)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.type).toBe("test_transaction");
    expect(data.properties).toEqual(testRecord.properties);

    await supabase.from("records").delete().eq("id", data.id);
  });

  it("should update a record", async () => {
    const testRecord = {
      type: "test_note",
      properties: { title: "Original Title", content: "Original content" },
    };

    const { data: created } = await supabase
      .from("records")
      .insert(testRecord)
      .select()
      .single();

    const { data: updated, error } = await supabase
      .from("records")
      .update({
        properties: { ...created.properties, title: "Updated Title" },
      })
      .eq("id", created.id)
      .select()
      .single();

    expect(error).toBeNull();
    expect(updated.properties.title).toBe("Updated Title");

    await supabase.from("records").delete().eq("id", created.id);
  });

  it("should update the type of a record", async () => {
    const testRecord = {
      type: "test_note",
      properties: { title: "Test Note", content: "Original content" },
    };

    const { data: created } = await supabase
      .from("records")
      .insert(testRecord)
      .select()
      .single();

    expect(created.type).toBe("test_note");

    const { data: updated, error } = await supabase
      .from("records")
      .update({
        type: "test_transaction",
      })
      .eq("id", created.id)
      .select()
      .single();

    expect(error).toBeNull();
    expect(updated.type).toBe("test_transaction");
    expect(updated.properties).toEqual(created.properties);

    await supabase.from("records").delete().eq("id", created.id);
  });

  it("should retrieve records by type", async () => {
    const testRecords = [
      { type: "exercise", properties: { sets: 3, reps: 10 } },
      { type: "exercise", properties: { sets: 5, reps: 12 } },
      { type: "note", properties: { content: "Note content" } },
    ];

    const insertResults = await supabase
      .from("records")
      .insert(testRecords)
      .select();
    const insertedIds = insertResults.data?.map((r) => r.id) || [];
    expect(insertedIds.length).toBe(3);

    const { data, error } = await supabase
      .from("records")
      .select("*")
      .eq("type", "exercise")
      .in("id", insertedIds);

    expect(error).toBeNull();
    expect(data?.length).toBe(2);
    expect(data?.every((r) => r.type === "exercise")).toBe(true);

    await supabase.from("records").delete().in("id", insertedIds);
  });

  it("should delete a record", async () => {
    const testRecord = {
      type: "test_delete",
      properties: { test: true },
    };

    const { data: created } = await supabase
      .from("records")
      .insert(testRecord)
      .select()
      .single();

    const { error: deleteError } = await supabase
      .from("records")
      .delete()
      .eq("id", created.id);

    expect(deleteError).toBeNull();

    const { data: found } = await supabase
      .from("records")
      .select("id")
      .eq("id", created.id)
      .single();

    expect(found).toBeNull();
  });

  it("should handle JSONB queries with nested properties", async () => {
    const testRecord = {
      type: "transaction",
      properties: {
        amount: 50,
        metadata: { source: "web", user_id: "123" },
      },
    };

    const { data: created } = await supabase
      .from("records")
      .insert(testRecord)
      .select()
      .single();

    const { data: results } = await supabase
      .from("records")
      .select("*")
      .filter("properties->>amount", "eq", "50");

    expect(results).toBeDefined();
    expect(results?.some((r) => r.id === created.id)).toBe(true);

    await supabase.from("records").delete().eq("id", created.id);
  });
});
