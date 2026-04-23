/**
 * Signature-match heuristic for `kind=fix_verification` with
 * `outcome=verification_failed`.
 *
 * Score >= 3 reopens the parent as a regression; < 3 spawns a new child.
 * Agents can override with `routing_hint`.
 */

import type { StoredFeedback, VerificationRoutingHint } from "./types.js";

export interface RoutingDecision {
  route: "reopen_parent" | "new_child";
  score: number;
  reasons: string[];
  triage_note: string;
}

function envMatch(
  child: StoredFeedback,
  parent: StoredFeedback,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const childEnv = (child.metadata as any)?.environment ?? {};
  const parentEnv = (parent.metadata as any)?.environment ?? {};
  const childClass = (childEnv.error_class as string | undefined) ?? (child.metadata as any)?.error_class;
  const parentClass = (parentEnv.error_class as string | undefined) ?? (parent.metadata as any)?.error_class;
  if (childClass && parentClass && childClass === parentClass) {
    score += 2;
    reasons.push("error_class match");
  }
  const childTool = childEnv.tool_name as string | undefined;
  const parentTool = parentEnv.tool_name as string | undefined;
  const childShape = JSON.stringify(childEnv.invocation_shape ?? []);
  const parentShape = JSON.stringify(parentEnv.invocation_shape ?? []);
  if (childTool && parentTool && childTool === parentTool && childShape === parentShape) {
    score += 2;
    reasons.push("tool_name + invocation_shape match");
  }
  const childClient = childEnv.client_name as string | undefined;
  const parentClient = parentEnv.client_name as string | undefined;
  const childOs = (childEnv.os as string | undefined)?.toLowerCase();
  const parentOs = (parentEnv.os as string | undefined)?.toLowerCase();
  if (
    childClient &&
    parentClient &&
    childClient === parentClient &&
    childOs &&
    parentOs &&
    childOs === parentOs
  ) {
    score += 1;
    reasons.push("client_name + os class match");
  }
  return { score, reasons };
}

export function decideVerificationRouting(
  child: StoredFeedback,
  parent: StoredFeedback,
  hint: VerificationRoutingHint = "auto",
): RoutingDecision {
  if (parent.status === "removed") {
    return {
      route: "new_child",
      score: 0,
      reasons: ["parent is tombstoned"],
      triage_note:
        "Routed as new_child because parent feedback is tombstoned (status=removed).",
    };
  }
  if (hint === "reopen_parent") {
    return {
      route: "reopen_parent",
      score: -1,
      reasons: ["agent override: routing_hint=reopen_parent"],
      triage_note:
        "Routed as reopen_parent because agent forced routing_hint=reopen_parent.",
    };
  }
  if (hint === "new_child") {
    return {
      route: "new_child",
      score: -1,
      reasons: ["agent override: routing_hint=new_child"],
      triage_note: "Routed as new_child because agent forced routing_hint=new_child.",
    };
  }
  const { score, reasons } = envMatch(child, parent);
  if (score >= 3) {
    return {
      route: "reopen_parent",
      score,
      reasons,
      triage_note: `Routed as reopen_parent (score=${score}): ${reasons.join(", ") || "no signature match"}.`,
    };
  }
  return {
    route: "new_child",
    score,
    reasons,
    triage_note: `Routed as new_child (score=${score} below reopen threshold of 3).`,
  };
}

export type { VerificationRoutingHint };
