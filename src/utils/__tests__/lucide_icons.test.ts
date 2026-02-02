/**
 * Tests for Lucide Icons Utility
 */

import { describe, it, expect } from "vitest";
import {
  ALL_LUCIDE_ICONS,
  isValidLucideIcon,
  getIconsByCategory,
  getSuggestedIcon,
  ENTITY_TYPE_ICON_MAP,
} from "../lucide_icons.js";

describe("Lucide Icons Utility", () => {
  describe("ALL_LUCIDE_ICONS", () => {
    it("should contain icon names", () => {
      expect(ALL_LUCIDE_ICONS.length).toBeGreaterThan(0);
      expect(ALL_LUCIDE_ICONS).toContain("DollarSign");
      expect(ALL_LUCIDE_ICONS).toContain("FileText");
      expect(ALL_LUCIDE_ICONS).toContain("User");
    });
  });

  describe("isValidLucideIcon", () => {
    it("should validate existing icons", () => {
      expect(isValidLucideIcon("DollarSign")).toBe(true);
      expect(isValidLucideIcon("FileText")).toBe(true);
      expect(isValidLucideIcon("User")).toBe(true);
    });

    it("should reject invalid icons", () => {
      expect(isValidLucideIcon("InvalidIcon")).toBe(false);
      expect(isValidLucideIcon("")).toBe(false);
    });
  });

  describe("getIconsByCategory", () => {
    it("should return financial icons", () => {
      const icons = getIconsByCategory("finance");
      expect(icons.length).toBeGreaterThan(0);
      expect(icons).toContain("DollarSign");
      expect(icons).toContain("Receipt");
    });

    it("should return productivity icons", () => {
      const icons = getIconsByCategory("productivity");
      expect(icons.length).toBeGreaterThan(0);
      expect(icons).toContain("CheckSquare");
      expect(icons).toContain("Calendar");
    });

    it("should return health icons", () => {
      const icons = getIconsByCategory("health");
      expect(icons.length).toBeGreaterThan(0);
      expect(icons).toContain("Heart");
      expect(icons).toContain("Activity");
    });

    it("should return media icons", () => {
      const icons = getIconsByCategory("media");
      expect(icons.length).toBeGreaterThan(0);
      expect(icons).toContain("Image");
      expect(icons).toContain("Video");
    });

    it("should return knowledge icons", () => {
      const icons = getIconsByCategory("knowledge");
      expect(icons.length).toBeGreaterThan(0);
      expect(icons).toContain("File");
      expect(icons).toContain("Database");
    });
  });

  describe("getSuggestedIcon", () => {
    it("should return direct matches from map", () => {
      expect(getSuggestedIcon("invoice")).toBe("FileText");
      expect(getSuggestedIcon("receipt")).toBe("Receipt");
      expect(getSuggestedIcon("transaction")).toBe("DollarSign");
      expect(getSuggestedIcon("task")).toBe("CheckSquare");
      expect(getSuggestedIcon("person")).toBe("User");
      expect(getSuggestedIcon("company")).toBe("Building2");
    });

    it("should match financial patterns", () => {
      expect(getSuggestedIcon("payment_method")).toBe("DollarSign");
      expect(getSuggestedIcon("bank_transaction")).toBe("DollarSign");
      expect(getSuggestedIcon("invoice_123")).toBe("FileText");
    });

    it("should match document patterns", () => {
      expect(getSuggestedIcon("document_file")).toBe("File");
      expect(getSuggestedIcon("note_123")).toBe("FileText");
    });

    it("should match people patterns", () => {
      expect(getSuggestedIcon("user_profile")).toBe("User");
      expect(getSuggestedIcon("contact_info")).toBe("User");
      expect(getSuggestedIcon("company_profile")).toBe("Building2");
    });

    it("should return null for unknown types", () => {
      expect(getSuggestedIcon("unknown_entity_type")).toBeNull();
      expect(getSuggestedIcon("xyz_abc")).toBeNull();
    });
  });

  describe("ENTITY_TYPE_ICON_MAP", () => {
    it("should have valid Lucide icon names", () => {
      for (const [, iconName] of Object.entries(ENTITY_TYPE_ICON_MAP)) {
        expect(isValidLucideIcon(iconName)).toBe(true);
      }
    });

    it("should cover common financial types", () => {
      expect(ENTITY_TYPE_ICON_MAP.invoice).toBeDefined();
      expect(ENTITY_TYPE_ICON_MAP.receipt).toBeDefined();
      expect(ENTITY_TYPE_ICON_MAP.transaction).toBeDefined();
      expect(ENTITY_TYPE_ICON_MAP.payment).toBeDefined();
    });

    it("should cover common productivity types", () => {
      expect(ENTITY_TYPE_ICON_MAP.task).toBeDefined();
      expect(ENTITY_TYPE_ICON_MAP.project).toBeDefined();
      expect(ENTITY_TYPE_ICON_MAP.event).toBeDefined();
    });

    it("should cover common people types", () => {
      expect(ENTITY_TYPE_ICON_MAP.person).toBeDefined();
      expect(ENTITY_TYPE_ICON_MAP.contact).toBeDefined();
      expect(ENTITY_TYPE_ICON_MAP.company).toBeDefined();
    });
  });
});
