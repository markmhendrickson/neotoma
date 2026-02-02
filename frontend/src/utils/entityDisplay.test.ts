/**
 * Entity Display Name Utility Tests
 * 
 * Tests deterministic display name generation across all entity types
 */

import { describe, it, expect } from "vitest";
import { getEntityDisplayName } from "./entityDisplay";
import type { Entity } from "@/components/EntityList";

describe("getEntityDisplayName", () => {
  describe("Priority 1: Title field", () => {
    it("uses title field when available for task", () => {
      const entity: Entity = {
        entity_type: "task",
        canonical_name: "task-123",
        snapshot: { title: "Complete project", status: "todo" },
      };
      expect(getEntityDisplayName(entity)).toBe("Complete project");
    });

    it("uses title field when available for goal", () => {
      const entity: Entity = {
        entity_type: "goal",
        canonical_name: "goal-456",
        snapshot: { title: "Increase revenue by 20%", status: "active" },
      };
      expect(getEntityDisplayName(entity)).toBe("Increase revenue by 20%");
    });

    it("uses title field when available for event", () => {
      const entity: Entity = {
        entity_type: "event",
        canonical_name: "event-789",
        snapshot: { title: "Team Meeting", start_time: "2024-01-15T10:00:00Z" },
      };
      expect(getEntityDisplayName(entity)).toBe("Team Meeting");
    });

    it("uses title field when available for note", () => {
      const entity: Entity = {
        entity_type: "note",
        canonical_name: "note-abc",
        snapshot: { title: "Project Notes", content: "Some content..." },
      };
      expect(getEntityDisplayName(entity)).toBe("Project Notes");
    });
  });

  describe("Priority 2: Name field", () => {
    it("uses name field when title not available for company", () => {
      const entity: Entity = {
        entity_type: "company",
        canonical_name: "acme corp",
        snapshot: { name: "Acme Corporation" },
      };
      expect(getEntityDisplayName(entity)).toBe("Acme Corporation");
    });

    it("uses name field when title not available for person", () => {
      const entity: Entity = {
        entity_type: "person",
        canonical_name: "john doe",
        snapshot: { name: "John Doe", email: "john@example.com" },
      };
      expect(getEntityDisplayName(entity)).toBe("John Doe");
    });

    it("uses name field when title not available for project", () => {
      const entity: Entity = {
        entity_type: "project",
        canonical_name: "website redesign",
        snapshot: { name: "Website Redesign", status: "active" },
      };
      expect(getEntityDisplayName(entity)).toBe("Website Redesign");
    });

    it("uses name field when title not available for location", () => {
      const entity: Entity = {
        entity_type: "location",
        canonical_name: "san francisco",
        snapshot: { name: "San Francisco", country: "USA" },
      };
      expect(getEntityDisplayName(entity)).toBe("San Francisco");
    });
  });

  describe("Priority 3: Type-specific fields", () => {
    it("uses invoice_number for invoice", () => {
      const entity: Entity = {
        entity_type: "invoice",
        canonical_name: "invoice-123",
        snapshot: { invoice_number: "INV-2024-001", vendor_name: "Acme Corp" },
      };
      expect(getEntityDisplayName(entity)).toBe("INV-2024-001");
    });

    it("uses merchant_name for receipt", () => {
      const entity: Entity = {
        entity_type: "receipt",
        canonical_name: "receipt-456",
        snapshot: { merchant_name: "Whole Foods", amount_total: 45.50 },
      };
      expect(getEntityDisplayName(entity)).toBe("Whole Foods");
    });

    it("uses subject for email", () => {
      const entity: Entity = {
        entity_type: "email",
        canonical_name: "email-789",
        snapshot: { subject: "Q4 Planning Meeting", from: "boss@example.com" },
      };
      expect(getEntityDisplayName(entity)).toBe("Q4 Planning Meeting");
    });

    it("uses subject for message", () => {
      const entity: Entity = {
        entity_type: "message",
        canonical_name: "message-abc",
        snapshot: { subject: "Quick question", sender: "alice@example.com" },
      };
      expect(getEntityDisplayName(entity)).toBe("Quick question");
    });

    it("uses asset_name for holding", () => {
      const entity: Entity = {
        entity_type: "holding",
        canonical_name: "holding-def",
        snapshot: { asset_name: "Apple Inc.", asset_symbol: "AAPL", quantity: 100 },
      };
      expect(getEntityDisplayName(entity)).toBe("Apple Inc.");
    });

    it("uses counterparty for transaction", () => {
      const entity: Entity = {
        entity_type: "transaction",
        canonical_name: "transaction-ghi",
        snapshot: { counterparty: "Grocery Store", amount: 45.50 },
      };
      expect(getEntityDisplayName(entity)).toBe("Grocery Store");
    });

    it("uses expense_name for fixed_cost", () => {
      const entity: Entity = {
        entity_type: "fixed_cost",
        canonical_name: "fixed-cost-jkl",
        snapshot: { expense_name: "Netflix Subscription", merchant: "Netflix" },
      };
      expect(getEntityDisplayName(entity)).toBe("Netflix Subscription");
    });

    it("uses item_name for purchase", () => {
      const entity: Entity = {
        entity_type: "purchase",
        canonical_name: "purchase-mno",
        snapshot: { item_name: "Standing Desk", status: "completed" },
      };
      expect(getEntityDisplayName(entity)).toBe("Standing Desk");
    });
  });

  describe("Priority 4: Fallback to canonical_name", () => {
    it("falls back to canonical_name when no other fields available", () => {
      const entity: Entity = {
        entity_type: "unknown_type",
        canonical_name: "fallback-name",
        snapshot: {},
      };
      expect(getEntityDisplayName(entity)).toBe("fallback-name");
    });

    it("falls back to canonical_name when snapshot is undefined", () => {
      const entity: Entity = {
        entity_type: "company",
        canonical_name: "test company",
      };
      expect(getEntityDisplayName(entity)).toBe("test company");
    });

    it("falls back to canonical_name when all fields are empty", () => {
      const entity: Entity = {
        entity_type: "task",
        canonical_name: "task-empty",
        snapshot: { title: "", name: "", description: "" },
      };
      expect(getEntityDisplayName(entity)).toBe("task-empty");
    });
  });

  describe("Edge cases", () => {
    it("trims whitespace from title", () => {
      const entity: Entity = {
        entity_type: "task",
        canonical_name: "task-123",
        snapshot: { title: "  Complete project  " },
      };
      expect(getEntityDisplayName(entity)).toBe("Complete project");
    });

    it("trims whitespace from name", () => {
      const entity: Entity = {
        entity_type: "company",
        canonical_name: "acme",
        snapshot: { name: "  Acme Corp  " },
      };
      expect(getEntityDisplayName(entity)).toBe("Acme Corp");
    });

    it("handles non-string values in snapshot gracefully", () => {
      const entity: Entity = {
        entity_type: "task",
        canonical_name: "task-123",
        snapshot: { title: 12345 as any }, // Invalid type
      };
      expect(getEntityDisplayName(entity)).toBe("task-123");
    });

    it("handles null values in snapshot", () => {
      const entity: Entity = {
        entity_type: "task",
        canonical_name: "task-123",
        snapshot: { title: null as any, name: null as any },
      };
      expect(getEntityDisplayName(entity)).toBe("task-123");
    });

    it("handles array fields in type-specific mapping", () => {
      const entity: Entity = {
        entity_type: "contract",
        canonical_name: "contract-123",
        snapshot: { parties: ["Acme Corp", "Beta Inc"] },
      };
      // contract doesn't have title/name, would need to check type-specific fields
      // For this test, we need to add contract to TYPE_SPECIFIC_DISPLAY_FIELDS
      expect(getEntityDisplayName(entity)).toBe("contract-123");
    });

    it("returns fallback when canonical_name is empty", () => {
      const entity: Entity = {
        entity_type: "unknown",
        canonical_name: "",
        snapshot: {},
      };
      expect(getEntityDisplayName(entity)).toBe("—");
    });

    it("prioritizes title over name when both exist", () => {
      const entity: Entity = {
        entity_type: "task",
        canonical_name: "task-123",
        snapshot: { title: "Task Title", name: "Task Name" },
      };
      expect(getEntityDisplayName(entity)).toBe("Task Title");
    });

    it("prioritizes name over type-specific fields", () => {
      const entity: Entity = {
        entity_type: "invoice",
        canonical_name: "invoice-123",
        snapshot: { 
          name: "Invoice Name",
          invoice_number: "INV-001",
          vendor_name: "Acme Corp"
        },
      };
      expect(getEntityDisplayName(entity)).toBe("Invoice Name");
    });

    it("uses second type-specific field if first is empty", () => {
      const entity: Entity = {
        entity_type: "invoice",
        canonical_name: "invoice-123",
        snapshot: { 
          invoice_number: "", // Empty first priority
          vendor_name: "Acme Corp" 
        },
      };
      expect(getEntityDisplayName(entity)).toBe("Acme Corp");
    });
  });

  describe("Schema-specific behavior", () => {
    it("handles email with subject and from", () => {
      const entity: Entity = {
        entity_type: "email",
        canonical_name: "email-123",
        snapshot: { 
          subject: "Meeting Reminder",
          from: "boss@example.com",
          body: "Don't forget..."
        },
      };
      expect(getEntityDisplayName(entity)).toBe("Meeting Reminder");
    });

    it("handles transaction with counterparty", () => {
      const entity: Entity = {
        entity_type: "transaction",
        canonical_name: "transaction-123",
        snapshot: { 
          counterparty: "Coffee Shop",
          amount: 5.50,
          description: "Morning coffee"
        },
      };
      expect(getEntityDisplayName(entity)).toBe("Coffee Shop");
    });

    it("handles holding with asset information", () => {
      const entity: Entity = {
        entity_type: "holding",
        canonical_name: "holding-123",
        snapshot: { 
          asset_name: "Microsoft Corporation",
          asset_symbol: "MSFT",
          quantity: 50
        },
      };
      expect(getEntityDisplayName(entity)).toBe("Microsoft Corporation");
    });

    it("handles account with wallet_name", () => {
      const entity: Entity = {
        entity_type: "account",
        canonical_name: "account-123",
        snapshot: { 
          wallet_name: "Chase Checking",
          number: "1234"
        },
      };
      expect(getEntityDisplayName(entity)).toBe("Chase Checking");
    });
  });
});
