/**
 * FU-2026-05-002: @neotoma/ext-apps-widget-host
 *
 * Verifies the widget URI parser and the resolveTurnSummaryWidget descriptor
 * builder. Imports from the package source directly (no compiled artifacts
 * required for tests).
 */

import { describe, expect, it } from "vitest";
import {
  buildStatusLine,
  parseTurnSummaryUri,
  resolveTurnSummaryWidget,
  WidgetUriError,
} from "../../packages/ext-apps-widget-host/src/index.ts";

describe("@neotoma/ext-apps-widget-host", () => {
  describe("parseTurnSummaryUri", () => {
    it("parses a well-formed widget URI", () => {
      const uri =
        "ui://neotoma/turn-summary?conversation_id=conv-abc&turn=3&stored=2&retrieved=1&issues=0";
      const params = parseTurnSummaryUri(uri);
      expect(params.conversationId).toBe("conv-abc");
      expect(params.turn).toBe(3);
      expect(params.stored).toBe(2);
      expect(params.retrieved).toBe(1);
      expect(params.issues).toBe(0);
    });

    it("throws WidgetUriError on wrong scheme", () => {
      expect(() => parseTurnSummaryUri("http://example.com/turn-summary?turn=1")).toThrow(
        WidgetUriError
      );
    });

    it("throws WidgetUriError when conversation_id is missing", () => {
      expect(() =>
        parseTurnSummaryUri("ui://neotoma/turn-summary?turn=1&stored=0&retrieved=0&issues=0")
      ).toThrow(/conversation_id/);
    });

    it("throws WidgetUriError when an integer field is malformed", () => {
      expect(() =>
        parseTurnSummaryUri(
          "ui://neotoma/turn-summary?conversation_id=conv-x&turn=abc&stored=0&retrieved=0&issues=0"
        )
      ).toThrow(/turn must be a non-negative integer/);
    });
  });

  describe("buildStatusLine", () => {
    it("includes issues suffix when issues > 0", () => {
      const line = buildStatusLine(
        {
          conversationId: "conv-x",
          turn: 3,
          stored: 2,
          retrieved: 1,
          issues: 4,
        },
        7
      );
      expect(line).toBe("msg 3/7, stored 2, retrieved 1, issues 4");
    });

    it("omits issues suffix when issues = 0", () => {
      const line = buildStatusLine(
        {
          conversationId: "conv-x",
          turn: 3,
          stored: 2,
          retrieved: 1,
          issues: 0,
        },
        7
      );
      expect(line).toBe("msg 3/7, stored 2, retrieved 1");
    });
  });

  describe("resolveTurnSummaryWidget", () => {
    it("prefers authoritative state from fetchTurnSummary", async () => {
      const descriptor = await resolveTurnSummaryWidget(
        "ui://neotoma/turn-summary?conversation_id=conv-x&turn=1&stored=0&retrieved=0&issues=0",
        async () => ({
          status_line: "msg 5/10, stored 3, retrieved 2, issues 1",
          turn_number: 5,
          conversation_message_count: 10,
          stored: [{}, {}, {}],
          retrieved: [{}, {}],
          issues: [{}],
        })
      );
      expect(descriptor.statusLine).toBe("msg 5/10, stored 3, retrieved 2, issues 1");
      expect(descriptor.turn).toBe(5);
      expect(descriptor.stored).toBe(3);
      expect(descriptor.retrieved).toBe(2);
      expect(descriptor.issues).toBe(1);
      expect(descriptor.showConsentCard).toBe(true);
    });

    it("falls back to URI-embedded counts when fetch fails", async () => {
      const descriptor = await resolveTurnSummaryWidget(
        "ui://neotoma/turn-summary?conversation_id=conv-y&turn=2&stored=1&retrieved=0&issues=0",
        async () => {
          throw new Error("network down");
        }
      );
      expect(descriptor.turn).toBe(2);
      expect(descriptor.stored).toBe(1);
      expect(descriptor.retrieved).toBe(0);
      expect(descriptor.issues).toBe(0);
      expect(descriptor.showConsentCard).toBe(false);
      expect(descriptor.statusLine).toBe("msg 2/2, stored 1, retrieved 0");
    });
  });
});
