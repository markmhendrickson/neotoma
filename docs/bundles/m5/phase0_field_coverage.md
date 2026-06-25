# Phase 0b — Field coverage analysis for P0 bundles

**Plan:** `ent_7f4ae2e060dbca4ecc6fe0f1` (Bundles m5)
**Source:** Production schema_registry snapshot via `list_entity_types`, 2026-05-21, owner instance.
**Purpose:** Distill production field sets to canonical bundle field definitions. Production schemas have grown organically (e.g. `email_message` has 45 fields; `contact` has 46) — m5 bundles will ship a **curated core** + retain extension via `raw_fragments`.

## Curation rules

For each entity type:

1. **Promote to core fields** anything used by ≥30% of observations OR semantically required for the type's identity.
2. **Retain via raw_fragments** anything ad-hoc, per-source, or platform-specific (gmail_message_id, gmail_thread_id, twitter handles, etc.).
3. **Canonicalize aliases**: collapse `from` / `from_address` / `from_email` / `from_display` / `from_name` / `sender_name` / `sender_email` into a clear minimal set.
4. **Required fields only when truly required** for the type to be a distinct entity (e.g. `published_date` for `post`).

---

## `crm` bundle

### `company` (production: 123, fields used: 18)

**Promote (canonical 9):**

- `name` (string, required) — identity
- `description` (string)
- `website` (string)
- `url` (string)
- `category` (string)
- `stage` (string) — `prospect | active | inactive | acquired | shut_down`
- `business_model` (string)
- `founded` (number) — year
- `notes` (text)

**Retain via raw_fragments:** `company_id` (legacy import), `import_date`, `import_source_file`, `data_source`, `tagline`, `founder`, `product`.

**canonical_name_fields:** `["name"]`.

### `deal` (no production observations yet — site-defined)

**Promote (canonical 8):**

- `name` (string, required)
- `account_id` (string) — REFERS_TO company
- `stage` (string) — `lead | qualified | proposal | negotiation | closed_won | closed_lost`
- `amount` (number)
- `currency` (string, default `USD`)
- `close_date` (date)
- `owner` (string) — REFERS_TO contact
- `notes` (text)

### `account` (no production observations — site-defined)

**Promote (canonical 5):**

- `name` (string, required)
- `company_id` (string) — REFERS_TO company
- `type` (string) — `customer | prospect | partner | vendor`
- `health` (string) — `green | yellow | red`
- `renewal_date` (date)

### `engagement` (overlaps with production `outreach_interaction`, 13)

**Promote (canonical 7):**

- `subject` (string, required)
- `contact_id` (string, required) — REFERS_TO contact
- `channel` (string) — `email | call | meeting | message | event`
- `direction` (string) — `inbound | outbound`
- `occurred_at` (date, required)
- `outcome` (string)
- `notes` (text)

### `pipeline_stage` (config-style)

**Promote (canonical 4):**

- `name` (string, required)
- `position` (number, required)
- `pipeline_name` (string, required)
- `probability` (number) — 0..1

**Identity:** composite `(pipeline_name, name)`.

### Bundle additions promoted from phase 0a

- `contact_group` (49) — add as `provides_entity_types` entry.
- `outreach_interaction` aliased to `engagement`.

---

## `communications` bundle

### `email_message` (production: 204, 45 fields)

**Promote (canonical 12):**

- `subject` (string, required)
- `from_email` (string, required)
- `from_name` (string)
- `to_addresses` (array<string>, required)
- `cc` (array<string>)
- `received_at` (date, required for inbound)
- `sent_at` (date, required for outbound)
- `direction` (string) — `inbound | outbound | draft`
- `body_text` (text)
- `body_excerpt` (string)
- `thread_id` (string) — REFERS_TO email_thread
- `mailbox` (string)

**Retain via raw_fragments:** `gmail_message_id`, `gmail_thread_id`, `gmail_draft_id`, `api_response_data`, `attachment_filenames`, `local_attachment_paths`, `language`, `prepayment_signal_*`, `has_html`, `attachment_count`, `supersedes_message_id`.

**canonical_name_fields:** `["thread_id", "received_at", "from_email"]` (provider-agnostic — falls back to heuristic if absent).

### `email_thread` (production: 3, 9 fields)

**Promote (canonical 5):**

- `subject` (string, required)
- `participants` (array<string>, required)
- `first_message_at` (date, required)
- `last_message_at` (date)
- `message_count` (number)

### `email_draft` (production: 2)

**Promote (canonical 6):**

- `subject` (string, required)
- `to_addresses` (array<string>)
- `body_text` (text)
- `created_at` (date, required)
- `in_reply_to` (string) — gmail_message_id of parent
- `status` (string) — `drafting | ready | sent | discarded`

