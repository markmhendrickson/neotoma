# Phase 0a — Orphaned production entity types → bundle homes

**Plan:** `ent_7f4ae2e060dbca4ecc6fe0f1` (Bundles m5)
**Source:** `get_entity_type_counts` snapshot, 2026-05-21, owner instance (49,997 entities, 320 distinct types).
**Inclusion threshold:** types with count ≥ 3 (200 types). Lower-frequency types treated as one-off noise unless they cluster into a clear theme.

## Methodology

Each production type was scored against the m5 bundle catalog:

- `match`: type explicitly listed in a bundle's `provides_entity_types`.
- `aligned`: type semantically belongs in a bundle but isn't named yet — bundle should add it.
- `gap`: high-frequency type with no obvious bundle home — candidate for a new bundle or a new field family.
- `core`: already covered by default-install `core` or `infrastructure`.
- `noise`: low-confidence one-off, exclude from catalog.

## Mapping

### `core` / `infrastructure` (default install)

- `task` (17605), `conversation_message` (15688), `conversation` (3799), `agent_message` (3515), `contact` (1265), `issue` (977), `note` (702), `plan` (300), `file_asset` (136), `event` (48), `conversation_turn` (44), `document` (8) — core/infrastructure as defined.

### `crm` bundle (P0)

- `company` (123) — **aligned**, add to `provides_entity_types`.
- `organization` (16) — **aligned**, alias of company.
- `contact_group` (49) — **aligned**.
- `contact_list` (1) — noise / alias of contact_group.
- `person` (26) — **aligned**, alias of contact.
- `outreach_interaction` (13) — **aligned**.
- `outreach_activity` (1) — noise.
- `outreach_decision` (1) — noise.
- `linkedin_interaction` (1) — noise.
- `social_media_interaction` (1) — noise.

### `communications` bundle (P0)

- `post` (365) — **match**.
- `email_message` (204) — **match**.
- `social_share_draft` (165) — **aligned**, add.
- `social_share_schedule` (23) — **aligned**, add.
- `social_post` (16) — **match**.
- `email` (33) — **aligned**, alias of email_message.
- `email_thread` (3) — **match**.
- `email_draft` (2) — **match**.
- `email_notification` (3) — **aligned**.
- `outbound_email` (3) — **aligned**.
- `email_note` (1) — noise.
- `message` (3) — **match**.
- `tweet` (3) — **aligned**.
- `post_idea` (44) — **aligned**, add.
- `post_reference` (4) — **aligned**.
- `blog_post` (7) — **aligned**, add.
- `blog_post_draft` (1) — noise / aligns to blog_post.
- `social_reply` (2) — **aligned**.
- `social_post_draft` (15) — **aligned**, alias of social_share_draft.
- `social_feedback` (3) — **gap?** → likely `communications` if about messaging, `customer_ops` if about product. Defer.
- `social_follow_candidate` (6) — **aligned**.
- `social_draft_review` (2) — **aligned**.

### `personal_data` bundle (P0)

- `transcription` (739) — **gap** → new field family. Belongs in `personal_data` for personal voice notes, but high frequency suggests a dedicated field. Add to bundle.
- `meeting_transcription` (36) — **aligned**, add.
- `transcription_run` (8) — **aligned**, add.
- `recurring_expense` (173) — **match**.
- `workout_session` (37) — **match**.
- `exercise_log` (44) — **match**.
- `exercise_set` (19) — **match**.
- `income` (43) — **match**.
- `holiday_card_receipt` (48) — **aligned**, narrow personal-finance type.
- `preference` (25), `instruction_preference` (1), `user_preference` (1), `retrieval_preference` (1), `ui_preference` (3) — **aligned**, consolidate as `preference` with `category` field.
- `standing_rule` (35) — **aligned**, add.
- `holiday_card_receipt` (48) — covered above.
- `life_tenets` (1) — noise / aligns to standing_rule.
- `goal` (1) — **match**, low-frequency but in catalog.
- `habit` (1) — **match**.
- `mood_state` (1) — **match**.
- `health_event` (3) — **aligned**, add.
- `device` (10), `device_profile` (1) — **aligned**, add to personal_data.
- `location` (11) — **aligned**, add.
- `dispute_note` (20), `dispute_update` (6), `dispute_document` (1), `dispute_index` (1), `dispute_query` (1), `dispute_work_summary` (1), `dispute` (2) — **gap** → personal-finance disputes (chargebacks/insurance). Cluster into new sub-area of `personal_data` or new bundle. Recommend: add `dispute` family to `personal_data`.

### `financial_ops` bundle (P1)

