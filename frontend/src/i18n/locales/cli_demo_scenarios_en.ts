import type {
  HomeCliDemoChatScenario,
  HomeCliDemoTerminalScenario,
} from "@/i18n/locales/home_body_types";

export const CLI_DEMO_CLI_SCENARIOS_EN: HomeCliDemoTerminalScenario[] = [
  {
    label: "Cross-tool sync",
    steps: [
      {
        comment: "Store a contact from any agent session",
        command:
          'neotoma store --json=\'[{"entity_type":"contact", "name":"Sarah Chen", "email":"sarah@newstartup.io"}]\'',
        output: ["Stored 1 entity: contact \u00b7 sarah-chen \u00b7 v1"],
      },
      {
        comment: "Query from a different tool \u2014 same state",
        command: 'neotoma entities search "Sarah Chen"',
        output: [
          "contact \u00b7 sarah-chen \u00b7 v3 \u00b7 updated 2h ago",
          "  email: sarah@newstartup.io <changed>(changed from sarah@oldcompany.com in v2)</changed>",
        ],
      },
      {
        comment: "Show version history for this contact",
        command: "neotoma history sarah-chen",
        output: [
          "v3 \u00b7 2h ago \u00b7 Cursor session #412 \u00b7 email \u2192 sarah@newstartup.io",
          "v2 \u00b7 3d ago \u00b7 Claude Code \u00b7 email \u2192 sarah@oldcompany.com",
          "v1 \u00b7 2w ago \u00b7 ChatGPT \u00b7 initial import",
        ],
      },
    ],
  },
  {
    label: "Replay & debug",
    steps: [
      {
        comment: "Pipeline run #47 gave wrong output \u2014 what did the agent believe?",
        command: "neotoma replay --entity acme-corp --at 2025-03-15T14:30:00",
        output: [
          "State at 2025-03-15 14:30:00:",
          "  company \u00b7 acme-corp \u00b7 v4",
          "  status: active_client  \u00b7  revenue: $48,000",
          "  primary_contact: james@acme.com",
        ],
      },
      {
        comment: "Compare state between two pipeline runs",
        command: "neotoma diff acme-corp v4 v6",
        output: [
          "<changed>\u2212 status: active_client</changed>",
          "<added>\u002B status: churned</added>",
          "<changed>\u2212 revenue: $48,000</changed>",
          "<added>\u002B revenue: $0</added>",
          "  Changed by: Claude Code session #318 \u00b7 3d ago",
        ],
      },
      {
        comment: "Trace which session caused the state change",
        command: "neotoma history acme-corp --field status",
        output: [
          "v6 \u00b7 3d ago \u00b7 Claude Code #318 \u00b7 status \u2192 churned",
          "v4 \u00b7 2w ago \u00b7 Cursor #290 \u00b7 status \u2192 active_client",
          "v1 \u00b7 1mo ago \u00b7 ChatGPT \u00b7 status \u2192 prospect",
        ],
      },
    ],
  },
];

