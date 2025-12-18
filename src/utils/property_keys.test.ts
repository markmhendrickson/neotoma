import { describe, it, expect } from "vitest";
import { humanizePropertyKey, humanizePropertyKeys } from "./property_keys.js";

describe("humanizePropertyKey", () => {
  it("converts snake_case to human-readable", () => {
    expect(humanizePropertyKey("full_name")).toBe("Full Name");
    expect(humanizePropertyKey("user_id")).toBe("User Id");
    expect(humanizePropertyKey("created_at")).toBe("Created At");
  });

  it("converts camelCase to human-readable", () => {
    expect(humanizePropertyKey("fullName")).toBe("Full Name");
    expect(humanizePropertyKey("userId")).toBe("User Id");
    expect(humanizePropertyKey("createdAt")).toBe("Created At");
  });

  it("converts kebab-case to human-readable", () => {
    expect(humanizePropertyKey("full-name")).toBe("Full Name");
    expect(humanizePropertyKey("user-id")).toBe("User Id");
  });

  it("preserves already humanized keys", () => {
    expect(humanizePropertyKey("Full Name")).toBe("Full Name");
    expect(humanizePropertyKey("User Id")).toBe("User Id");
  });

  it("handles single words", () => {
    expect(humanizePropertyKey("name")).toBe("Name");
    expect(humanizePropertyKey("id")).toBe("Id");
  });

  it("handles empty or invalid input", () => {
    expect(humanizePropertyKey("")).toBe("");
    expect(humanizePropertyKey(null as any)).toBe(null);
    expect(humanizePropertyKey(undefined as any)).toBe(undefined);
  });
});

describe("humanizePropertyKeys", () => {
  it("humanizes all property keys in an object", () => {
    const input = {
      full_name: "John Doe",
      user_id: "123",
      created_at: "2024-01-01",
    };
    const result = humanizePropertyKeys(input);
    expect(result).toEqual({
      "Full Name": "John Doe",
      "User Id": "123",
      "Created At": "2024-01-01",
    });
  });

  it("handles mixed case formats", () => {
    const input = {
      full_name: "John",
      fullName: "Jane",
      "full-name": "Bob",
    };
    const result = humanizePropertyKeys(input);
    // All three humanize to "Full Name", but collision handling keeps original keys
    expect(result["Full Name"]).toBe("John"); // First one processed
    expect(result["fullName"]).toBe("Jane"); // Collision, kept original
    expect(result["full-name"]).toBe("Bob"); // Collision, kept original
  });

  it("preserves nested objects and arrays", () => {
    const input = {
      user_name: "John",
      metadata: {
        nested_key: "value",
      },
      tags: ["tag1", "tag2"],
    };
    const result = humanizePropertyKeys(input);
    expect(result).toEqual({
      "User Name": "John",
      Metadata: {
        nested_key: "value", // Nested objects are not humanized
      },
      Tags: ["tag1", "tag2"], // Arrays are preserved
    });
  });

  it("handles collisions by keeping original key", () => {
    const input = {
      "Full Name": "John",
      full_name: "Jane", // Collision with humanized version
    };
    const result = humanizePropertyKeys(input);
    // The collision should result in keeping the original key
    expect(result["Full Name"]).toBe("John");
    expect(result["full_name"]).toBe("Jane");
  });

  it("handles empty objects", () => {
    expect(humanizePropertyKeys({})).toEqual({});
  });

  it("handles null and undefined", () => {
    expect(humanizePropertyKeys(null as any)).toBe(null);
    expect(humanizePropertyKeys(undefined as any)).toBe(undefined);
  });

  it("handles arrays (returns as-is)", () => {
    const input = ["item1", "item2"];
    expect(humanizePropertyKeys(input as any)).toBe(input);
  });
});
