import { describe, expect, it } from "vitest";
import {
  renderTurnReport,
  resolveInspectorBaseUrl,
} from "../../packages/client/src/turn_report.js";
import type { Diagnosis } from "../../packages/client/src/diagnose.js";

describe("renderTurnReport", () => {
  it("renders a Created group with emoji, entity_type, and inspector link", () => {
    const out = renderTurnReport({
      created: [
        { label: "Follow up on invoice", entityType: "task", entityId: "ent_task1" },
        { label: "Ana Pérez", entityType: "contact", entityId: "ent_contact1" },
      ],
      inspectorBaseUrl: "http://localhost:5175",
    });
    expect(out).toContain("🧠 Neotoma");
    expect(out).toContain("Created (2)");
    expect(out).toContain(
      "✅ Follow up on invoice ([inspect](http://localhost:5175/entities/ent_task1)) (`task`)"
    );
    expect(out).toContain(
      "👤 Ana Pérez ([inspect](http://localhost:5175/entities/ent_contact1)) (`contact`)"
    );
    expect(out).not.toContain("Updated");
    expect(out).not.toContain("Reads");
  });

  it("renders all substantive groups plus the Conversation bookkeeping group", () => {
    const out = renderTurnReport({
      conversation: {
        conversation: { label: "Chat thread", entityType: "conversation", entityId: "ent_conv" },
        userMessage: {
          label: "user message turn 1",
          entityType: "agent_message",
          entityId: "ent_user",
        },
        assistantMessage: {
          label: "assistant message turn 1",
          entityType: "agent_message",
          entityId: "ent_asst",
        },
      },
      created: [{ label: "A", entityType: "task", entityId: "ent_a" }],
      updated: [{ label: "B", entityType: "contact", entityId: "ent_b" }],
      retrieved: [{ label: "C", entityType: "event", entityId: "ent_c" }],
    });
    expect(out).toContain("Conversation (3)");
    expect(out).toContain("Reads (1)");
    expect(out).toContain("Created (1)");
    expect(out).toContain("Updated (1)");
    expect(out).toContain("/entities/ent_conv");
    expect(out).toContain("/entities/ent_user");
    expect(out).toContain("/entities/ent_asst");
    expect(out).toContain("🧵 Chat thread");
    expect(out).toContain("💬 user message turn 1");
  });

  it("renders the Conversation group only when no substantive work happened", () => {
    const out = renderTurnReport({
      conversation: {
        userMessage: {
          label: "user message turn 4",
          entityType: "agent_message",
          entityId: "ent_u4",
        },
      },
    });
    expect(out).toContain("Conversation (1)");
    expect(out).toContain("No other durable facts read or written this turn.");
    expect(out).not.toContain("Reads (");
    expect(out).not.toContain("Created (");
    expect(out).not.toContain("Updated (");
  });

  it("falls back to a fully empty state when nothing at all happened", () => {
    const out = renderTurnReport({});
    expect(out).toContain("No durable facts read or written this turn.");
    expect(out).not.toContain("Conversation (");
  });

  it("appends an Issues section for non-ok diagnoses", () => {
    const diagnoses: Diagnosis[] = [
      {
        id: "user-message-missing",
        severity: "error",
        message: "User message missing.",
        immediateMeaning: "The current turn is incomplete in storage.",
        ongoingRisk: "Future recalls remain incomplete.",
        recommendedResolution: "Backfill the missing user message now.",
      },
      {
        id: "store-first-violation",
        severity: "warn",
        message: "Tools ran before store.",
        immediateMeaning: "This turn started from unanchored state.",
        ongoingRisk: "Out-of-order persistence can recur.",
        recommendedResolution: "Store first on future turns and backfill if needed.",
      },
      { id: "user-message-stored", severity: "ok", message: "Fine." },
    ];
    const out = renderTurnReport({
      created: [{ label: "X", entityType: "task", entityId: "ent_x" }],
      diagnoses,
    });
    expect(out).toContain("Issues (2)");
    expect(out).toContain(
      "🔴 User message missing. (`user-message-missing`) — Immediate: The current turn is incomplete in storage. — If unresolved: Future recalls remain incomplete. — Recommended resolution: Backfill the missing user message now."
    );
    expect(out).toContain(
      "🟡 Tools ran before store. (`store-first-violation`) — Immediate: This turn started from unanchored state. — If unresolved: Out-of-order persistence can recur. — Recommended resolution: Store first on future turns and backfill if needed."
    );
    expect(out).not.toContain("Fine.");
  });

  it("renders Repairs with inspector links to neotoma_repair entities", () => {
    const out = renderTurnReport({
      repairs: [
        {
          label: "Backfilled missing user message",
          repairEntityId: "ent_repair1",
          severity: "warning",
        },
      ],
      inspectorBaseUrl: "http://localhost:5175",
    });
    expect(out).toContain("Repairs (1)");
    expect(out).toContain(
      "🟡 Backfilled missing user message ([inspect](http://localhost:5175/entities/ent_repair1)) (`neotoma_repair`)"
    );
  });

  it("accepts a custom emoji per entity", () => {
    const out = renderTurnReport({
      created: [
        { label: "Custom", entityType: "task", emoji: "🚀", entityId: "ent_custom" },
      ],
    });
    expect(out).toContain("🚀 Custom ([inspect](");
  });

  it("renders (no id — see Issues) when an entity lacks an entity_id", () => {
    const out = renderTurnReport({
      created: [{ label: "Orphan", entityType: "task" }],
    });
    expect(out).toContain("✅ Orphan (no id — see Issues) (`task`)");
  });
});

