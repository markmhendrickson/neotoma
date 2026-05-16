---
title: "Feature Unit: FU-2026-Q3-aauth-inspector-attestation-viz — Inspector Attestation Envelope Visualisation"
summary: "**Status:** In Progress **Priority:** P2 (operator UX) **Risk Level:** Low (frontend-only, no schema or write-path changes) **Target Release:** v0.9.0 **Owner:** Engineering **Created:** 2026-04-27 **Last Updated:** 2026-04-27"
---

# Feature Unit: FU-2026-Q3-aauth-inspector-attestation-viz — Inspector Attestation Envelope Visualisation

**Status:** In Progress
**Priority:** P2 (operator UX)
**Risk Level:** Low (frontend-only, no schema or write-path changes)
**Target Release:** v0.9.0
**Owner:** Engineering
**Created:** 2026-04-27
**Last Updated:** 2026-04-27

## Overview

**Brief Description:**
Surface the cryptographic-attestation diagnostic data that v0.8.0 already
emits server-side (`decision.attestation` + `decision.operator_allowlist_source`)
through the Inspector UI. Today the AgentBadge tooltip and detail surfaces
only render the final tier value plus a static description; when an
attestation legitimately fails (chain rejected, key-binding mismatch,
unsupported format), operators see `software` with no diagnostic surface
even though the wire data carries the failure reason.

**User Value:**
- Operators auditing a deployment can see *why* an agent earned (or
  failed to earn) the `hardware` tier: format used, chain summary,
  AAGUID match, key-binding match flag, decision reason.
- Failed attestation promotions are explainable from inside the Inspector
  rather than requiring debug-level log access.
- The `operator_attested` tier renders with a distinctive icon (today
  it falls through to the default `○` glyph in the AgentBadge).

**Technical Approach (high level):**
- Extend `inspector/src/components/shared/agent_badge.tsx` `TIER_VISUAL`
  tooltip rows so envelope-derived fields (`format`, AAGUID truncated,
  `key_binding_matches_cnf_jwk`, `decision.attestation.failure_reason`)
  appear when present on the attribution payload.
- Add `inspector/src/components/shared/attestation_envelope_panel.tsx`,
  a collapsible panel rendered on the agent detail view. Panel content:
  format discriminator, decoded chain summary (subject CN + issuer CN
  per certificate), challenge match status, key-binding thumbprint
  comparison, decision failure reason. Raw envelope JSON is gated behind
  a "Show raw" toggle.
- Drive-by bug fix: extend `tierIcon()` in `agent_badge.tsx` to cover
  `operator_attested` (◇◆-style glyph distinct from `software`'s `◇`)
  and confirm `hardware: "◆"` retains its mapping. The tier-icon switch
  currently lacks an `operator_attested` case and falls through to the
  default `○`.

## Requirements

### Functional Requirements

1. **AgentBadge tooltip — additional rows.** When `provenance.decision`
   carries an `attestation` block, surface:
   - `Attestation format` — string from `decision.attestation.format`
     when present; omitted when `decision.attestation` is absent.
   - `Attestation outcome` — `"verified"` / `"failed"` derived from
     `decision.attestation.outcome`.
   - `Failure reason` — only when `outcome === "failed"`; rendered as
     monospace from `decision.attestation.failure_reason`.
   - `Key-binding match` — boolean badge from
     `decision.attestation.key_binding_matches_cnf_jwk`.
   - `Operator allowlist source` — string from
     `decision.operator_allowlist_source` when not `null`.

2. **AttestationEnvelopePanel.** Renders on agent detail pages whenever
   the row's provenance carries `decision.attestation`. Panel shows:
   - **Header row:** format pill + outcome pill + tier badge.
   - **Chain summary:** one row per certificate in `decision.attestation.chain_summary[]`
     with subject CN, issuer CN, `not_after` truncated, and a "differs from JWK"
     warning when a leaf cert thumbprint mismatch occurred.
   - **Verification gates:** chain valid / signature valid / key binding /
     challenge match / AAGUID admitted (last only when format is
     `webauthn-packed` or `tpm2`).
   - **Raw envelope toggle:** behind a "Show raw" disclosure widget,
     pretty-printed JSON of the envelope contents.

3. **Tier-icon coverage.** `tierIcon()` returns a distinct glyph for
   every `AttributionTier` value. Specifically:
   - `hardware` → `"◆"`
   - `operator_attested` → `"◈"` (filled diamond with inset)
   - `software` → `"◇"`
   - `unverified_client` → `"●"`
   - `anonymous` → `"○"`

4. **Backward compatibility.** When the attribution payload does not
   carry `decision.attestation` at all (older provenance rows, plain-signed
   non-attestation writes), the AgentBadge still renders the existing
   tooltip and the AttestationEnvelopePanel does not appear at all.

### Non-Functional Requirements

1. **No new server roundtrip.** Panel renders entirely from data
   already returned with the entity's `provenance` blob; no additional
   API endpoint.
2. **Static rendering.** No live re-verification; the panel reflects
   what the server captured at write time.
3. **Type safety.** All new fields surfaced through the typed
   `AgentAttribution`/`AttributionDecision` interfaces in
   `inspector/src/types/api.ts`; no `any` casts in component code.

### Invariants

**MUST:**
- MUST NOT echo the raw `cnf.attestation.statement` bytes into the
  default tooltip. The "Show raw" toggle is the only path that surfaces
  the full envelope.
- MUST treat a missing `decision.attestation` field identically to
  pre-v0.8.0 provenance (no panel rendered, tooltip unchanged).
- MUST keep the AgentBadge column-friendly: extra tooltip rows render
  with one-line wrapping; the visible badge does not grow.

**MUST NOT:**
- MUST NOT introduce a runtime dependency on `node:crypto` from the
  Inspector bundle (it is a browser app); chain summary fields come
  from the server-prepared diagnostic blob.
- MUST NOT render information that the server did not include in
  `decision.*`. All rendering is read-only from existing payload.

## Affected Subsystems

**Primary:**
- **Inspector frontend** (`inspector/src/components/shared/agent_badge.tsx`,
  new `inspector/src/components/shared/attestation_envelope_panel.tsx`,
  `inspector/src/types/api.ts`)

**Documentation:**
- `docs/subsystems/aauth_attestation.md` (Inspector visualisation note)
- `docs/subsystems/agent_attribution_integration.md` (Inspector surfaces
  table)

**Dependencies:**
- v0.8.0 attestation diagnostics (`decision.attestation`,
  `decision.operator_allowlist_source`) — already in main.

## Out of Scope

- Live attestation re-verification button. Would require a new server
  endpoint and is outside attribution-honesty scope.
- Time-series trend visualisation of attestation outcomes (separate
  reporting concern).
- Localised tooltip text. Inspector currently ships English-only.

## Acceptance Criteria

1. AgentBadge tooltip surfaces the new attestation rows when
   `provenance.decision.attestation` is present and renders unchanged
   when absent.
2. AttestationEnvelopePanel renders on agent detail pages with chain
   summary + verification gates + raw envelope toggle, and is hidden
   when the row carries no attestation diagnostic.
3. `tierIcon()` returns a distinct glyph for every tier; in particular
   `operator_attested` no longer falls through to the default.
4. `cd inspector && npx tsc --noEmit` passes cleanly.
5. Inspector unit tests cover label/visual mapping for all five tiers
   and rendering snapshots for AttestationEnvelopePanel in verified,
   failed, and absent states.