### `post` (production: 365, 22 fields)

**Promote (canonical 11):**

- `slug` (string, required) — identity
- `title` (string, required)
- `excerpt` (string)
- `body` (text)
- `summary` (string)
- `category` (string)
- `tags` (array<string>)
- `published` (boolean)
- `published_date` (date)
- `hero_image` (string) — URL or file_asset id
- `status` (string) — `draft | scheduled | published | archived`

**Retain via raw_fragments:** `read_time`, `hero_image_style`, `share_tweet`, `og_image`, `hero_image_square`, `created_date`, `updated_date`, `import_date`, `import_source_file`.

**canonical_name_fields:** `["slug"]`.

### `social_post` (production: 16, 30 fields)

**Promote (canonical 12):**

- `platform` (string, required) — `twitter | linkedin | mastodon | bluesky | other`
- `content` (text, required)
- `author_handle` (string)
- `url` (string)
- `post_id` (string)
- `post_type` (string) — `original | reply | quote | thread`
- `status` (string) — `draft | scheduled | published`
- `published_date` (date)
- `tags` (array<string>)
- `hashtags` (array<string>)
- `in_reply_to_url` (string)
- `thread_id` (string)

**Retain via raw_fragments:** `series`, `series_part`, `blog_post_slug`, `hook`, `media_urls`, `mentions`, `likes`, `shares`, `comments`, `char_count_approx`.

### `social_share_draft` (production: 165, 27 fields)

**Promote (canonical 10):**

- `platform` (string, required)
- `content` (text, required)
- `title` (string)
- `status` (string) — `drafting | scheduled | published | discarded`
- `scheduled_at` (date)
- `published_at` (date)
- `post_url` (string)
- `tags` (array<string>)
- `hashtags` (array<string>)
- `is_thread` (boolean)

**Retain via raw_fragments:** `source_entity_id`, `media_urls`, `version`, `thread_position`, `qt_target_*`, `tweet_number`, `target_post_url`, `additional_platforms`.

### `post_idea` (production: 44, 12 fields)

**Promote (canonical 6):**

- `title` (string, required)
- `content` (text)
- `topics` (array<string>)
- `status` (string) — `captured | drafting | published | discarded`
- `captured_on` (date)
- `source_url` (string)

### `blog_post` (production: 7)

**Promote (canonical 8):**

- `title` (string, required)
- `url` (string)
- `content` (text, required)
- `author` (string)
- `published_at` (date)
- `summary` (string)
- `tags` (array<string>)
- `platform` (string) — `substack | medium | personal | other`

### `message` (production: 3, low conf.)

**Promote (canonical 5):**

- `content` (text, required)
- `sender` (string)
- `channel` (string) — `sms | imessage | signal | whatsapp | other`
- `sent_at` (date, required)
- `direction` (string)

---

## `personal_data` bundle

### `workout_session` (production: 37, currently 4 fields — under-defined)

**Promote (canonical 6):**

- `date` (date, required)
- `location` (string)
- `notes` (text)
- `status` (string) — `planned | in_progress | completed | skipped`
- `duration_minutes` (number)
- `bodyweight_kg` (number)

### `exercise_log` (production: 44, 15 fields — already well-shaped)

**Promote (canonical, keep as-is, 9 fields):**

- `date` (date, required)
- `exercise_name` (string, required)
- `exercise_name_normalized` (string)
- `set_number` (number)
- `reps` (number)
- `weight_kg` (number)
- `effort` (string) — RPE scale or descriptor
- `set_type` (string) — `warmup | working | failure | dropset`
- `notes` (text)

**REFERS_TO** `workout_session` via session_id.

### `exercise_set` (production: 19, 9 fields)

**Promote (canonical, keep as-is, 8 fields):** `exercise_name`, `session_id`, `set_number`, `weight_kg`, `reps`, `is_warmup`, `is_failure`, `timestamp`, `notes`. Likely consolidate with `exercise_log` in m5 — same shape minus naming convention. Decision deferred to phase 1.

### `recurring_expense` (production: 173, 26 fields — over-fitted to owner's needs)

**Promote (canonical 12):**

- `merchant` (string, required)
- `expense_description` (string)
- `expense_type` (string) — `subscription | bill | rent | insurance | other`
- `billing_frequency` (string) — `monthly | quarterly | annually | weekly`
- `occurrences_per_year` (number)
- `payment_amount` (number, required)
- `currency` (string, required)
- `payment_method` (string)
- `started` (date)
- `ended` (date)
- `renews` (date)
- `notes` (text)

**Retain via raw_fragments:** dual-currency amounts (`payment_amount_eur`, `payment_amount_usd`, `monthly_eur`, etc.), `pct_fixed_expenses`, `pct_net_income`, `inflates`, `yearly_savings_eur`, `location`, `observation_kind`, `source_file`.

