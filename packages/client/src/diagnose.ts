/**
 * Per-turn Neotoma diagnosis and auto-repair helpers.
 *
 * These helpers implement the invariant-checking + auto-repair contract
 * declared in the consumer-repo rule `neotoma_invariants.mdc`. Callers
 * (agent harnesses, hook plugins, tests) can use them to detect common
 * persistence gaps, optionally apply same-turn repairs, and surface the
 * results in a turn report.
 *
 * The shapes here are intentionally narrow: callers describe what they
 * observed during the turn (which Neotoma operations ran, which messages
 * were stored, what attachments were mentioned) and this module returns a
 * list of structured `Diagnosis` issues with severity and a suggested
 * repair action. Execution of the repairs is left to the caller so they
 * can decide whether to auto-apply, prompt the user, or log.
 */

import type { NeotomaTransport, StoreEntityInput } from "./types.js";

export type DiagnosisSeverity = "ok" | "warn" | "error";

export interface Diagnosis {
  id: string;
  severity: DiagnosisSeverity;
  message: string;
  /** What this means for the current turn's storage or retrieval right now. */
  immediateMeaning?: string;
  /** What this would continue to mean generally if left unresolved. */
  ongoingRisk?: string;
  /** The recommended next resolution step, phrased for the user. */
  recommendedResolution?: string;
  suggestedRepair?: RepairAction;
}

export type RepairAction =
  | {
      type: "store_missing_user_message";
      conversationId: string;
      turnId: string;
      content: string;
    }
  | {
      type: "store_missing_assistant_message";
      conversationId: string;
      turnId: string;
      content: string;
    }
  | {
      type: "store_missing_attachment";
      conversationId: string;
      turnId: string;
      filePath: string;
    }
  | {
      type: "record_neotoma_repair";
      conversationId: string;
      turnId: string;
      diagnoses: Diagnosis[];
    };

export interface TurnObservation {
  conversationId: string;
  turnId: string;
  userMessage?: { content: string; stored: boolean };
  assistantMessage?: { content: string; stored: boolean };
  attachments?: Array<{ filePath: string; stored: boolean }>;
  /** Lowercased identifiers of non-Neotoma tools invoked this turn. */
  toolsInvoked?: string[];
  /**
   * True when at least one MCP **`store`** call ran before the
   * non-Neotoma tools in `toolsInvoked`. False means the agent violated
   * the store-first ordering.
   */
  storeFirstSatisfied?: boolean;
  /**
   * True when the assistant produced a user-visible reply. Combined with
   * `assistantMessage.stored === false` this triggers the closing-store
   * gap.
   */
  assistantReplyProduced?: boolean;
  /**
   * References to Parquet detected in materials consulted this turn
   * (rule bodies, scripts, docs). Any entry here violates the
   * Parquet-residue invariant.
   */
  parquetResidueReferences?: string[];
}

/**
 * Run the invariant checks for one turn and return a structured list of
 * diagnoses. `ok` diagnoses are included so callers can render a complete
 * checklist in the turn report.
 */
export function diagnoseTurn(observation: TurnObservation): Diagnosis[] {
  const out: Diagnosis[] = [];

  if (observation.userMessage) {
    if (observation.userMessage.stored) {
      out.push({ id: "user-message-stored", severity: "ok", message: "User message stored." });
    } else {
      out.push({
        id: "user-message-missing",
        severity: "error",
        message: "User message was not stored in Neotoma.",
        immediateMeaning:
          "This turn's user input is missing from Neotoma, so the conversation record for this turn is incomplete right now.",
        ongoingRisk:
          "Future recall, auditing, and any repair logic for this conversation can remain incomplete because the turn starts with a missing user record.",
        recommendedResolution:
          "Backfill the missing user `agent_message` immediately using the canonical chat-turn or repair helper.",
        suggestedRepair: {
          type: "store_missing_user_message",
          conversationId: observation.conversationId,
          turnId: observation.turnId,
          content: observation.userMessage.content,
        },
      });
    }
  }

  if (observation.assistantReplyProduced && observation.assistantMessage) {
    if (observation.assistantMessage.stored) {
      out.push({ id: "assistant-message-stored", severity: "ok", message: "Assistant reply stored." });
    } else {
      out.push({
        id: "assistant-message-missing",
        severity: "error",
        message:
          "Assistant produced a user-visible reply but the closing assistant agent_message was not stored.",
        immediateMeaning:
          "The assistant side of this turn is absent from Neotoma, so the stored conversation currently stops short of the actual reply.",
        ongoingRisk:
          "Future retrievals of the thread can show an incomplete turn history and make repair or provenance review misleading.",
        recommendedResolution:
          "Store the missing assistant `agent_message` now with the canonical closing-store helper.",
        suggestedRepair: {
          type: "store_missing_assistant_message",
          conversationId: observation.conversationId,
          turnId: observation.turnId,
          content: observation.assistantMessage.content,
        },
      });
    }
  }

  if (observation.attachments && observation.attachments.length > 0) {
    for (const attachment of observation.attachments) {
      if (attachment.stored) {
        out.push({
          id: `attachment-stored:${attachment.filePath}`,
          severity: "ok",
          message: `Attachment stored: ${attachment.filePath}`,
        });
      } else {
        out.push({
          id: `attachment-missing:${attachment.filePath}`,
          severity: "error",
          message: `Attachment was referenced but not stored: ${attachment.filePath}`,
          immediateMeaning:
            "The current turn refers to a file that Neotoma cannot inspect or retrieve because the file asset was never stored.",
          ongoingRisk:
            "Any entities derived from that file lose durable source provenance, and later reviews cannot reopen the original artifact from Neotoma.",
          recommendedResolution:
            "Store the missing attachment now via the combined file-preserving path and link it back to the turn.",
          suggestedRepair: {
            type: "store_missing_attachment",
            conversationId: observation.conversationId,
            turnId: observation.turnId,
            filePath: attachment.filePath,
          },
        });
      }
    }
  }

  if (
    observation.toolsInvoked &&
    observation.toolsInvoked.length > 0 &&
    observation.storeFirstSatisfied === false
  ) {
    out.push({
      id: "store-first-violation",
      severity: "warn",
      message:
        "Non-Neotoma tools ran before the user-phase MCP `store` call. Store first, then use other tools.",
      immediateMeaning:
        "This turn used external or host tools before anchoring the user message in Neotoma, so current work may have started from an unpersisted turn state.",
      ongoingRisk:
        "If this pattern continues, missed or out-of-order turn persistence becomes more likely and troubleshooting provenance gets harder.",
      recommendedResolution:
        "Run the user-phase store before any other tools on future turns; if the user message is still missing, backfill it now.",
    });
  }

  if (observation.parquetResidueReferences && observation.parquetResidueReferences.length > 0) {
    out.push({
      id: "parquet-residue",
      severity: "error",
      message: `Parquet references detected in consulted materials: ${observation.parquetResidueReferences.join(
        ", "
      )}. Neotoma is the only data store; remove or rewrite in the same turn.`,
      immediateMeaning:
        "This turn touched instructions or code that still point at Parquet, so the current workflow is at risk of using an invalid storage or retrieval path.",
      ongoingRisk:
        "If left unresolved, agents can regress into split-brain behavior, stale reads, or writes outside Neotoma's canonical contract.",
      recommendedResolution:
        "Remove or rewrite the Parquet reference immediately so the workflow routes only through Neotoma.",
    });
  }

  return out;
}

