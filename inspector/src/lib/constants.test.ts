import { describe, expect, it } from "vitest";
import {
  formatInspectorUserBadge,
  formatInspectorUserId,
  inspectorUserIdDetailLabel,
  inspectorUserIdLabel,
  LOCAL_DEV_USER_ID,
} from "./constants";

/**
 * #2228: `/me` separates "who you are" (`email`) from "whose graph you
 * operate on" (`user_id`). Under shared-graph mode a teammate's session must
 * never let the graph's shared id read as their own — these are the pure
 * labeling helpers both Settings and the sidebar footer render, covering the
 * signed-in-email display and the User ID vs. Graph User ID switch.
 */
describe("inspector identity labeling (#2228)", () => {
  describe("formatInspectorUserBadge", () => {
    it("prefers the signed-in email when present", () => {
      expect(formatInspectorUserBadge("teammate@example.com", "shared-graph-id")).toBe(
        "teammate@example.com"
      );
    });

    it("falls back to the user id when there is no email", () => {
      expect(formatInspectorUserBadge(undefined, "shared-graph-id")).toBe("shared-graph-id");
      expect(formatInspectorUserBadge(null, "shared-graph-id")).toBe("shared-graph-id");
      expect(formatInspectorUserBadge("   ", "shared-graph-id")).toBe("shared-graph-id");
    });

    it("does not substitute the graph id under shared-graph when email is unknown", () => {
      expect(formatInspectorUserBadge(undefined, "shared-graph-id", true)).toBe(
        "Unknown identity — sign in again"
      );
      expect(formatInspectorUserBadge(null, "shared-graph-id", true)).toBe(
        "Unknown identity — sign in again"
      );
      expect(formatInspectorUserBadge("   ", "shared-graph-id", true)).toBe(
        "Unknown identity — sign in again"
      );
    });

    it("labels the local dev user distinctly", () => {
      expect(formatInspectorUserBadge(undefined, LOCAL_DEV_USER_ID)).toBe("Local user");
    });
  });

  describe("formatInspectorUserId", () => {
    it("labels the local dev user, passes through any other id", () => {
      expect(formatInspectorUserId(LOCAL_DEV_USER_ID)).toBe("Local user");
      expect(formatInspectorUserId("shared-graph-id")).toBe("shared-graph-id");
    });
  });

  describe("inspectorUserIdLabel", () => {
    it("labels the id as the graph scope under shared-graph mode", () => {
      expect(inspectorUserIdLabel(true)).toBe("Graph User ID");
    });

    it("labels the id as a plain User ID otherwise", () => {
      expect(inspectorUserIdLabel(false)).toBe("User ID");
      expect(inspectorUserIdLabel(undefined)).toBe("User ID");
    });
  });

  describe("inspectorUserIdDetailLabel", () => {
    it("names the shared-graph scope explicitly in the detail/tooltip variant", () => {
      expect(inspectorUserIdDetailLabel(true)).toBe("Shared graph User ID");
    });

    it("labels the id as a plain User ID otherwise", () => {
      expect(inspectorUserIdDetailLabel(false)).toBe("User ID");
      expect(inspectorUserIdDetailLabel(undefined)).toBe("User ID");
    });
  });
});
