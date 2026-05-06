import type {
  HomeCliDemoChatScenario,
  HomeCliDemoTerminalScenario,
} from "@/i18n/locales/home_body_types";

export const CLI_DEMO_CLI_SCENARIOS_ES: HomeCliDemoTerminalScenario[] = [
  {
    label: "Sincronizaci\u00f3n multi-herramienta",
    steps: [
      {
        comment: "Guarda un contacto desde cualquier sesi\u00f3n de agente",
        command:
          'neotoma store --json=\'[{"entity_type":"contact", "name":"Sarah Chen", "email":"sarah@newstartup.io"}]\'',
        output: ["Almacenada 1 entidad: contact \u00b7 sarah-chen \u00b7 v1"],
      },
      {
        comment: "Consulta desde otra herramienta \u2014 el mismo estado",
        command: 'neotoma entities search "Sarah Chen"',
        output: [
          "contact \u00b7 sarah-chen \u00b7 v3 \u00b7 actualizado hace 2h",
          "  email: sarah@newstartup.io <changed>(cambiado desde sarah@oldcompany.com en v2)</changed>",
        ],
      },
      {
        comment: "Muestra el historial de versiones de este contacto",
        command: "neotoma history sarah-chen",
        output: [
          "v3 \u00b7 hace 2h \u00b7 sesi\u00f3n Cursor #412 \u00b7 email \u2192 sarah@newstartup.io",
          "v2 \u00b7 hace 3d \u00b7 Claude Code \u00b7 email \u2192 sarah@oldcompany.com",
          "v1 \u00b7 hace 2sem \u00b7 ChatGPT \u00b7 importaci\u00f3n inicial",
        ],
      },
    ],
  },
  {
    label: "Reproducci\u00f3n y depuraci\u00f3n",
    steps: [
      {
        comment:
          "La ejecuci\u00f3n #47 de la canalizaci\u00f3n dio un resultado incorrecto \u2014 \u00bfqu\u00e9 cre\u00eda el agente?",
        command: "neotoma replay --entity acme-corp --at 2025-03-15T14:30:00",
        output: [
          "Estado en 2025-03-15 14:30:00:",
          "  company \u00b7 acme-corp \u00b7 v4",
          "  status: active_client  \u00b7  revenue: $48,000",
          "  primary_contact: james@acme.com",
        ],
      },
      {
        comment: "Compara el estado entre dos ejecuciones de la canalizaci\u00f3n",
        command: "neotoma diff acme-corp v4 v6",
        output: [
          "<changed>\u2212 status: active_client</changed>",
          "<added>\u002B status: churned</added>",
          "<changed>\u2212 revenue: $48,000</changed>",
          "<added>\u002B revenue: $0</added>",
          "  Cambiado por: sesi\u00f3n Claude Code #318 \u00b7 hace 3d",
        ],
      },
      {
        comment: "Rastrea qu\u00e9 sesi\u00f3n provoc\u00f3 el cambio de estado",
        command: "neotoma history acme-corp --field status",
        output: [
          "v6 \u00b7 hace 3d \u00b7 Claude Code #318 \u00b7 status \u2192 churned",
          "v4 \u00b7 hace 2sem \u00b7 Cursor #290 \u00b7 status \u2192 active_client",
          "v1 \u00b7 hace 1mes \u00b7 ChatGPT \u00b7 status \u2192 prospect",
        ],
      },
    ],
  },
];

