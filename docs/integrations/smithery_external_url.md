# Smithery (external HTTPS URL)

Neotoma already serves **Streamable HTTP MCP** on the HTTP actions server at **`/mcp`** (`src/actions.ts`). For Smithery “bring your own URL”, publish the **HTTPS base that reaches that server**, including path **`/mcp`**.

## Publish

```bash
smithery mcp publish "https://your-host.example.com/mcp" -n markmhendrickson/neotoma
```

Optional config schema (e.g. shared bearer for scans):

```bash
smithery mcp publish "https://your-host.example.com/mcp" -n markmhendrickson/neotoma \
  --config-schema '{"type":"object","properties":{"bearerToken":{"type":"string","description":"NEOTOMA_BEARER_TOKEN value"}}}'
```

Requirements from Smithery: Streamable HTTP; **401** (not 403) for unauthenticated access so OAuth discovery works. Neotoma’s `/mcp` handler follows that pattern.

## Static server card

If automatic scanning fails (WAF, auth, or timeouts), serve metadata at **`/.well-known/mcp/server-card.json`** on the **same host** as `/mcp`.

Neotoma serves this by default from code (`buildSmitheryServerCard` in `src/mcp_server_card.ts`). Override entirely with **`NEOTOMA_MCP_SERVER_CARD_JSON`** (single-line JSON). See `.env.example`.

## Operations checklist

- Set **`NEOTOMA_HOST_URL`** to the public origin (used in OAuth metadata and `/server-info`).
- Allow **`User-Agent: SmitheryBot/1.0`** through any CDN bot rules (see [Smithery external publish troubleshooting](https://smithery.ai/docs/build/external)).
- For encryption-on deployments, scans need **`Authorization: Bearer`** from `neotoma auth mcp-token`; align Smithery session config with that token.