export interface RepairOutcome {
  diagnosis: Diagnosis;
  applied: boolean;
  error?: string;
}

/**
 * Apply the suggested repairs for each non-ok diagnosis. The caller
 * provides a transport; this helper translates each `RepairAction` into
 * the appropriate `store` call. A summary `neotoma_repair` entity is
 * always emitted at the end so the turn report can cite it.
 */
export async function applyRepairs(
  transport: Pick<NeotomaTransport, "store">,
  diagnoses: Diagnosis[],
  conversationId: string,
  turnId: string
): Promise<RepairOutcome[]> {
  const outcomes: RepairOutcome[] = [];

  for (const d of diagnoses) {
    if (d.severity === "ok" || !d.suggestedRepair) continue;
    try {
      await runRepair(transport, d.suggestedRepair);
      outcomes.push({ diagnosis: d, applied: true });
    } catch (err) {
      outcomes.push({ diagnosis: d, applied: false, error: (err as Error).message });
    }
  }

  const issues = diagnoses.filter((d) => d.severity !== "ok");
  if (issues.length > 0) {
    try {
      const repairEntity: StoreEntityInput = {
        entity_type: "neotoma_repair",
        conversation_id: conversationId,
        turn_id: turnId,
        issues: issues.map((d) => ({
          id: d.id,
          severity: d.severity,
          message: d.message,
        })),
        repair_count: outcomes.filter((o) => o.applied).length,
        repair_errors: outcomes.filter((o) => !o.applied).map((o) => ({
          id: o.diagnosis.id,
          error: o.error,
        })),
      };
      await transport.store({
        entities: [repairEntity],
        idempotency_key: `neotoma-repair-${conversationId}-${turnId}`,
      });
    } catch {
      /* best-effort */
    }
  }

  return outcomes;
}

async function runRepair(
  transport: Pick<NeotomaTransport, "store">,
  action: RepairAction
): Promise<void> {
  switch (action.type) {
    case "store_missing_user_message":
      await transport.store({
        entities: [
          {
            entity_type: "conversation_message",
            role: "user",
            sender_kind: "user",
            content: action.content,
            turn_key: `${action.conversationId}:${action.turnId}`,
            data_source: "neotoma-repair",
          },
        ],
        idempotency_key: `repair-user-${action.conversationId}-${action.turnId}`,
      });
      return;
    case "store_missing_assistant_message":
      await transport.store({
        entities: [
          {
            entity_type: "conversation_message",
            role: "assistant",
            sender_kind: "assistant",
            content: action.content,
            turn_key: `${action.conversationId}:${action.turnId}:assistant`,
            data_source: "neotoma-repair",
          },
        ],
        idempotency_key: `repair-assistant-${action.conversationId}-${action.turnId}`,
      });
      return;
    case "store_missing_attachment":
      await transport.store({
        entities: [
          {
            entity_type: "file_asset",
            original_filename: action.filePath.split("/").pop(),
            data_source: "neotoma-repair",
          },
        ],
        file_path: action.filePath,
        idempotency_key: `repair-attachment-${action.conversationId}-${action.turnId}-${action.filePath}`,
      });
      return;
    case "record_neotoma_repair":
      await transport.store({
        entities: [
          {
            entity_type: "neotoma_repair",
            conversation_id: action.conversationId,
            turn_id: action.turnId,
            issues: action.diagnoses.map((d) => ({ id: d.id, severity: d.severity, message: d.message })),
          },
        ],
        idempotency_key: `neotoma-repair-${action.conversationId}-${action.turnId}-manual`,
      });
      return;
  }
}

/**
 * Convenience: check whether any diagnosis is an error-level gap.
 */
export function hasErrors(diagnoses: Diagnosis[]): boolean {
  return diagnoses.some((d) => d.severity === "error");
}