export const CLI_DEMO_AGENTIC_SCENARIOS_ES: HomeCliDemoTerminalScenario[] = [
  {
    label: "Sincronizaci\u00f3n multi-herramienta",
    steps: [
      {
        comment: "El agente de Cursor guarda un contacto durante la conversaci\u00f3n",
        command:
          'store({ entities: [{ entity_type: "contact", name: "Sarah Chen", email: "sarah@newstartup.io" }] })',
        output: ["entity_id: sarah-chen \u00b7 versi\u00f3n: 1 \u00b7 almacenado"],
      },
      {
        comment: "Claude Code recupera el mismo contacto \u2014 sin exportar nada",
        command: 'retrieve_entity_by_identifier({ identifier: "Sarah Chen" })',
        output: [
          "contact \u00b7 sarah-chen \u00b7 v3 \u00b7 actualizado hace 2h",
          "  email: sarah@newstartup.io <changed>(cambiado desde sarah@oldcompany.com en v2)</changed>",
        ],
      },
      {
        comment: "Cualquier agente puede inspeccionar el historial de versiones completo",
        command: 'list_observations({ entity_id: "sarah-chen" })',
        output: [
          "v3 \u00b7 hace 2h \u00b7 sesi\u00f3n Cursor #412 \u00b7 email \u2192 sarah@newstartup.io",
          "v2 \u00b7 hace 3d \u00b7 Claude Code \u00b7 email \u2192 sarah@oldcompany.com",
          "v1 \u00b7 hace 2sem \u00b7 ChatGPT \u00b7 importaci\u00f3n inicial",
        ],
      },
    ],
  },
  {
    label: "Reproducci\u00f3n y depuraci\u00f3n",
    steps: [
      {
        comment: "La canalizaci\u00f3n dio un resultado incorrecto \u2014 el agente inspecciona el estado en ese momento",
        command:
          'retrieve_entity_snapshot({ identifier: "acme-corp", at: "2025-03-15T14:30:00" })',
        output: [
          "Estado en 2025-03-15 14:30:00:",
          "  company \u00b7 acme-corp \u00b7 v4",
          "  status: active_client  \u00b7  revenue: $48,000",
          "  primary_contact: james@acme.com",
        ],
      },
      {
        comment: "El agente compara versiones para encontrar la regresi\u00f3n",
        command:
          'diff_entity({ identifier: "acme-corp", from_version: 4, to_version: 6 })',
        output: [
          "<changed>\u2212 status: active_client</changed>",
          "<added>\u002B status: churned</added>",
          "<changed>\u2212 revenue: $48,000</changed>",
          "<added>\u002B revenue: $0</added>",
          "  Cambiado por: sesi\u00f3n Claude Code #318 \u00b7 hace 3d",
        ],
      },
      {
        comment: "El agente rastrea qu\u00e9 sesi\u00f3n provoc\u00f3 el cambio de estado",
        command: 'list_observations({ entity_id: "acme-corp", field: "status" })',
        output: [
          "v6 \u00b7 hace 3d \u00b7 Claude Code #318 \u00b7 status \u2192 churned",
          "v4 \u00b7 hace 2sem \u00b7 Cursor #290 \u00b7 status \u2192 active_client",
          "v1 \u00b7 hace 1mes \u00b7 ChatGPT \u00b7 status \u2192 prospect",
        ],
      },
    ],
  },
];

export const CLI_DEMO_API_SCENARIOS_ES: HomeCliDemoTerminalScenario[] = [
  {
    label: "Sincronizaci\u00f3n multi-herramienta",
    steps: [
      {
        comment: "Guarda un contacto v\u00eda la API REST",
        command:
          "curl -s -X POST localhost:3080/store -H 'Content-Type: application/json' -d '{\"entities\":[{\"entity_type\":\"contact\",\"name\":\"Sarah Chen\",\"email\":\"sarah@newstartup.io\"}]}'",
        output: [
          '{ "entities": [{ "entity_id": "sarah-chen", "entity_type": "contact", "version": 1 }] }',
        ],
      },
      {
        comment: "Busca el contacto desde cualquier cliente HTTP",
        command: 'curl -s "localhost:3080/entities/search?identifier=Sarah+Chen"',
        output: [
          "contact \u00b7 sarah-chen \u00b7 v3 \u00b7 actualizado hace 2h",
          "  email: sarah@newstartup.io <changed>(cambiado desde sarah@oldcompany.com en v2)</changed>",
        ],
      },
      {
        comment: "Recupera el historial completo de observaciones",
        command: 'curl -s "localhost:3080/entities/sarah-chen/observations"',
        output: [
          "v3 \u00b7 hace 2h \u00b7 sesi\u00f3n Cursor #412 \u00b7 email \u2192 sarah@newstartup.io",
          "v2 \u00b7 hace 3d \u00b7 Claude Code \u00b7 email \u2192 sarah@oldcompany.com",
          "v1 \u00b7 hace 2sem \u00b7 ChatGPT \u00b7 importaci\u00f3n inicial",
        ],
      },
    ],
  },
  {
    label: "Reproducci\u00f3n y depuraci\u00f3n",
    steps: [
      {
        comment: "Recupera el estado de la entidad en un instante concreto",
        command:
          'curl -s "localhost:3080/entities/acme-corp/snapshot?at=2025-03-15T14:30:00"',
        output: [
          "Estado en 2025-03-15 14:30:00:",
          "  company \u00b7 acme-corp \u00b7 v4",
          "  status: active_client  \u00b7  revenue: $48,000",
          "  primary_contact: james@acme.com",
        ],
      },
      {
        comment: "Diferencia entre dos versiones de la entidad",
        command: 'curl -s "localhost:3080/entities/acme-corp/diff?from=4&to=6"',
        output: [
          "<changed>\u2212 status: active_client</changed>",
          "<added>\u002B status: churned</added>",
          "<changed>\u2212 revenue: $48,000</changed>",
          "<added>\u002B revenue: $0</added>",
          "  Cambiado por: sesi\u00f3n Claude Code #318 \u00b7 hace 3d",
        ],
      },
      {
        comment: "Lista observaciones filtradas por campo",
        command:
          'curl -s "localhost:3080/entities/acme-corp/observations?field=status"',
        output: [
          "v6 \u00b7 hace 3d \u00b7 Claude Code #318 \u00b7 status \u2192 churned",
          "v4 \u00b7 hace 2sem \u00b7 Cursor #290 \u00b7 status \u2192 active_client",
          "v1 \u00b7 hace 1mes \u00b7 ChatGPT \u00b7 status \u2192 prospect",
        ],
      },
    ],
  },
];

