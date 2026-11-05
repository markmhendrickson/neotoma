/** Authored topic compositions. Coordinates and topology express the subject, not a color variant. */
export type TopicGlyph =
  | "source"
  | "claim"
  | "entity"
  | "fields"
  | "schema"
  | "client"
  | "terminal"
  | "editor"
  | "archive"
  | "key"
  | "gate"
  | "search"
  | "clock"
  | "package"
  | "catalog"
  | "code"
  | "copy";
export type TopicNode = readonly [
  TopicGlyph,
  number,
  number,
  number,
  number,
  ("cream" | "sage" | "blue")?,
];
export type TopicDrawingSpec = {
  nodes: readonly TopicNode[];
  edges: readonly (readonly [number, number])[];
  caption: string;
};
const drawing = (
  nodes: readonly TopicNode[],
  edges: readonly (readonly [number, number])[],
  caption: string
): TopicDrawingSpec => ({ nodes, edges, caption });

export const TOPIC_DRAWINGS = {
  topicStart: drawing(
    [
      ["source", 70, 90, 190, 250],
      ["entity", 355, 170, 200, 260],
      ["client", 660, 100, 170, 100],
      ["fields", 640, 340, 185, 175],
    ],
    [
      [0, 1],
      [1, 3],
      [2, 1],
    ],
    "Start with supplied material, maintain an entity, and let an agent read its selected fields."
  ),
  topicArchitecture: drawing(
    [
      ["source", 45, 120, 155, 220],
      ["claim", 275, 80, 165, 135],
      ["schema", 280, 340, 165, 145],
      ["entity", 530, 140, 165, 210],
      ["fields", 735, 250, 130, 180],
      ["client", 560, 440, 180, 90],
    ],
    [
      [0, 1],
      [1, 3],
      [2, 3],
      [3, 4],
      [5, 3],
    ],
    "Sources and observations enter a schema-governed system of record; agents use the resulting current view."
  ),
  topicVocabulary: drawing(
    [
      ["source", 75, 90, 160, 210],
      ["claim", 335, 60, 210, 140],
      ["entity", 640, 100, 160, 210],
      ["schema", 90, 360, 180, 130],
      ["fields", 370, 300, 170, 210],
      ["catalog", 640, 365, 170, 140],
    ],
    [],
    "Distinct shapes distinguish source material, observations, entities, schemas, snapshots, and the vocabulary that names them."
  ),
  topicCli: drawing(
    [
      ["terminal", 65, 185, 280, 190],
      ["claim", 445, 80, 155, 130],
      ["fields", 650, 250, 180, 230],
      ["archive", 420, 365, 170, 140],
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    "A terminal command submits structured fields, then reads the current state from the configured instance."
  ),
  topicRest: drawing(
    [
      ["code", 60, 80, 230, 190],
      ["gate", 370, 170, 140, 190],
      ["claim", 595, 70, 200, 130],
      ["fields", 610, 340, 200, 175],
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    "An application sends a configured HTTP request through authentication to structured writes and reads."
  ),
  topicInterfaces: drawing(
    [
      ["terminal", 60, 70, 195, 115],
      ["client", 60, 260, 195, 105],
      ["code", 60, 435, 195, 100],
      ["archive", 420, 180, 240, 260],
      ["fields", 730, 245, 120, 170],
    ],
    [
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 4],
    ],
    "CLI, MCP, and REST are different entrances to one configured system of record."
  ),
  topicIntegrations: drawing(
    [
      ["catalog", 55, 75, 255, 390],
      ["terminal", 410, 75, 170, 105],
      ["client", 645, 150, 175, 105],
      ["package", 410, 315, 170, 140],
      ["archive", 650, 355, 170, 150],
    ],
    [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 4],
      [2, 4],
      [3, 4],
    ],
    "Host paths differ: supported setup, manual MCP configuration, and native plugins require their own checks."
  ),
  topicRead: drawing(
    [
      ["catalog", 70, 110, 270, 370],
      ["search", 420, 205, 135, 135],
      ["entity", 650, 100, 170, 220],
      ["fields", 645, 390, 175, 125],
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    "Search or a stable identifier locates an entity; a structured read verifies its current fields."
  ),
  topicStore: drawing(
    [
      ["source", 55, 90, 180, 245],
      ["claim", 315, 65, 170, 135],
      ["claim", 315, 360, 170, 135, "blue"],
      ["entity", 620, 150, 210, 300],
    ],
    [
      [0, 1],
      [1, 3],
      [2, 3],
    ],
    "A correction contributes another observation to the same entity while the earlier claim remains available."
  ),
  topicCurrent: drawing(
    [
      ["claim", 65, 95, 180, 120],
      ["claim", 65, 375, 180, 120, "blue"],
      ["fields", 390, 160, 255, 310],
      ["schema", 705, 95, 145, 160],
    ],
    [
      [0, 2],
      [1, 2],
      [3, 2],
    ],
    "One current view can select different fields from different observations under the active rules."
  ),
  topicHistory: drawing(
    [
      ["clock", 65, 220, 110, 110],
      ["claim", 245, 110, 150, 175],
      ["claim", 475, 210, 150, 175, "blue"],
      ["fields", 700, 315, 150, 190],
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    "Earlier and later observations remain inspectable beside the currently selected fields."
  ),
  topicTrust: drawing(
    [
      ["source", 70, 150, 200, 280],
      ["key", 365, 65, 160, 125],
      ["gate", 375, 280, 140, 205],
      ["fields", 650, 135, 190, 280],
    ],
    [
      [0, 2],
      [1, 2],
      [2, 3],
    ],
    "Evidence, authenticated identity, and permitted access answer different trust questions."
  ),
  topicLocal: drawing(
    [
      ["client", 60, 235, 190, 120],
      ["gate", 350, 70, 480, 445, "sage"],
      ["archive", 425, 170, 220, 230],
      ["fields", 680, 275, 110, 150],
    ],
    [
      [0, 2],
      [2, 3],
    ],
    "A client reaches an archive inside the configured local instance; the boundary does not imply automatic sharing."
  ),
  topicBackup: drawing(
    [
      ["archive", 65, 130, 225, 290],
      ["fields", 375, 60, 180, 205],
      ["copy", 655, 80, 185, 180],
      ["archive", 610, 340, 225, 180],
    ],
    [
      [0, 1],
      [0, 3],
      [1, 2],
    ],
    "A current-state export and a recovery backup preserve different scopes of material."
  ),
  topicLicense: drawing(
    [
      ["source", 300, 75, 290, 440],
      ["copy", 65, 170, 155, 150],
      ["code", 675, 105, 145, 145],
      ["package", 675, 360, 145, 145],
    ],
    [
      [0, 1],
      [0, 2],
      [0, 3],
    ],
    "The MIT license permits reuse, modification, and distribution subject to its notice and warranty terms."
  ),
  topicLimits: drawing(
    [
      ["client", 75, 85, 180, 110],
      ["gate", 380, 100, 140, 360],
      ["source", 675, 65, 160, 205],
      ["fields", 675, 350, 160, 180],
      ["key", 95, 380, 150, 120],
    ],
    [
      [0, 1],
      [4, 1],
    ],
    "Check access, supplied evidence, and supported effects before assuming a route reaches the intended state."
  ),
  topicInstall: drawing(
    [
      ["client", 65, 180, 200, 150],
      ["archive", 340, 145, 225, 205],
      ["entity", 655, 180, 175, 150],
    ],
    [
      [0, 1],
      [1, 2],
    ],
    "An AI tool uses its selected connection route to reach a configured Neotoma instance; that instance stores records. Verify the intended instance before writing."
  ),
  guideClaudeCode: drawing(
    [
      ["terminal", 65, 85, 250, 155],
      ["schema", 410, 70, 165, 190],
      ["archive", 650, 245, 190, 235],
      ["client", 135, 370, 205, 115],
    ],
    [
      [0, 1],
      [1, 2],
      [3, 2],
    ],
    "Claude Code uses its configured MCP route; hooks and skills remain separate checks."
  ),
  guideCursor: drawing(
    [
      ["editor", 60, 130, 285, 320],
      ["code", 430, 75, 170, 150],
      ["schema", 430, 365, 170, 150],
      ["archive", 690, 210, 155, 210],
    ],
    [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
    ],
    "Cursor's project or user configuration identifies the Neotoma server that its tools can call."
  ),
  guideCodex: drawing(
    [
      ["terminal", 65, 70, 260, 150],
      ["catalog", 390, 260, 180, 230],
      ["archive", 665, 110, 180, 250],
      ["key", 100, 375, 150, 125],
    ],
    [
      [0, 1],
      [1, 2],
      [3, 1],
    ],
    "Codex CLI reads configured server entries; remote authentication is a separate host-specific step."
  ),
  guideOpenclaw: drawing(
    [
      ["package", 80, 80, 180, 170],
      ["client", 370, 190, 225, 145],
      ["archive", 700, 125, 145, 230],
      ["schema", 390, 410, 170, 125],
    ],
    [
      [0, 1],
      [1, 2],
      [3, 1],
    ],
    "The OpenClaw native plugin is installed separately from Neotoma's optional setup layers."
  ),
  guideDesktop: drawing(
    [
      ["client", 65, 95, 300, 350],
      ["code", 450, 70, 160, 180],
      ["archive", 675, 280, 165, 220],
    ],
    [
      [0, 1],
      [1, 2],
    ],
    "Claude Desktop's user-level server configuration connects the desktop client to Neotoma."
  ),
  guideChatgpt: drawing(
    [
      ["client", 65, 180, 240, 170],
      ["key", 390, 70, 145, 110],
      ["gate", 390, 290, 145, 190],
      ["archive", 660, 160, 185, 270],
    ],
    [
      [0, 2],
      [1, 2],
      [2, 3],
    ],
    "ChatGPT needs a reachable authenticated HTTPS MCP endpoint, rather than a local stdio registration."
  ),
  guideWindsurf: drawing(
    [
      ["editor", 60, 110, 260, 370],
      ["catalog", 400, 65, 190, 135],
      ["schema", 420, 350, 170, 160],
      ["archive", 705, 230, 140, 210],
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    "Check the installed Windsurf version and its actual configuration format before testing the MCP route."
  ),
  guideContinue: drawing(
    [
      ["editor", 65, 100, 235, 340],
      ["schema", 385, 70, 190, 135],
      ["code", 385, 360, 190, 155],
      ["archive", 685, 180, 160, 240],
    ],
    [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
    ],
    "Continue can use its YAML or MCP-server JSON configuration; verify tools in Agent mode."
  ),
  guideVscode: drawing(
    [
      ["editor", 70, 65, 280, 410],
      ["catalog", 430, 90, 160, 125],
      ["schema", 440, 325, 150, 170],
      ["archive", 705, 200, 140, 210],
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    "VS Code's Add Server flow and its servers configuration lead to the host's Agent-mode tools."
  ),
  guideIronclaw: drawing(
    [
      ["terminal", 65, 85, 235, 155],
      ["key", 365, 70, 145, 105],
      ["schema", 365, 330, 180, 180],
      ["archive", 680, 180, 165, 235],
    ],
    [
      [0, 2],
      [1, 2],
      [2, 3],
    ],
    "Use IronClaw's installed MCP registration and authentication options; it is not a Neotoma setup target."
  ),
  guideLetta: drawing(
    [
      ["client", 65, 65, 190, 125],
      ["code", 350, 100, 235, 200],
      ["gate", 370, 390, 160, 125],
      ["archive", 695, 220, 150, 230],
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    "Letta's server-side tool integration must reach the configured Neotoma endpoint with the required access."
  ),
  guideOpencode: drawing(
    [
      ["terminal", 65, 215, 240, 155],
      ["code", 410, 70, 180, 170],
      ["client", 405, 365, 190, 120],
      ["archive", 705, 185, 140, 235],
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    "OpenCode's own MCP configuration determines the tools available to its agent."
  ),
  guideSdk: drawing(
    [
      ["code", 65, 90, 265, 225],
      ["schema", 410, 70, 170, 160],
      ["client", 420, 345, 175, 140],
      ["archive", 710, 215, 135, 220],
    ],
    [
      [0, 1],
      [0, 2],
      [2, 3],
    ],
    "The Claude Agent SDK application supplies MCP configuration and controls the agent's permitted tool use."
  ),
  guideSmithery: drawing(
    [
      ["catalog", 65, 85, 240, 350],
      ["package", 405, 65, 180, 155],
      ["schema", 405, 370, 180, 145],
      ["archive", 700, 205, 145, 215],
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    "Smithery is a registry and installation path; verify the resulting Neotoma connection in the actual host."
  ),
} as const;
export type TopicDrawingId = keyof typeof TOPIC_DRAWINGS;
