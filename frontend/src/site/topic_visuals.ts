import type { PaperSceneKind } from "../components/onepager/PaperSceneDrawing";
import { TOPIC_DRAWINGS, type TopicDrawingId } from "./topic_drawings";
const drawing = (id: TopicDrawingId) => ({
  scene: id,
  alt: TOPIC_DRAWINGS[id].caption,
  caption: TOPIC_DRAWINGS[id].caption,
});
/** A topic owns a composition; cards reuse the destination's identity, never a collection fallback. */
export const TOPIC_VISUALS = {
  install: drawing("topicInstall"),
  readme: drawing("topicStart"),
  cli: drawing("topicCli"),
  mcp: {
    scene: "localService",
    alt: "An MCP client reaches a configured archive",
    caption: "Configure your chosen MCP client to reach the Neotoma instance.",
  },
  "rest-api": drawing("topicRest"),
  integrations: drawing("topicIntegrations"),
  architecture: drawing("topicArchitecture"),
  vocabulary: drawing("topicVocabulary"),
  interfaces: drawing("topicInterfaces"),
  "read-search": drawing("topicRead"),
  "store-correct": drawing("topicStore"),
  recordModel: {
    scene: "entity",
    alt: "Two observations with matching type and identifying marks connect to one stable entity",
    caption: "The same type and identifying fields resolve two observations to one entity.",
  },
  observations: {
    scene: "observation",
    alt: "A document and an email connect to separately recorded observations",
    caption: "Each supplied source remains separate from the observation recorded from it.",
  },
  currentSnapshot: drawing("topicCurrent"),
  schemas: {
    scene: "reducer",
    alt: "A field rule selects a contribution from each stack of observations",
    caption: "Explicit field rules select or combine the contributions to current values.",
  },
  provenance: {
    scene: "invoiceExample",
    alt: "An invoice and later email each link through a retained observation to a current record field",
    caption: "In this invoice example, follow each current field through its retained observation to the supplied PDF or email.",
  },
  history: drawing("topicHistory"),
  trust: drawing("topicTrust"),
  localFirst: drawing("topicLocal"),
  "export-backup": drawing("topicBackup"),
  license: drawing("topicLicense"),
  limitations: drawing("topicLimits"),
  "install-claude-code": drawing("guideClaudeCode"),
  "install-cursor": drawing("guideCursor"),
  "install-codex": drawing("guideCodex"),
  "install-openclaw": drawing("guideOpenclaw"),
  "install-claude-desktop": drawing("guideDesktop"),
  "install-chatgpt": drawing("guideChatgpt"),
  "install-windsurf": drawing("guideWindsurf"),
  "install-continue": drawing("guideContinue"),
  "install-vscode": drawing("guideVscode"),
  "install-ironclaw": drawing("guideIronclaw"),
  "install-letta": drawing("guideLetta"),
  "install-opencode": drawing("guideOpencode"),
  "install-claude-agent-sdk": drawing("guideSdk"),
  "install-smithery": drawing("guideSmithery"),
} as const satisfies Record<string, { scene: PaperSceneKind; alt: string; caption: string }>;
export type TopicVisualId = keyof typeof TOPIC_VISUALS;
export function visualIdForTopic(id: string): TopicVisualId | undefined {
  const aliases: Record<string, TopicVisualId> = {
    "local-first": "localFirst",
    "current-snapshot": "currentSnapshot",
    "record-model": "recordModel",
  };
  const key = aliases[id] ?? id;
  return Object.prototype.hasOwnProperty.call(TOPIC_VISUALS, key)
    ? (key as TopicVisualId)
    : undefined;
}