describe("resolveInspectorBaseUrl", () => {
  it("prefers explicit argument over env vars", () => {
    const prev = process.env.NEOTOMA_INSPECTOR_URL;
    process.env.NEOTOMA_INSPECTOR_URL = "http://should-not-win:9999";
    try {
      expect(resolveInspectorBaseUrl("http://explicit:1234/")).toBe(
        "http://explicit:1234"
      );
    } finally {
      if (prev === undefined) delete process.env.NEOTOMA_INSPECTOR_URL;
      else process.env.NEOTOMA_INSPECTOR_URL = prev;
    }
  });

  it("uses NEOTOMA_INSPECTOR_URL when explicit is absent", () => {
    const prev = process.env.NEOTOMA_INSPECTOR_URL;
    process.env.NEOTOMA_INSPECTOR_URL = "http://inspector.example/";
    try {
      expect(resolveInspectorBaseUrl()).toBe("http://inspector.example");
    } finally {
      if (prev === undefined) delete process.env.NEOTOMA_INSPECTOR_URL;
      else process.env.NEOTOMA_INSPECTOR_URL = prev;
    }
  });

  it("falls back to NEOTOMA_FRONTEND_URL, then default", () => {
    const prevInspector = process.env.NEOTOMA_INSPECTOR_URL;
    const prevFrontend = process.env.NEOTOMA_FRONTEND_URL;
    delete process.env.NEOTOMA_INSPECTOR_URL;
    process.env.NEOTOMA_FRONTEND_URL = "http://frontend.example";
    try {
      expect(resolveInspectorBaseUrl()).toBe("http://frontend.example");
    } finally {
      if (prevInspector !== undefined) process.env.NEOTOMA_INSPECTOR_URL = prevInspector;
      if (prevFrontend === undefined) delete process.env.NEOTOMA_FRONTEND_URL;
      else process.env.NEOTOMA_FRONTEND_URL = prevFrontend;
    }

    const prev2 = process.env.NEOTOMA_FRONTEND_URL;
    delete process.env.NEOTOMA_FRONTEND_URL;
    try {
      expect(resolveInspectorBaseUrl()).toBe("http://localhost:5175");
    } finally {
      if (prev2 !== undefined) process.env.NEOTOMA_FRONTEND_URL = prev2;
    }
  });
});
