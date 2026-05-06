# Plan: AAuth attribution parity (CLI ↔ MCP agent instructions)

## Goal

Align **`docs/developer/cli_agent_instructions.md`** with how attribution actually works when the **MCP identity proxy** auto-enables `--aauth` (keys present) and when the **CLI** signs HTTP requests via the same `~/.neotoma/aauth/` keypair—so agents are not told to “hand-roll” `@aauth/local-keys` for normal Cursor + `neotoma` usage. Keep **`docs/developer/mcp/instructions.md`** in lockstep per repo sync rules.

## Non-goals

- Changing proxy or signer **code** (`neotoma mcp proxy`, `mcp_config_scan.ts`, `aauth_signer.ts`) unless doc edits reveal a real mismatch worth a follow-up PR.
- Rewriting `docs/developer/mcp/proxy.md` beyond a single optional cross-link sentence.

## Background (current drift)

| Source | MCP `instructions.md` | CLI `cli_agent_instructions.md` |
|--------|------------------------|-----------------------------------|
| HTTP surfaces / same identity across transports | Stated (line ~114) | **Missing** |
| Session preflight (`get_session_identity` / `neotoma auth session`) | Present (line ~119) | **Missing** |
| Practical paths (proxy `--aauth`, `neotoma mcp check` preset `a`, CLI `auth keygen`) | Partially elsewhere (`mcp/proxy.md`, `mcp_cursor_setup.md`) | **Missing**; “Preferred AAuth” still reads as library-only (~210) |
| Anchor table in `agent_instructions_sync_rules.mdc` | N/A | **`[ATTRIBUTION & AGENT IDENTITY]` has no table rows** (jumps from weekly surfacing to `[CONVENTIONS]`) |

## Implementation steps

### 1. Expand `[ATTRIBUTION & AGENT IDENTITY]` in `docs/developer/cli_agent_instructions.md`

Replace the thin “Preferred — AAuth” bullet with a **transport-split** block:

1. **Identify yourself** — keep existing framing (Inspector, tiers).
2. **Preferred — AAuth (how it happens in practice)**  
   - **MCP over stdio:** Identity proxy signs downstream HTTP to `/mcp` when using `neotoma mcp proxy --aauth` (or signed dev shim). Reference `docs/developer/mcp/proxy.md` and `neotoma mcp check` preset **`a`** (keys at `~/.neotoma/aauth/` ⇒ generated entries include `--aauth` via `hasAAuthKeys()`). Agents do not implement RFC 9421 in the harness.  
   - **CLI → API:** `neotoma auth keygen`; CLI HTTP client signs when keypair is present (`src/cli/aauth_signer.ts` / `createApiClient`). Use `--api-only` or `--base-url` when matching MCP API behavior.  
   - **Custom HTTP clients only:** `@aauth/local-keys` (or equivalent) for non-`neotoma` callers—explicitly “not the default agent path.”
3. **Fallback — `clientInfo`** — keep; clarify it applies when MCP runs **without** verified signing (unsigned proxy or direct stdio).
4. **Optional label / Do not spoof / Inspector contract** — keep, minor wording alignment with MCP file if needed.
5. **Preflight your session** — add mirror of MCP rule: `neotoma auth session` ↔ `get_session_identity` / `GET /session`; check `attribution.tier` and `eligible_for_trusted_writes`; link `docs/subsystems/agent_attribution_integration.md`.

Keep section order unchanged (still between `[COMMUNICATION & DISPLAY]` and `[CONVENTIONS]`).

### 2. Tighten `[ATTRIBUTION & AGENT IDENTITY]` in `docs/developer/mcp/instructions.md`

- After the existing “Preferred — AAuth” sentence (HTTP surfaces, same identity), add **one short paragraph** matching the CLI doc: stdio MCP ⇒ **proxy/shim** signs; `neotoma mcp check` preset **`a`**; pointer to `docs/developer/mcp/proxy.md`.  
- Ensure **Preflight** line already naming `neotoma auth session` stays; no duplicate if already satisfied.

Goal: both files say the **same obligations** with **transport-appropriate verbs** (MCP tool names vs CLI commands).

### 3. Fix `docs/developer/agent_instructions_sync_rules.mdc`

- Insert a **`### [ATTRIBUTION & AGENT IDENTITY]`** subsection in the anchor table **between** “Weekly value surfacing” (62) and **`### [CONVENTIONS]`** (63).
- Add one row per atomic rule (suggested IDs **62a–62h** to avoid renumbering the entire `[CONVENTIONS]` block): identify yourself; preferred AAuth (MCP path); preferred AAuth (CLI path); custom integrators (`@aauth/local-keys`); clientInfo fallback; optional label; do not spoof; inspector contract; preflight session.
- Update any prose in the rule file that claims “each atomic rule maps 1:1” only if you add exceptions (e.g. “custom HTTP” as MCP n/a where appropriate—use `n/a` column like other CLI-only rows).

### 4. Regenerate applied copies

Run from repo root:

```bash
neotoma cli-instructions check
```

Confirm `.cursor/rules/neotoma_cli.mdc` (and other targets per skill output) update. If editing rule **sources** only under `docs/`, follow **`cursor_rules_sync_requirement.mdc`**: run **`setup_cursor_copies`** if any canonical copy lives outside `docs/` (this change is `docs/developer/` only; `cli-instructions check` is the primary gate per `agent_instructions_sync_rules.mdc`).

### 5. Verification

- [ ] Side-by-side read: `[ATTRIBUTION & AGENT IDENTITY]` in both instruction files—no contradictory “only sign /mcp with libraries” guidance.
- [ ] `neotoma cli-instructions check` exits 0.
- [ ] Optional: `rg "ATTRIBUTION" docs/developer/agent_instructions_sync_rules.mdc` shows new table rows.

## Rollout / risk

- **Low risk:** documentation and sync-table only; runtime MCP payload from `getMcpInteractionInstructions()` grows slightly—acceptable if kept concise.
- **Reviewer focus:** MCP instructions are sent to clients; keep added proxy prose **short** (link out to `mcp/proxy.md`).

## Optional follow-up

- One sentence in `docs/developer/mcp/proxy.md` Quick start or “When to use” pointing to agent instruction § Attribution for behavioral contract (not duplication of full proxy doc).

## Estimated effort

~1–2 hours (draft both sections, anchor table, run check, quick diff review).