### `transaction` (personal-scope, production: 113)

Defer field shape to financial_ops bundle phase. personal_data bundle re-exports `transaction` with `category` filter or alias.

### `income` (production: 43)

**Promote (canonical 8):**

- `source` (string, required)
- `amount` (number, required)
- `currency` (string, required)
- `received_at` (date, required)
- `category` (string) — `salary | contract | dividend | other`
- `payer` (string)
- `payment_method` (string)
- `notes` (text)

### `transcription` (production: 739)

**Promote (canonical 7):**

- `content` (text, required)
- `source_audio_id` (string) — REFERS_TO file_asset
- `recorded_at` (date)
- `transcribed_at` (date, required)
- `duration_seconds` (number)
- `language` (string)
- `transcription_model` (string) — `whisper-large-v3 | gpt-4o-transcribe | etc`

### `meeting_transcription` (production: 36)

Sub-type of `transcription` with additional fields:

- `meeting_id` (string) — REFERS_TO event
- `participants` (array<string>)

Decision: keep as separate entity_type with `transcription` as alias category, OR fold into `transcription` with `category: meeting`. Defer to phase 1.

### `preference` (consolidating 5 variants, production total ~30)

**Promote (canonical 6):**

- `subject` (string, required) — what the preference is about
- `value` (string, required) — the preference content
- `category` (string) — `ui | retrieval | instruction | general`
- `priority` (string) — `must | should | may`
- `captured_at` (date, required)
- `notes` (text)

### `standing_rule` (production: 35)

**Promote (canonical 5):**

- `rule_text` (string, required)
- `scope` (string) — `global | session | project | workflow`
- `created_at` (date, required)
- `active` (boolean, default true)
- `notes` (text)

### `health_event` (production: 3)

**Promote (canonical 5):**

- `event_type` (string, required) — `injury | illness | checkup | medication | other`
- `description` (string, required)
- `occurred_at` (date, required)
- `severity` (string) — `mild | moderate | severe`
- `resolved_at` (date)

### `dispute` family (production: 20 + ~10 sub-types)

Consolidate into single `dispute` entity (production: 2 exists at 36 fields, well-shaped).
**Promote (canonical 12):**

- `title` (string, required)
- `counterparty` (string, required)
- `invoice_ref` (string)
- `invoice_date` (date)
- `amount` (number)
- `currency` (string)
- `status` (string) — `open | in_progress | resolved | dropped`
- `disputed_date` (date, required)
- `work_scope` (string)
- `issues_summary` (text)
- `next_steps` (text)
- `notes` (text)

**Retain via raw_fragments:** `isap_*` jurisdiction-specific fields, `legacy_dispute_id`, `grupo_kiak_invoice_ref`, dual-currency amounts.

### `device` (production: 10)

**Promote (canonical 5):**

- `name` (string, required)
- `device_type` (string) — `phone | laptop | desktop | tablet | wearable | other`
- `make` (string)
- `model` (string)
- `acquired_at` (date)

### `location` (production: 11, 10 fields)

**Promote (canonical 6):**

- `name` (string, required) — identity
- `locality` (string) — city
- `administrative_area` (string) — state/province
- `country` (string)
- `latitude` (number)
- `longitude` (number)

---

## Cross-bundle notes

1. **`canonical_name` field**: production schemas frequently include `canonical_name` as a stored field. Bundle schemas should declare `canonical_name_fields` in SchemaDefinition rather than persisting a `canonical_name` column. Migration of existing data: defer to phase 1 per-bundle.

2. **`source_file`, `import_date`, `import_source_file`, `data_source`**: provenance fields. These belong in `observations.metadata`, not the entity field set. Bundle schemas exclude them.

3. **`title` / `name`**: many production types have both. Bundle convention: use `name` for entities with stable identity (company, contact, location); `title` for content artifacts (post, email_message, dispute).

4. **`status` field**: nearly universal. Bundle convention: each entity type declares its own `status` enum in the schema; no shared global status.

5. **Required field discipline**: production schemas are nearly all `required: false`. Bundle schemas tighten this — identity fields and temporal fields (`*_at`) are required where the entity isn't meaningful without them.

## Summary

P0 bundles ship with a curated canonical field set per entity type, trimmed from production sprawl. Numbers:

- `crm`: 5 entity types, ~30 canonical fields total.
- `communications`: 8 entity types, ~75 canonical fields total.
- `personal_data`: 14 entity types, ~95 canonical fields total.

This is the minimum sufficient set. Operators on `evolving` mode can extend via raw_fragments; promotions to bundle schemas happen via `update_schema_incremental` per the existing flow.
