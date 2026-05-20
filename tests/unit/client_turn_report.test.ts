import { describe, expect, it } from "vitest";
import {
  renderTurnReport,
  resolveInspectorBaseUrl,
} from "../../packages/client/src/turn_report.js";
import type { Diagnosis } from "../../packages/client/src/diagnose.js";

describe("renderTurnReport", () => {
  it("renders a Created group with linked entity types", () => {
    const out = renderTurnReport({
      created: [
        { label: "Follow up on invoice", entityType: "task", entityId: "ent_task1" },
        { label: "Ana Pérez", entityType: "contact", entityId: "ent_contact1" },
      ],
      inspectorBaseUrl: "http://localhost:3180",
    });
    expect(out).toContain("## 🧠 Neotoma");
    expect(out).toContain("Created (2)");
    expect(out).toContain(
      "✅ Follow up on invoice ([task](http://localhost:3180/inspector/entities/ent_task1))"
    );
    expect(out).toContain(
      "👤 Ana Pérez ([contact](http://localhost:3180/inspector/entities/ent_contact1))"
    );
    expect(out).not.toContain("Updated");
    expect(out).not.toContain("Retrieved");
  });

  it("renders a linked conversation heading and all substantive groups", () => {
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
      inspectorBaseUrl: "http://localhost:3180",
    });
    expect(out).toContain(
      "## 🧠 Neotoma — [Chat thread](http://localhost:3180/inspector/conversations/ent_conv)"
    );
    expect(out).toContain("Retrieved (1)");
    expect(out).toContain("Created (1)");
    expect(out).toContain("Updated (1)");
    expect(out).toContain("📅 C ([event](http://localhost:3180/inspector/entities/ent_c))");
    expect(out).toContain("✅ A ([task](http://localhost:3180/inspector/entities/ent_a))");
    expect(out).toContain("👤 B ([contact](http://localhost:3180/inspector/entities/ent_b))");
    expect(out).not.toContain("Conversation (");
  });

  it("renders only the linked heading when no substantive work happened", () => {
    const out = renderTurnReport({
      conversation: {
        conversation: { label: "Chat thread", entityType: "conversation", entityId: "ent_conv" },
        userMessage: {
          label: "user message turn 4",
          entityType: "agent_message",
          entityId: "ent_u4",
        },
      },
      inspectorBaseUrl: "http://localhost:3180",
    });
    expect(out).toContain(
      "## 🧠 Neotoma — [Chat thread](http://localhost:3180/inspector/conversations/ent_conv)"
    );
    expect(out).toContain("No durable facts read or written this turn.");
    expect(out).not.toContain("Retrieved (");
    expect(out).not.toContain("Created (");
    expect(out).not.toContain("Updated (");
    expect(out).not.toContain("Conversation (");
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
      inspectorBaseUrl: "http://localhost:3180",
    });
    expect(out).toContain("Repairs (1)");
    expect(out).toContain(
      "🟡 Backfilled missing user message ([neotoma_repair](http://localhost:3180/inspector/entities/ent_repair1))"
    );
  });

  it("accepts a custom emoji per entity", () => {
    const out = renderTurnReport({
      created: [
        { label: "Custom", entityType: "task", emoji: "🚀", entityId: "ent_custom" },
      ],
      inspectorBaseUrl: "http://localhost:3180",
    });
    expect(out).toContain("🚀 Custom ([task](http://localhost:3180/inspector/entities/ent_custom))");
  });

  it("renders (no id — see Issues) when an entity lacks an entity_id", () => {
    const out = renderTurnReport({
      created: [{ label: "Orphan", entityType: "task" }],
    });
    expect(out).toContain("✅ Orphan (no id — see Issues)");
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

  it("falls back to NEOTOMA_BASE_URL, then NEOTOMA_FRONTEND_URL, then default", () => {
    const prevInspector = process.env.NEOTOMA_INSPECTOR_URL;
    const prevBase = process.env.NEOTOMA_BASE_URL;
    const prevFrontend = process.env.NEOTOMA_FRONTEND_URL;
    delete process.env.NEOTOMA_INSPECTOR_URL;
    process.env.NEOTOMA_BASE_URL = "http://localhost:3180/";
    try {
      expect(resolveInspectorBaseUrl()).toBe("http://localhost:3180");
    } finally {
      if (prevBase === undefined) delete process.env.NEOTOMA_BASE_URL;
      else process.env.NEOTOMA_BASE_URL = prevBase;
    }

    delete process.env.NEOTOMA_INSPECTOR_URL;
    delete process.env.NEOTOMA_BASE_URL;
    process.env.NEOTOMA_FRONTEND_URL = "http://frontend.example";
    try {
      expect(resolveInspectorBaseUrl()).toBe("http://frontend.example");
    } finally {
      if (prevInspector !== undefined) process.env.NEOTOMA_INSPECTOR_URL = prevInspector;
      if (prevBase !== undefined) process.env.NEOTOMA_BASE_URL = prevBase;
      if (prevFrontend === undefined) delete process.env.NEOTOMA_FRONTEND_URL;
      else process.env.NEOTOMA_FRONTEND_URL = prevFrontend;
    }

    const prevBase2 = process.env.NEOTOMA_BASE_URL;
    const prev2 = process.env.NEOTOMA_FRONTEND_URL;
    delete process.env.NEOTOMA_BASE_URL;
    delete process.env.NEOTOMA_FRONTEND_URL;
    try {
      expect(resolveInspectorBaseUrl()).toBe("http://localhost:3080");
    } finally {
      if (prevBase2 !== undefined) process.env.NEOTOMA_BASE_URL = prevBase2;
      if (prev2 !== undefined) process.env.NEOTOMA_FRONTEND_URL = prev2;
    }
  });
});