export const CLI_DEMO_AGENTIC_SCENARIOS_EN: HomeCliDemoTerminalScenario[] = [
  {
    label: "Cross-tool sync",
    steps: [
      {
        comment: "Cursor agent stores a contact during your conversation",
        command:
          'store({ entities: [{ entity_type: "contact", name: "Sarah Chen", email: "sarah@newstartup.io" }] })',
        output: ["entity_id: sarah-chen \u00b7 version: 1 \u00b7 stored"],
      },
      {
        comment: "Claude Code retrieves the same contact \u2014 no export needed",
        command: 'retrieve_entity_by_identifier({ identifier: "Sarah Chen" })',
        output: [
          "contact \u00b7 sarah-chen \u00b7 v3 \u00b7 updated 2h ago",
          "  email: sarah@newstartup.io <changed>(changed from sarah@oldcompany.com in v2)</changed>",
        ],
      },
      {
        comment: "Any agent can inspect the full version trail",
        command: 'list_observations({ entity_id: "sarah-chen" })',
        output: [
          "v3 \u00b7 2h ago \u00b7 Cursor session #412 \u00b7 email \u2192 sarah@newstartup.io",
          "v2 \u00b7 3d ago \u00b7 Claude Code \u00b7 email \u2192 sarah@oldcompany.com",
          "v1 \u00b7 2w ago \u00b7 ChatGPT \u00b7 initial import",
        ],
      },
    ],
  },
  {
    label: "Replay & debug",
    steps: [
      {
        comment: "Pipeline gave wrong output \u2014 agent inspects state at that time",
        command:
          'retrieve_entity_snapshot({ identifier: "acme-corp", at: "2025-03-15T14:30:00" })',
        output: [
          "State at 2025-03-15 14:30:00:",
          "  company \u00b7 acme-corp \u00b7 v4",
          "  status: active_client  \u00b7  revenue: $48,000",
          "  primary_contact: james@acme.com",
        ],
      },
      {
        comment: "Agent diffs between versions to find the regression",
        command:
          'diff_entity({ identifier: "acme-corp", from_version: 4, to_version: 6 })',
        output: [
          "<changed>\u2212 status: active_client</changed>",
          "<added>\u002B status: churned</added>",
          "<changed>\u2212 revenue: $48,000</changed>",
          "<added>\u002B revenue: $0</added>",
          "  Changed by: Claude Code session #318 \u00b7 3d ago",
        ],
      },
      {
        comment: "Agent traces which session caused the state change",
        command: 'list_observations({ entity_id: "acme-corp", field: "status" })',
        output: [
          "v6 \u00b7 3d ago \u00b7 Claude Code #318 \u00b7 status \u2192 churned",
          "v4 \u00b7 2w ago \u00b7 Cursor #290 \u00b7 status \u2192 active_client",
          "v1 \u00b7 1mo ago \u00b7 ChatGPT \u00b7 status \u2192 prospect",
        ],
      },
    ],
  },
];

export const CLI_DEMO_API_SCENARIOS_EN: HomeCliDemoTerminalScenario[] = [
  {
    label: "Cross-tool sync",
    steps: [
      {
        comment: "Store a contact via the REST API",
        command:
          "curl -s -X POST localhost:3080/store -H 'Content-Type: application/json' -d '{\"entities\":[{\"entity_type\":\"contact\",\"name\":\"Sarah Chen\",\"email\":\"sarah@newstartup.io\"}]}'",
        output: [
          '{ "entities": [{ "entity_id": "sarah-chen", "entity_type": "contact", "version": 1 }] }',
        ],
      },
      {
        comment: "Search for the contact from any HTTP client",
        command: 'curl -s "localhost:3080/entities/search?identifier=Sarah+Chen"',
        output: [
          "contact \u00b7 sarah-chen \u00b7 v3 \u00b7 updated 2h ago",
          "  email: sarah@newstartup.io <changed>(changed from sarah@oldcompany.com in v2)</changed>",
        ],
      },
      {
        comment: "Retrieve full observation history",
        command: 'curl -s "localhost:3080/entities/sarah-chen/observations"',
        output: [
          "v3 \u00b7 2h ago \u00b7 Cursor session #412 \u00b7 email \u2192 sarah@newstartup.io",
          "v2 \u00b7 3d ago \u00b7 Claude Code \u00b7 email \u2192 sarah@oldcompany.com",
          "v1 \u00b7 2w ago \u00b7 ChatGPT \u00b7 initial import",
        ],
      },
    ],
  },
  {
    label: "Replay & debug",
    steps: [
      {
        comment: "Retrieve entity state at a specific point in time",
        command:
          'curl -s "localhost:3080/entities/acme-corp/snapshot?at=2025-03-15T14:30:00"',
        output: [
          "State at 2025-03-15 14:30:00:",
          "  company \u00b7 acme-corp \u00b7 v4",
          "  status: active_client  \u00b7  revenue: $48,000",
          "  primary_contact: james@acme.com",
        ],
      },
      {
        comment: "Diff between two entity versions",
        command: 'curl -s "localhost:3080/entities/acme-corp/diff?from=4&to=6"',
        output: [
          "<changed>\u2212 status: active_client</changed>",
          "<added>\u002B status: churned</added>",
          "<changed>\u2212 revenue: $48,000</changed>",
          "<added>\u002B revenue: $0</added>",
          "  Changed by: Claude Code session #318 \u00b7 3d ago",
        ],
      },
      {
        comment: "List observations filtered by field",
        command:
          'curl -s "localhost:3080/entities/acme-corp/observations?field=status"',
        output: [
          "v6 \u00b7 3d ago \u00b7 Claude Code #318 \u00b7 status \u2192 churned",
          "v4 \u00b7 2w ago \u00b7 Cursor #290 \u00b7 status \u2192 active_client",
          "v1 \u00b7 1mo ago \u00b7 ChatGPT \u00b7 status \u2192 prospect",
        ],
      },
    ],
  },
];

