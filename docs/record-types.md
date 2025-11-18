# Canonical Record Types

Neotoma accepts arbitrary record types, but downstream analytics, embeddings, and search work best when ingested data conforms to a shared vocabulary. This document defines the canonical `type` values plus their aliases, suggested fields, and categories. The backend automatically maps aliases (plural forms, synonyms, common typos) to the canonical identifiers.

## Finance

| Type | Description | Primary Properties | Aliases |
| --- | --- | --- | --- |
| `account` | Financial account snapshots (bank, brokerage, wallet). | `external_id`, `institution`, `balance`, `currency`, `status` | bank_account, wallet, ledger_account |
| `transaction` | Individual debits/credits pulled from Plaid or uploads. | `amount`, `currency`, `date`, `merchant_name`, `status`, `account_id` | transactions, txn, expense, purchase, payment |
| `invoice` | Money owed to you or vendors. | `invoice_number`, `amount_due`, `due_date`, `vendor`, `status` | bill |
| `receipt` | Proof-of-purchase docs. | `receipt_number`, `amount_total`, `date`, `merchant_name`, `currency` | proof_of_purchase |
| `statement` | Periodic statements (bank, credit, utilities). | `statement_period_start`, `statement_period_end`, `balance`, `institution` | bank_statement |
| `budget` | Planned vs actual spend for a window/category. | `period`, `category`, `amount_limit`, `amount_spent`, `currency` | spending_plan |
| `subscription` | Recurring payment agreements. | `provider`, `plan_name`, `amount`, `currency`, `renewal_date`, `status` | membership, recurring_payment |

## Productivity & Knowledge

| Type | Description | Primary Properties | Aliases |
| --- | --- | --- | --- |
| `note` | Free-form text, journals, scratchpads. | `title`, `content`, `tags`, `source`, `summary` | journal, memo |
| `document` | Structured files, specs, PDFs, knowledge assets. | `title`, `summary`, `source`, `tags`, `link` | doc, file, pdf |
| `message` | Emails, DMs, chat transcripts. | `channel`, `sender`, `recipient`, `subject`, `body` | email, dm, sms |
| `task` | Action items with status. | `title`, `status`, `due_date`, `assignee`, `priority` | todo, action_item |
| `project` | Multi-step initiatives. | `name`, `status`, `owner`, `start_date`, `due_date` | initiative, program |
| `goal` | Outcome targets or OKRs. | `name`, `metric`, `target_value`, `deadline`, `category` | objective, okr |
| `event` | Meetings, appointments, scheduled interactions. | `title`, `start_time`, `end_time`, `location`, `attendees` | meeting, appointment, calendar_event |
| `contact` | People or org records. | `name`, `email`, `phone`, `organization`, `role` | person, lead |

## Health & Routines

| Type | Description | Primary Properties | Aliases |
| --- | --- | --- | --- |
| `exercise` | Single workout sessions or sets. | `name`, `duration`, `intensity`, `muscle_group`, `sets`, `reps` | workout, training_session |
| `measurement` | Biometrics and quantitative stats. | `metric`, `value`, `unit`, `recorded_at`, `context` | biometric, stat |
| `meal` | Food logs and nutrition captures. | `name`, `calories`, `macros`, `consumed_at`, `items` | food_log, nutrition |
| `sleep_session` | Bedtime tracking entries. | `start_time`, `end_time`, `duration`, `quality`, `notes` | sleep, rest |

**Example (`exercise`)**

```json
{
  "type": "exercise",
  "summary": "5 x 3 front squats at 205 lbs (RPE 8)",
  "properties": {
    "name": "Front squat",
    "sets": 5,
    "reps": 3,
    "weight_lbs": 205,
    "rpe": 8,
    "duration_minutes": 28,
    "muscle_group": "legs",
    "notes": "Paused each rep, focus on staying upright."
  },
  "created_at": "2025-02-12T14:33:00Z"
}
```

## Media & Files

| Type | Description | Primary Properties | Aliases |
| --- | --- | --- | --- |
| `file_asset` | Generic uploaded assets (images, videos, binaries). | `file_name`, `mime_type`, `size`, `checksum`, `source` | file, attachment, asset |

## Data & Datasets

| Type | Description | Primary Properties | Aliases |
| --- | --- | --- | --- |
| `dataset` | Tabular datasets produced from CSV or spreadsheet uploads. | `row_count`, `source_file`, `summary` | csv, spreadsheet, table, dataset_file |
| `dataset_row` | Single row derived from a dataset upload. | `csv_origin`, `row_index`, `source_file` | table_row, csv_row |

## Extending the list

1. **Proposal**: add new canonical types or aliases in `src/config/record_types.ts`.
2. **Docs**: update this file plus README’s canonical types section.
3. **Validation**: ensure automated tests cover the new mapping.

Custom types are still allowed. They will be sanitized (lowercase snake_case). Prefer extending the canonical list when the type has broad reuse value.

