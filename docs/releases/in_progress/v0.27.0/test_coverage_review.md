# Test coverage review: v0.27.0

Range: `v0.26.0..HEAD`: 17 change PRs, plus the release commits.

## Code review

Verdict: APPROVE. No BLOCKING findings.

The peer sync, agent grant and correction package (#2749) was reviewed by the full five-lens panel on its final head, and the other changes in the range by their own PR reviews. Advisories carried forward:

- ADVISORY: `isCorrectionObservation` is a derived predicate; a new internal writer using priority 1000, specificity 1.0 and no `observation_source` would be treated as a correction. The header comment documents this.
- ADVISORY: `openapi:bc-diff` does not flag the default `store` response narrowing or tightened request validation; both are declared in the supplement's Breaking changes section.
- ADVISORY: the MCP cases in the store entity type matrix exercise the type rule, which runs before identity is consulted. Grant behaviour for those caller kinds is covered by the other cases in the file and by the security lens's run with real session identity. A follow-up gives the matrix's test helper a session identity.
- NIT: `security:lint` reports 138 warnings, none new to the auth surface.

## Surfaces

| Surface | Classification | Test |
|---|---|---|
| Peer admission on the webhook, pull leg and `prefer_remote`; refusal reporting on both sides | Covers user-observable behavior end-to-end | `tests/integration/sync_remote_*`, `tests/integration/sync_prefer_remote_corrections.test.ts`, `tests/services/sync_peer_*` |
| Agent grants on every entry point that changes data, new grant operations | Covers user-observable behavior end-to-end | `tests/integration/entity_mutation_capability_coverage.test.ts`, `tests/integration/flow_mutation_capability_coverage.test.ts`, `tests/unit/agent_grant_mutation_ops.test.ts` |
| Grant parity on `batch_correct`, observation and interpretation creation | Covers user-observable behavior end-to-end | `tests/integration/batch_correct_capability_parity.test.ts`, `tests/integration/store_capability_parity_observations_interpretations.test.ts` |
| Structured `store` entity type rule on REST and MCP | Covers user-observable behavior end-to-end | `tests/integration/entity_mutation_capability_coverage.test.ts` |
| Corrections win on their field | Covers user-observable behavior end-to-end | `tests/unit/observation_reducer_corrections_win.test.ts`, `tests/integration/correct_array_replaces.test.ts` |
| Hosted outbound host check | Covers user-observable behavior end-to-end | `tests/security/ssrf_host_guard_alternate_loopback_forms.test.ts` |
| Bearer handover slot (REST, `/mcp`, OAuth preflight) | Covers user-observable behavior end-to-end on REST and `/mcp`; OAuth preflight at unit level | `tests/integration/bearer_handover_slot.test.ts`, `tests/unit/bearer_slots.test.ts` |
| `merge_array` correction replacement, including `[]` clear and CLI `corrections create` | Covers user-observable behavior end-to-end | `tests/integration/correct_array_replaces.test.ts`, `tests/cli/cli_correction_array_replace.test.ts`, `tests/unit/observation_reducer_merge_array_correction.test.ts` |
| `store` compact `related_entities` and `include_related_snapshots` | Covers user-observable behavior end-to-end | `tests/integration/store_related_entities_compact.test.ts` |
| Entity list source-id lookups and page-bounded fragment fetch | Covers user-observable behavior end-to-end | `tests/integration/entity_list_source_lookups.test.ts`, `tests/performance/entity_list_page.bench.test.ts` |
| Recorded-cutover visibility plans | Covers user-observable behavior end-to-end | `tests/integration/entity_lifecycle_visibility_plans.test.ts` |
| Snapshot population certificate | Covers user-observable behavior end-to-end | `tests/services/entity_population_certificate.test.ts`, `tests/integration/entity_read_contract.test.ts` |
| Fragment source acquisition (PR #2759) | Covered indirectly, through the read contract tests | `tests/integration/entity_read_contract.test.ts` |
| CI repair (PR #2734) | CI only, no user-facing behavior | None needed |
| Rendered-page copy controls | Covers user-observable behavior end-to-end | `src/services/rendered_page/copy_controls.test.ts`, `tests/security/rendered_page_csp.test.ts` |
| Site, docs viewer and illustrations | Covered by site contract and unit tests | `tests/unit/site_*.test.ts`, `tests/unit/docs_viewer_*.test.ts`, `tests/unit/seo_metadata.test.ts` |

No surface is BLOCKING. No new CLI commands were added.
