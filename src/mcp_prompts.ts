/**
 * MCP prompts (`prompts/list`, `prompts/get`).
 *
 * Claude renders each prompt's NAME as the chip text on a connector page, so
 * names are short, human-readable phrases rather than identifiers. Every
 * argument is optional: a chip click sends no arguments, and each prompt must
 * still produce a useful request without them.
 *
 * Prompts are static text with no tenant data, so they are served the same way
 * `tools/list` serves static definitions: no database access and no identity
 * needed to list or render them. Any tool call the rendered prompt leads to is
 * still auth-gated as usual.
 *
 * These deliberately do not restate the server instructions. Retrieval and
 * storage behaviour come from the live MCP instructions; a prompt only says
 * what the user wants and, for setup / health / recovery, points at the
 * matching onboarding skill shipped in the Claude plugin
 * (`packages/claude-code-plugin/skills/`), with a short fallback for clients
 * that do not have the plugin installed.
 *
 * The plugin mirrors these as `commands/<name>.md`; a unit test keeps the two
 * sets of names equal.
 */

export interface NeotomaPromptArgument {
  name: string;
  description: string;
  required: false;
}

export interface NeotomaPromptDefinition {
  name: string;
  title: string;
  description: string;
  arguments: NeotomaPromptArgument[];
  render(args: Record<string, string | undefined>): string;
}