export const CLI_DEMO_CHAT_SCENARIOS_EN: HomeCliDemoChatScenario[] = [
  {
    label: "Cross-tool sync",
    messages: [
      { role: "divider", content: "Cursor" },
      {
        role: "user",
        content:
          "I just spoke with Sarah Chen \u2014 she moved to a new startup. Her new email is sarah@newstartup.io",
      },
      {
        role: "tool",
        content: "",
        toolName: "store",
        toolLines: ["Stored 1 entity: contact \u00b7 sarah-chen \u00b7 v1"],
      },
      {
        role: "assistant",
        content: "Done \u2014 I\u2019ve saved Sarah Chen\u2019s updated contact info.",
      },
      { role: "divider", content: "Claude Code" },
      {
        role: "user",
        content:
          "Can you find Sarah Chen\u2019s email? I need to send her the contract.",
      },
      {
        role: "tool",
        content: "",
        toolName: "retrieve_entity_by_identifier",
        toolLines: [
          "contact \u00b7 sarah-chen \u00b7 v3 \u00b7 updated 2h ago",
          "  email: sarah@newstartup.io <changed>(changed from sarah@oldcompany.com in v2)</changed>",
        ],
      },
      {
        role: "assistant",
        content:
          "Sarah\u2019s email is sarah@newstartup.io \u2014 updated from sarah@oldcompany.com. The change was recorded in your Cursor session 2 hours ago.",
      },
    ],
  },
  {
    label: "Replay & debug",
    messages: [
      { role: "divider", content: "Codex" },
      {
        role: "user",
        content:
          "Pipeline run #47 gave wrong results for Acme Corp. What did the agent see at that point?",
      },
      {
        role: "tool",
        content: "",
        toolName: "retrieve_entity_snapshot",
        toolLines: [
          "State at 2025-03-15 14:30:00:",
          "  company \u00b7 acme-corp \u00b7 v4",
          "  status: active_client  \u00b7  revenue: $48,000",
        ],
      },
      {
        role: "assistant",
        content:
          "At the time of run #47, Acme Corp was still an active client with $48K revenue.",
      },
      { role: "divider", content: "ChatGPT" },
      {
        role: "user",
        content: "Something changed with Acme Corp since March. Can you diff the versions?",
      },
      {
        role: "tool",
        content: "",
        toolName: "diff_entity",
        toolLines: [
          "<changed>\u2212 status: active_client</changed>",
          "<added>\u002B status: churned</added>",
          "<changed>\u2212 revenue: $48,000</changed>",
          "<added>\u002B revenue: $0</added>",
          "  Changed by: Codex session #318 \u00b7 3d ago",
        ],
      },
      {
        role: "assistant",
        content:
          "Found it \u2014 Codex session #318 changed status from active_client to churned and zeroed revenue 3 days ago. That\u2019s your regression.",
      },
    ],
  },
];