- `transaction` (113) — **match**.
- `bank_transaction` (10) — **match**.
- `crypto_transaction` (existing) / `crypto_transactions` (1) — **gap** → crypto-finance subset, consider a `crypto_finance` bundle or absorb into `financial_ops`.
- `invoice` (12) — **match**.
- `account_statement` (14) — **match**.
- `financial_account` (76) — **aligned**, add.
- `crypto_wallet` (73), `crypto_wallet_address` (86) — **gap** → recommend new `crypto_finance` bundle (depends_on financial_ops).
- `fixed_cost` (1) — **match** (in schema_definitions).
- `tax_filing` (5) — **match**.
- `tax_form` (1) — **aligned**.
- `tax_event` (existing schema, 0 here) — **match**.
- `loan` (7) — **aligned**, add.
- `insurance_policy` (1), `insurance_offer` (1) — **aligned**, add.
- `transaction_summary` (4) — **aligned**.
- `payment_query` (1) — noise.
- `account_balance` (1) — **aligned**.

### `devops` bundle (P1)

- `repository` (19) — **match**.
- `pull_request` (6) — **match**.
- `deployment` (5), `deployment_status` (3), `deployment_configuration` (1), `deployment_decision` (1), `deployment_recommendation` (1), `deployment_run` (1), `deployment_update` (1) — **match** (consolidate via category field).
- `code_change` (21) — **match**.
- `git_commit` (1), `code_commit` (1), `git_push_result` (1), `codebase_change` (1), `codebase_entity` (1) — **aligned**, consolidate.
- `ci_workflow_run` (1), `github_workflow_run` (2), `workflow_run` (3), `workflow_job` (1), `workflow_observation` (1) — **aligned**, consolidate.
- `security_finding` (2) — **match**.
- `build_result` (1) — **aligned**.
- `migration_result` (1) — **aligned**.
- `release` (3), `release_objective` (15), `release_phase` (2), `release_plan` (2), `release_intent` (2), `release_preview` (1), `release_request` (1), `release_result` (1), `release_strategy` (1), `release_gate` (6) — **gap** → release management cluster. Recommend: add `release` and `release_gate` to `devops`; consider whether this needs a sub-bundle.
- `neotoma_repair` (27), `neotoma_qa_finding` (5), `neotoma_feedback` (3) — **noise/internal** (Neotoma-on-Neotoma development); store in `devops` with `category: internal_qa`.
- `bug_report` (48), `ui_bug` (2), `ui_bug_report` (5), `ui_issue` (4) — **aligned**, add as `bug_report` alias family to `devops`.
- `feature_request` (19), `feature_spec` (3) — **aligned**, add.
- `architectural_decision` (18), `decision_record` (3), `decision_note` (4) — **aligned**, add `architectural_decision` to devops.
- `breaking_change` (2), `supplement` (8) — **aligned**.
- `pr` / `pull_request` already covered.
- `mcp_server_status` (7), `mcp_server_update` (1), `mcp_endpoint` (1), `mcp_tool` (1) — **aligned**, MCP-runtime subfamily of devops.
- `dns_check` (3), `dns_record` (3), `dns_issue` (1), `dns_provider` (2), `dns_validation_result` (1), `dnsimple_current_nameservers` (1), `cloudflare_activation_step` (1), `cloudflare_cli_attempt` (1), `cloudflare_dns_review` (1) — **gap** → infrastructure ops cluster. Recommend: add to `devops` under `infrastructure_config` family.

### `contracts` bundle (P1)

- `contract` (in schema_definitions, low production) — **match**.
- `contract_discrepancy` (3) — **aligned**, add.
- `contract_review` (2) — **aligned**.

### `compliance` bundle (P1)

- `legal_research` (19) — **aligned**, add.
- `legal_review` (1) — **aligned**.
- `audit_run` (2), `audit_result` (1), `compliance_pass` (1), `accessibility_audit` (1) — **aligned**, add `audit` family.
- `claim` (6) — **aligned**, add.

### `portfolio` bundle (P1)

- `holding` (in schema_definitions, low production) — **match**.
- `competitive_analysis` (42), `partnership_analysis` (15), `strategic_analysis` (4), `strategic_research` (4), `market_research` (2) — **gap** → strategy/research cluster. Recommend: split between `portfolio` (investor-facing) and a new `research` sub-area or `diligence` bundle.
- `business_opportunity` (1), `financial_opportunity` (1) — **aligned**, add to `portfolio`.

### `customer_ops` bundle (P2)

- `product_feedback` (129) — **match-ish**, add to customer_ops (or to a `product` bundle — see gap below).
- `feedback` (13), `feedback_note` (16), `feedback_analysis` (16), `feedback_aggregate_analysis` (3), `feedback_finding` (4), `feedback_artifact` (6), `feedback_scan` (2), `tester_feedback` (3), `user_feedback` (2), `social_feedback` (3), `ui_feedback` (9), `ui_copy_feedback` (5), `process_feedback` (1), `design_feedback` (1), `documentation_feedback` (3) — **gap** → product feedback cluster. Recommend: dedicate `product_feedback` family within `customer_ops`, or split into a new `product` bundle.
- `bug_report` already in devops (overlap — disambiguate by `category`).
- `tester_program` (1), `developer_release_tester` (52) — **aligned**, add.