export const CLI_DEMO_CHAT_SCENARIOS_ES: HomeCliDemoChatScenario[] = [
  {
    label: "Sincronizaci\u00f3n multi-herramienta",
    messages: [
      { role: "divider", content: "Cursor" },
      {
        role: "user",
        content:
          "Acabo de hablar con Sarah Chen \u2014 se fue a una nueva startup. Su email nuevo es sarah@newstartup.io",
      },
      {
        role: "tool",
        content: "",
        toolName: "store",
        toolLines: ["Almacenada 1 entidad: contact \u00b7 sarah-chen \u00b7 v1"],
      },
      {
        role: "assistant",
        content: "Listo \u2014 guard\u00e9 los datos de contacto actualizados de Sarah Chen.",
      },
      { role: "divider", content: "Claude Code" },
      {
        role: "user",
        content:
          "\u00bfPuedes buscar el email de Sarah Chen? Necesito enviarle el contrato.",
      },
      {
        role: "tool",
        content: "",
        toolName: "retrieve_entity_by_identifier",
        toolLines: [
          "contact \u00b7 sarah-chen \u00b7 v3 \u00b7 actualizado hace 2h",
          "  email: sarah@newstartup.io <changed>(cambiado desde sarah@oldcompany.com en v2)</changed>",
        ],
      },
      {
        role: "assistant",
        content:
          "El email de Sarah es sarah@newstartup.io \u2014 actualizado desde sarah@oldcompany.com. El cambio qued\u00f3 registrado en tu sesi\u00f3n de Cursor hace 2 horas.",
      },
    ],
  },
  {
    label: "Reproducci\u00f3n y depuraci\u00f3n",
    messages: [
      { role: "divider", content: "Codex" },
      {
        role: "user",
        content:
          "La ejecuci\u00f3n #47 de la canalizaci\u00f3n dio resultados incorrectos para Acme Corp. \u00bfQu\u00e9 vio el agente en ese momento?",
      },
      {
        role: "tool",
        content: "",
        toolName: "retrieve_entity_snapshot",
        toolLines: [
          "Estado en 2025-03-15 14:30:00:",
          "  company \u00b7 acme-corp \u00b7 v4",
          "  status: active_client  \u00b7  revenue: $48,000",
        ],
      },
      {
        role: "assistant",
        content:
          "En el momento de la ejecuci\u00f3n #47, Acme Corp segu\u00eda siendo cliente activo con 48.000 $ de ingresos.",
      },
      { role: "divider", content: "ChatGPT" },
      {
        role: "user",
        content:
          "Algo cambi\u00f3 con Acme Corp desde marzo. \u00bfPuedes comparar las versiones?",
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
          "  Cambiado por: sesi\u00f3n Codex #318 \u00b7 hace 3d",
        ],
      },
      {
        role: "assistant",
        content:
          "Encontrado \u2014 la sesi\u00f3n Codex #318 cambi\u00f3 el estado de active_client a churned y puso los ingresos a cero hace 3 d\u00edas. Ah\u00ed est\u00e1 la regresi\u00f3n.",
      },
    ],
  },
];