function arg(args: Record<string, string | undefined>, key: string): string | undefined {
  const value = args[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Shared caution for prompts that write: the default connector may be the public sandbox. */
export const SANDBOX_CAUTION =
  "Before storing, check which Neotoma I am connected to (`get_session_identity`). If it is the shared public sandbox, tell me that anything stored there is visible to other people and gets wiped, and store only after I confirm.";

export const NEOTOMA_MCP_PROMPTS: readonly NeotomaPromptDefinition[] = [
  {
    name: "set-up-neotoma",
    title: "Set up Neotoma",
    description:
      "Walk through first-time setup: confirm the connection, pick one workflow, turn on only what you confirm, and save a first record.",
    arguments: [
      {
        name: "workflow",
        description: "Optional. The one workflow to start with, e.g. contacts, meetings, finances.",
        required: false,
      },
    ],
    render(args) {
      const workflow = arg(args, "workflow");
      return [
        "Set up Neotoma for me.",
        "If the Neotoma `setup` skill is available, follow it step by step. Otherwise:",
        "1. Confirm the Neotoma connector answers (call `get_session_identity`) and tell me which Neotoma I am connected to. If it is the shared public sandbox, warn me that anything stored there is visible to other people and gets wiped, and use made-up test data only.",
        workflow
          ? `2. We are starting with one workflow: ${workflow}.`
          : "2. Ask me to pick ONE workflow to start with.",
        "3. List bundles (`manage_bundles` with action `list`) and propose only the ones that fit that workflow, saying why for each.",
        "4. Enable only the bundles I confirm.",
        "5. Store one first record from that workflow (made-up test data on the sandbox), then read it back and show me what was saved.",
      ].join("\n");
    },
  },
  {
    name: "what-do-you-remember-about",
    title: "What do you remember about…",
    description:
      "Ask what Neotoma holds about a person, project, or topic, with where each fact came from.",
    arguments: [
      {
        name: "topic",
        description: "Optional. The person, company, project, or topic to look up.",
        required: false,
      },
    ],
    render(args) {
      const topic = arg(args, "topic");
      return topic
        ? `What do you remember about ${topic}? Answer from what is stored in Neotoma, say where each fact came from, and tell me plainly if nothing is stored.`
        : "Ask me which person, project, or topic I mean. Then answer from what is stored in Neotoma, say where each fact came from, and tell me plainly if nothing is stored.";
    },
  },
  {
    name: "remember-this",
    title: "Remember this",
    description: "Save something to Neotoma and read it back so you can see what was stored.",
    arguments: [
      {
        name: "content",
        description: "Optional. What to remember. If empty, Claude asks.",
        required: false,
      },
    ],
    render(args) {
      const content = arg(args, "content");
      const ask = content
        ? `Remember this in Neotoma:\n\n${content}\n\nThen read it back and show me exactly what was saved.`
        : "Ask me what to remember, or offer to save the key facts from our conversation so far. Store only what I confirm, then read it back and show me exactly what was saved.";
      return `${ask}\n\n${SANDBOX_CAUTION}`;
    },
  },
  {
    name: "what-changed-recently",
    title: "What changed recently",
    description: "Summarise the most recent changes in Neotoma, grouped by kind of record.",
    arguments: [
      {
        name: "since",
        description: "Optional. How far back to look, e.g. today, this week, since Monday.",
        required: false,
      },
    ],
    render(args) {
      const since = arg(args, "since");
      const window = since ? ` ${since}` : " recently";
      return `What changed in Neotoma${window}? Use \`list_recent_changes\`, group the changes by kind of record, and keep it short.`;
    },
  },
  {
    name: "check-neotoma",
    title: "Check Neotoma",
    description:
      "Health check: is Neotoma connected, which instance answered, and do reads work. Writes nothing.",
    arguments: [],
    render() {
      return [
        "Check my Neotoma connection. Do not write anything.",
        "If the Neotoma `check` skill is available, follow it. Otherwise:",
        "1. Call `get_session_identity` and tell me whether I am connected and signed in.",
        "2. Tell me which Neotoma answered (server name and version, and whether it is the public sandbox).",
        "3. Read one recent record (`list_recent_changes` with limit 1) to confirm reads work.",
        "4. Check that exactly one Neotoma connector is available. Two sets of Neotoma tools means a duplicate connector: report it as a failure and say which one to turn off.",
        "If any step fails, follow the Neotoma `recover` skill, or tell me what to try next.",
      ].join("\n");
    },
  },
];

/** `prompts/list` result entries. */
export function listNeotomaPrompts(): Array<{
  name: string;
  title: string;
  description: string;
  arguments: NeotomaPromptArgument[];
}> {
  return NEOTOMA_MCP_PROMPTS.map((p) => ({
    name: p.name,
    title: p.title,
    description: p.description,
    arguments: p.arguments.map((a) => ({ ...a })),
  }));
}

/**
 * `prompts/get` result, or null when no prompt has that name. Unknown argument
 * keys are ignored; non-string values are treated as absent.
 */
export function getNeotomaPrompt(
  name: string,
  args: Record<string, unknown> | undefined
): {
  description: string;
  messages: Array<{ role: "user"; content: { type: "text"; text: string } }>;
} | null {
  const prompt = NEOTOMA_MCP_PROMPTS.find((p) => p.name === name);
  if (!prompt) return null;
  const stringArgs: Record<string, string | undefined> = {};
  for (const a of prompt.arguments) {
    const value = args?.[a.name];
    stringArgs[a.name] = typeof value === "string" ? value : undefined;
  }
  return {
    description: prompt.description,
    messages: [{ role: "user", content: { type: "text", text: prompt.render(stringArgs) } }],
  };
}

/**
 * Markdown for the Claude plugin command that mirrors a prompt
 * (`packages/claude-code-plugin/commands/<name>.md`). The body is the prompt's
 * own rendering, with the command's `$ARGUMENTS` in place of the argument and
 * the no-argument rendering as the fallback, so the two never drift.
 * Regenerate with `npx tsx scripts/generate_claude_plugin_commands.ts`.
 */
export function renderPluginCommandMarkdown(prompt: NeotomaPromptDefinition): string {
  const header = [
    "---",
    `description: ${JSON.stringify(prompt.description)}`,
    ...(prompt.arguments.length > 0
      ? [`argument-hint: ${JSON.stringify(`[${prompt.arguments[0].name}]`)}`]
      : []),
    "---",
    "",
    `<!-- Generated from src/mcp_prompts.ts (${prompt.name}). Do not edit; run scripts/generate_claude_plugin_commands.ts. -->`,
    "",
  ];
  if (prompt.arguments.length === 0) {
    return [...header, prompt.render({}), ""].join("\n");
  }
  const argName = prompt.arguments[0].name;
  return [
    ...header,
    prompt.render({ [argName]: "$ARGUMENTS" }),
    "",
    `If no ${argName} was given after the command, do this instead:`,
    "",
    prompt.render({}),
    "",
  ].join("\n");
}