### New bundle proposal: `product` (P1, not in original catalog)

**Rationale:** `product_feedback` (129) + feedback family + product analysis types form a cluster larger than several P2 bundles combined. This is owner's product-development workflow.

- `product_feedback` (129)
- `feedback`, `feedback_note`, `feedback_analysis`, `feedback_aggregate_analysis`, `feedback_finding`, `feedback_artifact`, `feedback_scan`
- `product_decision` (2), `product_question` (1), `product_decision_question` (1), `product_announcement` (2), `product_analysis` (1), `product_behavior` (1), `product_copy_request` (1)
- `user_persona_insight` (1), `target_persona` (1)
- `feature_request` (19) — overlap with devops; disambiguate: customer-facing → product, internal-engineering → devops.

### New bundle proposal: `crypto_finance` (P2, not in original catalog)

**Rationale:** Owner has 159 crypto-wallet entities. Outside `crypto_engineering` (which is about security-sensitive engineering). Distinct domain.

- `crypto_wallet` (73)
- `crypto_wallet_address` (86)
- `crypto_transaction` family (existing in schema_definitions)
- `holding` (overlap with portfolio — disambiguate by `category: crypto`)

### `research` (overlapping gap — defer)

- `technical_research` (102), `legal_research` (19), `market_research` (2), `strategic_research` (4), `competitive_analysis` (42), `partnership_analysis` (15) — distributed across several bundles; do not create a standalone `research` bundle. Each goes to its domain bundle.

### Site / web content (gap, candidate for `web` or `content` bundle — defer)

- `web_page` (11), `website` (3), `website_domain` (1), `website_page` (1), `web_reference` (2), `web_console_warning` (1), `web_fetch_issue` (1)
- `page` (5), `page` (1)
- `link` (9), `external_link` (5)
- `article` (7), `research_article` (2), `scraped_content` (1)
- **Recommendation:** add `web_page`, `link`, `external_link` to `core` (universal references); leave the rest as noise.

### UI/UX feedback cluster (consolidate into `product`)

- `ui_change_request` (12), `ui_observation` (8), `ui_state` (5), `ui_screenshot` (5), `ui_copy_feedback` (5), `ui_request` (1), `ui_review` (2), `ui_render_issue` (3), `ui_section` (3), `ui_message_example` (3), `ui_page` (2), `ui_component` (1), `ui_context` (1), `ui_copy_bug` (1), `ui_error` (1) — fold into `product` bundle as `ui_*` family.

### Image/media (gap → `media` bundle or add to `core`)

- `image_asset` (107), `image` (5), `photo_album` (1), `visual_concept` (1), `visual_issue` (1), `screenshot_note` (4), `ui_screenshot` (5)
- **Recommendation:** add `image_asset` and `image` to `core` (alongside `file_asset`); rest noise.

### Internal/scaffolding (NOT bundled — Neotoma development artifacts)

- `cross_layer_schema_*` (10 instances) — schema-debug entities, exclude from catalog.
- `transcription_run`, `gmail_search_batch`, `mcp_server_status`, `oauth_*`, `auth_error` — internal-runtime. Keep in `devops` under category=internal.
- `submission_config` (2) — already in `infrastructure`.
- `env_var_mappings` (2) — internal config.
- `guest_access_token` (619) — already in `infrastructure` family conceptually. Confirm.

### Singletons (count ≤ 2, excluded from catalog scope)

~120 types. Not addressed individually. Recommended action: leave in `evolving` mode if operator opts in, or promote to bundle catalog if they cluster meaningfully in a future review.

## Summary delta vs original m5 catalog

**New bundles to add:**

1. `product` (P1) — covers product_feedback (129) + 14 feedback subtypes.
2. `crypto_finance` (P2) — covers crypto_wallet (73) + crypto_wallet_address (86).

**Bundles to expand `provides_entity_types`:**

- `crm`: add `company`, `contact_group`, `outreach_interaction`.
- `communications`: add `social_share_draft`, `post_idea`, `blog_post`, `email_thread`, `email_draft`.
- `personal_data`: add `transcription` (high frequency: 739), `meeting_transcription`, `dispute` family, `standing_rule`, `preference`, `device`, `location`.
- `devops`: add `bug_report`, `feature_request`, `architectural_decision`, `release`, `release_gate`, `dns_*` family, `mcp_*` family.
- `compliance`: add `legal_research`, `audit` family, `claim`.
- `core`: add `image_asset`, `image`, `web_page`, `link`, `external_link`.

**Bundles unchanged:**

- `financial_ops` (catalog already covers production types).
- `contracts`, `portfolio`, `cases`, `diligence`, `procurement`, `customer_ops`, `trading`, `healthcare`, `logistics`, `government`, `agent_auth`, `crypto_engineering` — production data thin; honor site catalog as-is.

**Bundles total: 20** (16 site use cases + `devops` + `product` + `crypto_finance` + adjustments above).
