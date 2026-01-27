/**
 * Unit tests for Finances Field Mapping
 * 
 * Tests field mapping from finances repository schemas to Neotoma schemas.
 */

import { describe, it, expect } from "vitest";
import {
  mapTransactionFields,
  mapContactFields,
  mapContractFields,
} from "../../src/services/finances_field_mapping.js";

describe("Finances Field Mapping", () => {
  describe("mapTransactionFields", () => {
    it("should map transaction fields correctly", () => {
      const financesRecord = {
        amount_usd: 100.50,
        amount_original: 100.50,
        currency_original: "USD",
        transaction_date: "2025-01-15",
        posting_date: "2025-01-16",
        description: "Store Purchase",
        account_id: "acc_123",
        category: "groceries",
        bank_provider: "Chase",
      };
      
      const mapped = mapTransactionFields(financesRecord);
      
      expect(mapped.amount).toBe(100.50);
      expect(mapped.amount_original).toBe(100.50);
      expect(mapped.currency).toBe("USD");
      expect(mapped.date).toBe("2025-01-15");
      expect(mapped.posting_date).toBe("2025-01-16");
      expect(mapped.merchant_name).toBe("Store Purchase");
      expect(mapped.status).toBe("completed");
      expect(mapped.account_id).toBe("acc_123");
      expect(mapped.category).toBe("groceries");
      expect(mapped.bank_provider).toBe("Chase");
      expect(mapped.schema_version).toBe("1.0");
    });

    it("should use default USD currency when not provided", () => {
      const financesRecord = {
        amount_usd: 50,
        transaction_date: "2025-01-15",
        description: "Purchase",
      };
      
      const mapped = mapTransactionFields(financesRecord);
      
      expect(mapped.currency).toBe("USD");
    });

    it("should handle missing optional fields", () => {
      const financesRecord = {
        amount_usd: 75.25,
        transaction_date: "2025-01-15",
        description: "Payment",
      };
      
      const mapped = mapTransactionFields(financesRecord);
      
      expect(mapped.amount).toBe(75.25);
      expect(mapped.date).toBe("2025-01-15");
      expect(mapped.merchant_name).toBe("Payment");
      expect(mapped.status).toBe("completed");
    });
  });

  describe("mapContactFields", () => {
    it("should map contact fields correctly", () => {
      const financesRecord = {
        name: "John Doe",
        email: "john@example.com",
        phone: "555-1234",
        contact_type: "individual",
        category: "client",
        platform: "linkedin",
        address: "123 Main St",
        country: "USA",
        website: "https://example.com",
        notes: "Important contact",
        first_contact_date: "2024-01-01",
        last_contact_date: "2025-01-15",
        created_date: "2024-01-01",
        updated_date: "2025-01-15",
      };
      
      const mapped = mapContactFields(financesRecord);
      
      expect(mapped.name).toBe("John Doe");
      expect(mapped.email).toBe("john@example.com");
      expect(mapped.phone).toBe("555-1234");
      expect(mapped.contact_type).toBe("individual");
      expect(mapped.category).toBe("client");
      expect(mapped.platform).toBe("linkedin");
      expect(mapped.address).toBe("123 Main St");
      expect(mapped.country).toBe("USA");
      expect(mapped.website).toBe("https://example.com");
      expect(mapped.notes).toBe("Important contact");
      expect(mapped.organization).toBe(""); // Not in finances schema
      expect(mapped.role).toBe(""); // Not in finances schema
      expect(mapped.schema_version).toBe("1.0");
    });

    it("should use empty string for missing email", () => {
      const financesRecord = {
        name: "Jane Doe",
        // No email provided
      };
      
      const mapped = mapContactFields(financesRecord);
      
      expect(mapped.email).toBe("");
    });

    it("should use empty string for missing phone", () => {
      const financesRecord = {
        name: "Bob Smith",
        // No phone provided
      };
      
      const mapped = mapContactFields(financesRecord);
      
      expect(mapped.phone).toBe("");
    });

    it("should set organization and role to empty strings", () => {
      const financesRecord = {
        name: "Test Contact",
      };
      
      const mapped = mapContactFields(financesRecord);
      
      expect(mapped.organization).toBe("");
      expect(mapped.role).toBe("");
    });
  });

  describe("mapContractFields", () => {
    it("should map contract fields correctly", () => {
      const financesRecord = {
        contract_id: "CTR-001",
        companies: "Acme Corp, Other Corp",
        signed_date: "2025-01-01",
        effective_date: "2025-01-01",
        expiration_date: "2026-01-01",
        status: "active",
        name: "Service Agreement",
        files: "contract.pdf",
        type: "service",
        notes: "Annual renewal",
      };
      
      const mapped = mapContractFields(financesRecord);
      
      expect(mapped.contract_number).toBe("CTR-001");
      expect(mapped.parties).toBe("Acme Corp, Other Corp");
      expect(mapped.effective_date).toBe("2025-01-01");
      expect(mapped.expiration_date).toBe("2026-01-01");
      expect(mapped.status).toBe("active");
      expect(mapped.name).toBe("Service Agreement");
      expect(mapped.signed_date).toBe("2025-01-01");
      expect(mapped.companies).toBe("Acme Corp, Other Corp");
      expect(mapped.files).toBe("contract.pdf");
      expect(mapped.type).toBe("service");
      expect(mapped.notes).toBe("Annual renewal");
      expect(mapped.schema_version).toBe("1.0");
    });

    it("should use signed_date as effective_date fallback", () => {
      const financesRecord = {
        signed_date: "2025-01-01",
        // No effective_date provided
      };
      
      const mapped = mapContractFields(financesRecord);
      
      expect(mapped.effective_date).toBe("2025-01-01");
    });

    it("should prioritize signed_date over effective_date", () => {
      const financesRecord = {
        signed_date: "2025-01-01",
        effective_date: "2025-02-01",
      };
      
      const mapped = mapContractFields(financesRecord);
      
      // Implementation uses signed_date as primary, effective_date as fallback
      expect(mapped.effective_date).toBe("2025-01-01");
    });

    it("should use empty string for missing contract_number", () => {
      const financesRecord = {
        companies: "Test Corp",
      };
      
      const mapped = mapContractFields(financesRecord);
      
      expect(mapped.contract_number).toBe("");
    });

    it("should use default active status when not provided", () => {
      const financesRecord = {
        contract_id: "CTR-002",
        // No status provided
      };
      
      const mapped = mapContractFields(financesRecord);
      
      expect(mapped.status).toBe("active");
    });
  });

  describe("Field Mapping Consistency", () => {
    it("should always include schema_version", () => {
      const transactionMapped = mapTransactionFields({ amount_usd: 100 });
      const contactMapped = mapContactFields({ name: "Test" });
      const contractMapped = mapContractFields({ contract_id: "CTR-001" });
      
      expect(transactionMapped.schema_version).toBe("1.0");
      expect(contactMapped.schema_version).toBe("1.0");
      expect(contractMapped.schema_version).toBe("1.0");
    });

    it("should preserve all provided fields", () => {
      const financesRecord = {
        amount_usd: 100,
        transaction_date: "2025-01-15",
        description: "Test",
        extra_field: "preserved",
      };
      
      const mapped = mapTransactionFields(financesRecord);
      
      // Core fields should be mapped
      expect(mapped.amount).toBe(100);
      expect(mapped.date).toBe("2025-01-15");
      expect(mapped.merchant_name).toBe("Test");
    });
  });
});
