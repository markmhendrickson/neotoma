# Neotoma Record Types — Canonical Type Catalog

_(Application-Level Types, Schema Families, and Field Mappings)_

---

## Purpose

Defines the **canonical record type system** for Neotoma, including:

- Application-level record types (used in code and database)
- Schema families (high-level groupings for documentation)
- Field extraction rules per type
- Entity resolution rules per type
- Event generation rules per type
- Schema detection patterns per type

This document is the **single source of truth** for all record type definitions.

---

## Scope

This document covers:

- Complete catalog of MVP record types
- Two-tier type system (application types + schema families)
- Field mappings and extraction rules per type
- Schema detection patterns (regex-based, deterministic)

This document does NOT cover:

- Database schema (see `docs/subsystems/schema.md`)
- MCP action implementations (see `docs/specs/MCP_SPEC.md`)
- UI component structure (see `docs/ui/`)

---

## 1. Two-Tier Type System

Neotoma uses a **two-tier system** to balance implementation granularity with documentation clarity:

### Tier 1: Application-Level Types

**Definition:** Fine-grained record types used in code (`src/config/record_types.ts`), database (`records.type`), and MCP actions.

**Purpose:** Precise type detection, field extraction, and entity/event mapping.

**Examples:** `invoice`, `receipt`, `transaction`, `note`, `message`, `contract`

### Tier 2: Schema Families

**Definition:** High-level groupings of application types used for documentation, architectural discussion, and user-facing categorization.

**Purpose:** Organize types conceptually without losing implementation precision.

**Examples:** `Financial`, `Productivity`, `Knowledge`, `Legal`, `Travel`, `Identity`

---

## 2. Complete Type Catalog (MVP)

**MVP Catalog Strategy (per `docs/specs/GENERAL_REQUIREMENTS.md`):**

For MVP, Neotoma uses a curated **Tier 1 / Tier 2 schema catalog** defined statically in `src/config/record_types.ts` and extraction rules, with deterministic generic fallback (`document`) for unrecognized types.

**Catalog Expansion Approach:**

- The initial MVP catalog should be **fleshed out within Tier 1 (and selectively Tier 2)** by:
  - Deriving additional Tier 1 schema types from representative real-world sample files (including user import sets)
  - Adding only those Tier 2 schemas that are clearly high-leverage for MVP ICPs
  - Always preserving determinism, explainability, and schema-first constraints from the Neotoma manifest
- New schema types are added via Feature Units with full extraction rules, tests, and compliance verification
- Post-MVP: User-defined schemas may be supported; for MVP, all schemas are statically defined

---

### 2.1 Financial Schema Family

Application types for financial documents (invoices, receipts, transactions, statements, accounts).

| Application Type | Description                                         | ICP Alignment   |
| ---------------- | --------------------------------------------------- | --------------- |
| `invoice`        | Invoices (money owed to/from vendors)               | All Tier 1 ICPs |
| `receipt`        | Proof-of-purchase documents                         | All Tier 1 ICPs |
| `transaction`    | Individual debits/credits (from uploads, not Plaid) | All Tier 1 ICPs |
| `statement`      | Periodic statements (bank, credit, utilities)       | All Tier 1 ICPs |
| `account`        | Financial account snapshots                         | All Tier 1 ICPs |

**Rationale:** All Tier 1 ICPs (AI-Native Operators, Knowledge Workers, Founders) need financial document management for expense tracking, invoicing, and compliance.

---

### 2.2 Productivity Schema Family

Application types for notes, documents, messages, tasks, projects, and events.

| Application Type | Description                                            | ICP Alignment                                    |
| ---------------- | ------------------------------------------------------ | ------------------------------------------------ |
| `note`           | Free-form text, journals, markdown files               | All Tier 1 ICPs                                  |
| `document`       | Structured files, specs, PDFs, knowledge assets        | All Tier 1 ICPs (critical for Knowledge Workers) |
| `message`        | Emails, DMs, chat transcripts (from Gmail integration) | All Tier 1 ICPs                                  |
| `task`           | Action items with status                               | Founders & Small Teams                           |
| `project`        | Multi-step initiatives                                 | Founders & Small Teams                           |
| `event`          | Meetings, appointments, calendar events                | All Tier 1 ICPs                                  |

**Rationale:** These types support core Tier 1 workflows:

- **AI-Native Operators:** Research synthesis (document, note), communication tracking (message)
- **Knowledge Workers:** Due diligence (document), legal research (document, note), client work (message)
- **Founders:** Team knowledge base (document, note, message), product planning (document, note)

---

### 2.3 Knowledge Schema Family

Application types for contacts and datasets.

| Application Type | Description                                 | ICP Alignment               |
| ---------------- | ------------------------------------------- | --------------------------- |
| `contact`        | People and organization records             | All Tier 1 ICPs             |
| `dataset`        | Tabular datasets (CSV, spreadsheet uploads) | Knowledge Workers, Founders |

**Rationale:** Contact management essential for all ICPs; datasets critical for Knowledge Workers (analysts, researchers) and Founders (product/market data).

---

### 2.4 Legal Schema Family

Application types for legal and compliance documents.

| Application Type | Description                   | ICP Alignment                                      |
| ---------------- | ----------------------------- | -------------------------------------------------- |
| `contract`       | Contracts and legal documents | Knowledge Workers (lawyers, consultants), Founders |

**Rationale:** Critical for Knowledge Workers (legal due diligence, contract analysis) and Founders (investor agreements, vendor contracts, hiring agreements).

---

### 2.5 Travel Schema Family

Application types for travel-related documents.

| Application Type  | Description                                         | ICP Alignment                                    |
| ----------------- | --------------------------------------------------- | ------------------------------------------------ |
| `travel_document` | Flight itineraries, hotel bookings, boarding passes | All Tier 1 ICPs (especially AI-Native Operators) |

**Rationale:** AI-Native Operators frequently travel for conferences, meetups; Knowledge Workers for client work; Founders for fundraising and business development.

---

### 2.6 Identity Schema Family

Application types for identity and credential documents.

| Application Type    | Description              | ICP Alignment   |
| ------------------- | ------------------------ | --------------- |
| `identity_document` | Passports, IDs, licenses | All Tier 1 ICPs |

**Rationale:** Universal need for identity document management, expiry tracking.

---

## 3. Schema Family Mapping

```typescript
// Schema families for documentation and high-level categorization
export const SCHEMA_FAMILIES = {
  FINANCIAL: ["invoice", "receipt", "transaction", "statement", "account"],
  PRODUCTIVITY: ["note", "document", "message", "task", "project", "event"],
  KNOWLEDGE: ["contact", "dataset"],
  LEGAL: ["contract"],
  TRAVEL: ["travel_document"],
  IDENTITY: ["identity_document"],
} as const;
```

---

## 4. Field Extraction Rules Per Type

**Schema Registry Integration:** Field definitions for each record type are managed in the schema registry (see [`docs/subsystems/schema_registry.md`](./schema_registry.md)). The schema registry stores:
- Field definitions (type, required/optional, validators)
- Schema versions for evolution tracking
- Merge policies for reducer conflict resolution

This section documents the field extraction rules used during ingestion. During observation creation, the active schema version is loaded from the schema registry to validate fields and configure merge policies.

---

### 4.1 Financial Types

#### Invoice

**Required Fields:**

- `invoice_number`: string (e.g., "INV-2024-001")
- `amount`: number (e.g., 1500.00)
- `currency`: string (e.g., "USD", "EUR")
- `date_issued`: ISO 8601 date (e.g., "2024-01-15T00:00:00Z")

**Optional Fields:**

- `date_due`: ISO 8601 date
- `vendor_name`: string (triggers entity extraction)
- `customer_name`: string (triggers entity extraction)
- `line_items`: array of objects
- `tax_amount`: number
- `total_amount`: number

**Extraction Patterns:**

```typescript
const INVOICE_PATTERNS = {
  invoice_number: /invoice\s*#?\s*:?\s*([A-Z0-9-]+)/i,
  amount: /(?:amount|total)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
  date_issued: /(?:date|issued)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
  vendor_name: /(?:from|vendor|seller)[\s:]*([A-Za-z0-9\s&.,]+)/i,
};
```

#### Receipt

**Required Fields:**

- `merchant_name`: string (triggers entity extraction)
- `amount`: number
- `currency`: string
- `date_purchased`: ISO 8601 date

**Optional Fields:**

- `receipt_number`: string
- `payment_method`: string (e.g., "credit_card", "cash")
- `items`: array of objects
- `tax_amount`: number

**Extraction Patterns:**

```typescript
const RECEIPT_PATTERNS = {
  merchant_name: /^([A-Za-z0-9\s&.,]+)$/m, // First line often merchant
  amount: /(?:total|amount)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
  date_purchased: /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/,
};
```

#### Transaction

**Required Fields:**

- `date_transacted`: ISO 8601 date
- `amount`: number
- `currency`: string

**Optional Fields:**

- `counterparty`: string (triggers entity extraction)
- `description`: string
- `category`: string
- `account`: string

**Extraction Patterns:**

```typescript
const TRANSACTION_PATTERNS = {
  date_transacted: /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/,
  amount: /\$?\s*([\d,]+\.?\d*)/,
  counterparty: /(?:from|to|payee)[\s:]*([A-Za-z0-9\s&.,]+)/i,
};
```

#### Statement

**Required Fields:**

- `institution`: string (triggers entity extraction)
- `date_start`: ISO 8601 date
- `date_end`: ISO 8601 date

**Optional Fields:**

- `account_number`: string (last 4 digits only)
- `beginning_balance`: number
- `ending_balance`: number
- `transactions`: array of objects

**Extraction Patterns:**

```typescript
const STATEMENT_PATTERNS = {
  institution: /^([A-Za-z0-9\s&.,]+)$/m, // First line often institution
  date_start:
    /(?:period|statement)\s*from[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
  date_end: /(?:period|statement)\s*to[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
};
```

#### Account

**Required Fields:**

- `institution`: string (triggers entity extraction)
- `account_type`: string (e.g., "checking", "savings", "credit")
- `date_snapshot`: ISO 8601 date

**Optional Fields:**

- `account_number`: string (last 4 digits only)
- `balance`: number
- `currency`: string

**Extraction Patterns:**

```typescript
const ACCOUNT_PATTERNS = {
  institution: /(?:bank|institution)[\s:]*([A-Za-z0-9\s&.,]+)/i,
  account_type: /(?:type|account)[\s:]*([A-Za-z\s]+)/i,
  balance: /(?:balance|amount)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
};
```

---

### 4.2 Productivity Types

#### Note

**Required Fields:**

- `content`: string (full text)

**Optional Fields:**

- `title`: string
- `date_created`: ISO 8601 date
- `tags`: array of strings

**Extraction Patterns:**

```typescript
const NOTE_PATTERNS = {
  title: /^#\s+(.+)$/m, // Markdown H1
  content: /.+/s, // Entire text
};
```

#### Document

**Required Fields:**

- `title`: string
- `content`: string

**Optional Fields:**

- `author`: string (triggers entity extraction → person)
- `date_created`: ISO 8601 date
- `document_type`: string (e.g., "report", "proposal", "spec")
- `tags`: array of strings

**Extraction Patterns:**

```typescript
const DOCUMENT_PATTERNS = {
  title: /^(.+)$/m, // First line
  author: /(?:author|by)[\s:]*([A-Za-z\s.,]+)/i,
  date_created: /(?:date|created)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
};
```

#### Message

**Required Fields:**

- `sender`: string (triggers entity extraction → person)
- `date_sent`: ISO 8601 date
- `content`: string

**Optional Fields:**

- `recipient`: string (triggers entity extraction → person)
- `subject`: string
- `message_type`: string (e.g., "email", "dm", "chat")

**Extraction Patterns:**

```typescript
const MESSAGE_PATTERNS = {
  sender: /(?:from)[\s:]*([A-Za-z\s.,<>@]+)/i,
  recipient: /(?:to)[\s:]*([A-Za-z\s.,<>@]+)/i,
  subject: /(?:subject)[\s:]*(.+)$/im,
  date_sent: /(?:date|sent)[\s:]*([A-Za-z0-9\s,:]+)/i,
};
```

#### Task

**Required Fields:**

- `title`: string
- `status`: string (e.g., "todo", "in_progress", "done")

**Optional Fields:**

- `assignee`: string (triggers entity extraction → person)
- `date_due`: ISO 8601 date
- `priority`: string (e.g., "high", "medium", "low")
- `description`: string

**Extraction Patterns:**

```typescript
const TASK_PATTERNS = {
  title: /^[-*]\s*\[([ x])\]\s*(.+)$/m, // Markdown checkbox
  status: /\[(x)\]/ ? "done" : "todo",
  assignee: /(?:assigned to|assignee)[\s:]*([A-Za-z\s.,]+)/i,
};
```

#### Project

**Required Fields:**

- `name`: string
- `status`: string (e.g., "planning", "active", "completed")

**Optional Fields:**

- `owner`: string (triggers entity extraction → person)
- `date_start`: ISO 8601 date
- `date_end`: ISO 8601 date
- `description`: string

**Extraction Patterns:**

```typescript
const PROJECT_PATTERNS = {
  name: /^#\s+(.+)$/m, // Markdown H1
  owner: /(?:owner|lead)[\s:]*([A-Za-z\s.,]+)/i,
  date_start: /(?:start|begin)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
};
```

#### Event

**Required Fields:**

- `title`: string
- `date_start`: ISO 8601 date

**Optional Fields:**

- `date_end`: ISO 8601 date
- `location`: string (triggers entity extraction → location)
- `attendees`: array of strings (trigger entity extraction → person)
- `description`: string

**Extraction Patterns:**

```typescript
const EVENT_PATTERNS = {
  title: /^(.+)$/m, // First line
  date_start: /(?:date|start|begin)[\s:]*([A-Za-z0-9\s,:]+)/i,
  location: /(?:location|where)[\s:]*([A-Za-z0-9\s,.-]+)/i,
};
```

---

### 4.3 Knowledge Types

#### Contact

**Required Fields:**

- `name`: string (this record IS an entity; no extraction, just storage)

**Optional Fields:**

- `email`: string
- `phone`: string
- `company`: string (triggers entity extraction → company)
- `title`: string
- `address`: string
- `notes`: string

**Extraction Patterns:**

```typescript
const CONTACT_PATTERNS = {
  name: /^([A-Za-z\s.,]+)$/m, // First line
  email: /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})/,
  phone: /(\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9})/,
};
```

#### Dataset

**Required Fields:**

- `title`: string
- `source`: string (triggers entity extraction → company)

**Optional Fields:**

- `date_collected`: ISO 8601 date
- `row_count`: number
- `column_names`: array of strings
- `description`: string

**Extraction Patterns:**

```typescript
const DATASET_PATTERNS = {
  title: /^(.+)$/m, // First line or filename
  source: /(?:source|from)[\s:]*([A-Za-z0-9\s&.,]+)/i,
  row_count: /(\d+)\s*rows?/i,
};
```

---

### 4.4 Legal Types

#### Contract

**Required Fields:**

- `title`: string
- `parties`: array of strings (trigger entity extraction → company/person)

**Optional Fields:**

- `date_effective`: ISO 8601 date
- `date_expiry`: ISO 8601 date
- `contract_type`: string (e.g., "employment", "vendor", "nda")
- `value`: number
- `currency`: string

**Extraction Patterns:**

```typescript
const CONTRACT_PATTERNS = {
  title: /^(.+)$/m, // First line
  parties:
    /(?:between|parties)[\s:]*([A-Za-z0-9\s&.,]+)(?:and)([A-Za-z0-9\s&.,]+)/i,
  date_effective: /(?:effective|start)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
  date_expiry:
    /(?:expiry|end|termination)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
};
```

---

### 4.5 Travel Types

#### Travel Document

**Required Fields:**

- `title`: string
- `date_departure`: ISO 8601 date

**Optional Fields:**

- `date_arrival`: ISO 8601 date
- `carrier`: string (triggers entity extraction → company)
- `destination`: string (triggers entity extraction → location)
- `origin`: string (triggers entity extraction → location)
- `confirmation_number`: string

**Extraction Patterns:**

```typescript
const TRAVEL_DOCUMENT_PATTERNS = {
  title: /^(.+)$/m, // First line
  date_departure: /(?:departure|depart)[\s:]*([A-Za-z0-9\s,:]+)/i,
  date_arrival: /(?:arrival|arrive)[\s:]*([A-Za-z0-9\s,:]+)/i,
  carrier: /(?:carrier|airline|operator)[\s:]*([A-Za-z0-9\s&.,]+)/i,
  destination: /(?:to|destination)[\s:]*([A-Za-z\s,.-]+)/i,
};
```

---

### 4.6 Identity Types

#### Identity Document

**Required Fields:**

- `document_type`: string (e.g., "passport", "driver_license", "national_id")
- `document_number`: string

**Optional Fields:**

- `holder_name`: string (triggers entity extraction → person, but usually user)
- `issuing_authority`: string (triggers entity extraction → company/location)
- `date_issued`: ISO 8601 date
- `date_expiry`: ISO 8601 date
- `nationality`: string

**Extraction Patterns:**

```typescript
const IDENTITY_DOCUMENT_PATTERNS = {
  document_type: /(?:passport|driver|license|id)/i,
  document_number: /(?:number|no\.?)[\s:]*([A-Z0-9]+)/i,
  date_issued: /(?:issue|issued)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
  date_expiry: /(?:expir|expiry|expires)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
};
```

---

## 4.5 Observation Emission Patterns

**Overview:** After field extraction, Neotoma creates **observations** — granular, source-specific facts extracted from documents. Observations are the intermediate layer between documents and entity snapshots.

**Process:**

1. Extract fields using type-specific rules (Section 4)
2. Categorize fields: known (match schema) vs unknown (store in raw_fragments)
3. For each entity identified in extracted fields:
   - Create observation with entity_id, entity_type, fields
   - Set specificity_score based on field confidence
   - Set source_priority based on document source
   - Reference schema_version for deterministic replay
4. Store observations, then trigger reducer to compute entity snapshots

**Observation Fields Per Type:**

Observations contain the same fields as extracted fields (Section 4), but organized by entity:

- **Invoice:** Creates observations for `vendor_name` (company entity) and `customer_name` (company entity)
- **Receipt:** Creates observation for `merchant_name` (company entity)
- **Transaction:** Creates observation for `counterparty` (company or person entity)
- **Contact:** Creates observation for contact itself (person or company entity)

**Specificity Score Calculation:**

| Field Type | Specificity Score | Rationale |
| ---------- | ----------------- | --------- |
| Explicit entity name | 0.9 | High confidence |
| Inferred from context | 0.6 | Medium confidence |
| Partial match | 0.4 | Lower confidence |
| Ambiguous | 0.2 | Low confidence |

**Source Priority Rules:**

| Source Type | Priority | Rationale |
| ----------- | -------- | --------- |
| Official documents (invoices, contracts) | 10 | Highest trust |
| Bank statements | 8 | High trust |
| Receipts | 7 | Medium-high trust |
| Notes, messages | 5 | Medium trust |
| User-entered | 3 | Lower trust |

**Reducer Merge Policies (Schema Registry):**

Merge policies are configured per field in the schema registry, not hard-coded. This enables schema evolution without code changes.

**Example merge policies for common record types:**

- **Invoice:** `vendor_name` uses `highest_priority`, `amount` uses `last_write`
- **Receipt:** `merchant_name` uses `highest_priority`, `total` uses `last_write`
- **Transaction:** `counterparty` uses `most_specific`, `amount` uses `last_write`

**Schema Registry Lookup:** During observation creation, the active schema version is fetched from schema registry. This schema version is referenced in the observation for deterministic replay. When the reducer runs, it loads merge policies from schema registry to resolve conflicts between multiple observations.

See [`docs/subsystems/reducer.md`](./reducer.md) for merge strategy details and [`docs/subsystems/schema_registry.md`](./schema_registry.md) for schema version management.

**Related Documents:**

- [`docs/subsystems/observation_architecture.md`](./observation_architecture.md) — Complete observation architecture
- [`docs/subsystems/reducer.md`](./reducer.md) — Reducer merge strategies
- [`docs/subsystems/schema_registry.md`](./schema_registry.md) — Schema registry patterns

---

## 5. Entity Extraction Rules Per Type

| Application Type    | Entity Fields                      | Entity Types                | Notes                                                      |
| ------------------- | ---------------------------------- | --------------------------- | ---------------------------------------------------------- |
| `invoice`           | `vendor_name`, `customer_name`     | company, company            | Vendors/customers are companies                            |
| `receipt`           | `merchant_name`                    | company                     | Merchants are companies                                    |
| `transaction`       | `counterparty`                     | company or person           | Ambiguous; use heuristics (capitalized = company)          |
| `statement`         | `institution`                      | company                     | Financial institutions are companies                       |
| `account`           | `institution`                      | company                     | Financial institutions are companies                       |
| `note`              | —                                  | —                           | No automatic entity extraction                             |
| `document`          | `author`                           | person                      | Authors are people                                         |
| `message`           | `sender`, `recipient`              | person, person              | Senders/recipients are people                              |
| `task`              | `assignee`                         | person                      | Assignees are people                                       |
| `project`           | `owner`                            | person                      | Owners are people                                          |
| `event`             | `location`, `attendees`            | location, person            | Locations and attendees                                    |
| `contact`           | (is entity itself)                 | person or company           | Contact record IS the entity                               |
| `dataset`           | `source`                           | company                     | Data sources are companies                                 |
| `contract`          | `parties`                          | company or person           | Parties can be companies or people                         |
| `travel_document`   | `carrier`, `destination`, `origin` | company, location, location | Carriers are companies; destinations/origins are locations |
| `identity_document` | `issuing_authority`                | company or location         | Issuing authorities are government entities                |

---

## 6. Event Generation Rules Per Type

| Application Type    | Date Fields                      | Event Types                              | Notes                           |
| ------------------- | -------------------------------- | ---------------------------------------- | ------------------------------- |
| `invoice`           | `date_issued`, `date_due`        | InvoiceIssued, InvoiceDue                | Two events per invoice          |
| `receipt`           | `date_purchased`                 | PurchaseMade                             | One event per receipt           |
| `transaction`       | `date_transacted`                | TransactionOccurred                      | One event per transaction       |
| `statement`         | `date_start`, `date_end`         | StatementPeriodStart, StatementPeriodEnd | Two events per statement        |
| `account`           | `date_snapshot`                  | AccountSnapshot                          | One event per snapshot          |
| `note`              | —                                | —                                        | No automatic event generation   |
| `document`          | `date_created`                   | DocumentCreated                          | One event if date present       |
| `message`           | `date_sent`                      | MessageSent                              | One event per message           |
| `task`              | `date_due`                       | TaskDue                                  | One event if due date present   |
| `project`           | `date_start`, `date_end`         | ProjectStart, ProjectEnd                 | Two events if dates present     |
| `event`             | `date_start`, `date_end`         | EventStart, EventEnd                     | Two events; `date_end` optional |
| `contact`           | —                                | —                                        | No automatic event generation   |
| `dataset`           | `date_collected`                 | DatasetCollected                         | One event if date present       |
| `contract`          | `date_effective`, `date_expiry`  | ContractEffective, ContractExpiry        | Two events if dates present     |
| `travel_document`   | `date_departure`, `date_arrival` | TravelDeparture, TravelArrival           | Two events if dates present     |
| `identity_document` | `date_issued`, `date_expiry`     | DocumentIssued, DocumentExpiry           | Two events if dates present     |

---

## 7. Schema Detection Patterns (MVP)

Schema detection uses **multi-pattern matching**: a document must match **2 or more patterns** for a given type to be classified as that type. If no type matches 2+ patterns, fallback to `document` (generic).

### 7.1 Invoice Detection

```typescript
const INVOICE_DETECTION_PATTERNS = [
  /invoice\s*#?\s*:?\s*([A-Z0-9-]+)/i,
  /bill\s*to:/i,
  /amount\s*due:/i,
  /invoice\s*date/i,
  /payment\s*terms/i,
];

// Classification: Match 2+ patterns → type = 'invoice'
```

### 7.2 Receipt Detection

```typescript
const RECEIPT_DETECTION_PATTERNS = [
  /receipt/i,
  /thank\s*you\s*for\s*your\s*purchase/i,
  /items?\s*purchased/i,
  /total\s*amount/i,
  /payment\s*method/i,
];

// Classification: Match 2+ patterns → type = 'receipt'
```

### 7.3 Transaction Detection

```typescript
const TRANSACTION_DETECTION_PATTERNS = [
  /transaction/i,
  /debit|credit/i,
  /account\s*number/i,
  /balance/i,
  /posted\s*date/i,
];

// Classification: Match 2+ patterns → type = 'transaction'
```

### 7.4 Statement Detection

```typescript
const STATEMENT_DETECTION_PATTERNS = [
  /statement/i,
  /account\s*summary/i,
  /period\s*from|statement\s*period/i,
  /beginning\s*balance/i,
  /ending\s*balance/i,
];

// Classification: Match 2+ patterns → type = 'statement'
```

### 7.5 Contract Detection

```typescript
const CONTRACT_DETECTION_PATTERNS = [
  /agreement|contract/i,
  /parties|between/i,
  /effective\s*date/i,
  /terms\s*and\s*conditions/i,
  /signature/i,
];

// Classification: Match 2+ patterns → type = 'contract'
```

### 7.6 Travel Document Detection

```typescript
const TRAVEL_DOCUMENT_DETECTION_PATTERNS = [
  /itinerary|booking|reservation/i,
  /departure|arrival/i,
  /flight|train|hotel/i,
  /confirmation\s*number/i,
  /passenger|guest/i,
];

// Classification: Match 2+ patterns → type = 'travel_document'
```

### 7.7 Identity Document Detection

```typescript
const IDENTITY_DOCUMENT_DETECTION_PATTERNS = [
  /passport|driver.*license|national.*id/i,
  /document\s*number/i,
  /date\s*of\s*issue|issued/i,
  /expiry|expires/i,
  /nationality|country\s*of\s*issue/i,
];

// Classification: Match 2+ patterns → type = 'identity_document'
```

### 7.8 Message Detection

```typescript
const MESSAGE_DETECTION_PATTERNS = [
  /from:/i,
  /to:/i,
  /subject:/i,
  /sent:/i,
  /reply|forward/i,
];

// Classification: Match 2+ patterns → type = 'message'
```

### 7.9 Fallback

If no type matches 2+ patterns, classify as `document` (generic fallback).

---

## 8. TypeScript Type Definitions

```typescript
// src/config/record_types.ts

// Canonical application-level record types (MVP)
export const RECORD_TYPES = {
  // Finance
  INVOICE: "invoice",
  RECEIPT: "receipt",
  TRANSACTION: "transaction",
  STATEMENT: "statement",
  ACCOUNT: "account",

  // Productivity
  NOTE: "note",
  DOCUMENT: "document",
  MESSAGE: "message",
  TASK: "task",
  PROJECT: "project",
  EVENT: "event",

  // Knowledge
  CONTACT: "contact",
  DATASET: "dataset",

  // Legal/Compliance
  CONTRACT: "contract",

  // Travel
  TRAVEL_DOCUMENT: "travel_document",

  // Identity
  IDENTITY_DOCUMENT: "identity_document",
} as const;

export type RecordType = (typeof RECORD_TYPES)[keyof typeof RECORD_TYPES];

// Schema families for documentation and high-level categorization
export const SCHEMA_FAMILIES = {
  FINANCIAL: ["invoice", "receipt", "transaction", "statement", "account"],
  PRODUCTIVITY: ["note", "document", "message", "task", "project", "event"],
  KNOWLEDGE: ["contact", "dataset"],
  LEGAL: ["contract"],
  TRAVEL: ["travel_document"],
  IDENTITY: ["identity_document"],
} as const;

export type SchemaFamily = keyof typeof SCHEMA_FAMILIES;

// Helper function: Get schema family for a given application type
export function getSchemaFamily(recordType: RecordType): SchemaFamily | null {
  for (const [family, types] of Object.entries(SCHEMA_FAMILIES)) {
    if (types.includes(recordType)) {
      return family as SchemaFamily;
    }
  }
  return null;
}

// Helper function: Get all types in a schema family
export function getTypesInFamily(family: SchemaFamily): readonly RecordType[] {
  return SCHEMA_FAMILIES[family];
}
```

---

## 9. JSONB Schema Structure Per Type

All `records.properties` JSONB fields MUST include `schema_version` for evolution tracking.

**Note:** In addition to `properties`, all records also include `extraction_metadata` JSONB that stores unknown fields, validation warnings, and extraction quality indicators. Unknown fields (fields extracted but not defined in the schema) are preserved in `extraction_metadata.unknown_fields`. See `docs/subsystems/schema.md` Section 3.11 and `docs/architecture/schema_handling.md` for the layered storage model.

### 9.1 Invoice JSONB Schema

```typescript
interface InvoiceProperties {
  schema_version: "1.0";
  invoice_number: string; // Required
  amount: number; // Required
  currency: string; // Required
  date_issued: string; // Required, ISO 8601
  date_due?: string; // Optional, ISO 8601
  vendor_name?: string; // Optional
  customer_name?: string; // Optional
  line_items?: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  tax_amount?: number;
  total_amount?: number;
}
```

### 9.2 Receipt JSONB Schema

```typescript
interface ReceiptProperties {
  schema_version: "1.0";
  merchant_name: string; // Required
  amount: number; // Required
  currency: string; // Required
  date_purchased: string; // Required, ISO 8601
  receipt_number?: string;
  payment_method?: string;
  items?: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  tax_amount?: number;
}
```

### 9.3 Document JSONB Schema (Generic Fallback)

```typescript
interface DocumentProperties {
  schema_version: "1.0";
  title: string; // Required
  content: string; // Required (full extracted text)
  author?: string;
  date_created?: string; // ISO 8601
  document_type?: string;
  tags?: string[];
}
```

**Note:** All other types follow similar structure. See `docs/subsystems/schema.md` for complete JSONB schemas.

---

## 10. Validation Rules

### 10.1 Type Assignment Validation

**MUST:**

- Assign type deterministically (same raw_text → same type)
- Use multi-pattern matching (2+ patterns for non-fallback types)
- Fallback to `document` if no type matches 2+ patterns
- Never change type after initial assignment (immutable)

**MUST NOT:**

- Use LLM for type detection (MVP constraint)
- Guess type based on filename only
- Assign custom types not in this catalog

### 10.2 Field Extraction Validation

**MUST:**

- Extract only fields defined for assigned type into `properties`
- Store unknown fields (not defined in schema) in `extraction_metadata.unknown_fields`
- Use deterministic extraction (regex, parsing; no LLM in MVP)
- Validate extracted values (e.g., dates must be parseable)
- Include `schema_version: "1.0"` in all JSONB properties
- Always create record (never reject entire record due to unknown or missing fields)
- Log warnings for filtered unknown fields in `extraction_metadata.warnings`
- Log warnings for missing required fields in `extraction_metadata.warnings`

**MUST NOT:**

- Store unknown fields in `properties` (must go to `extraction_metadata.unknown_fields`)
- Reject records due to unknown fields
- Reject records due to missing optional fields
- Infer fields not present in raw_text
- Modify extracted fields after initial extraction (immutable)

**Validation Pattern:**

1. Extract all fields from raw_text (including unknown ones)
2. Partition into structured (schema-defined) vs unknown (not in schema)
3. Store structured fields in `properties` (schema-compliant)
4. Store unknown fields in `extraction_metadata.unknown_fields` (preservation)
5. Log warnings for filtered fields and missing required fields
6. Always create record with valid fields + metadata (never reject)

---

## Agent Instructions

### When to Load This Document

Load `docs/subsystems/record_types.md` when:

- Implementing schema detection logic
- Writing field extraction code
- Creating test fixtures for specific record types
- Planning entity resolution or event generation
- Modifying `src/config/record_types.ts`
- Writing MCP actions that filter by type
- Creating UI components that display type-specific fields

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md` (always)
- `docs/subsystems/schema.md` (database schema and JSONB structure)
- `docs/subsystems/ingestion/ingestion.md` (ingestion pipeline context)
- `docs/architecture/determinism.md` (deterministic extraction requirements)

### Constraints Agents Must Enforce

1. **Application types are canonical** — Use granular types (`invoice`, `receipt`) in code, not schema families
2. **Schema families are for documentation** — Use families (`Financial`, `Productivity`) only in docs and user-facing categorization
3. **Multi-pattern matching required** — Type detection MUST match 2+ patterns for non-fallback types
4. **No custom types** — Only types defined in this document are valid
5. **Immutable type assignment** — Once assigned, `records.type` never changes
6. **Deterministic extraction** — Same raw_text → same extracted fields (no LLM in MVP)
7. **Schema versioning required** — All JSONB properties MUST include `schema_version`

### Forbidden Patterns

- Using schema family names (`Financial`, `Productivity`) as database types
- Mixing application types and families in code
- Adding custom types without updating this document
- Using LLM for type detection or field extraction (MVP)
- Changing type after initial assignment
- Extracting fields not defined for assigned type
- Omitting `schema_version` from JSONB properties

### Validation Checklist

- [ ] Change uses application-level types, not schema families
- [ ] Type detection uses multi-pattern matching (2+ patterns)
- [ ] Fallback to `document` if no type matches
- [ ] Field extraction rules match type definition in this document
- [ ] Entity extraction follows rules in Section 5
- [ ] Event generation follows rules in Section 6
- [ ] JSONB schema includes `schema_version`
- [ ] Tests verify determinism (same input → same output)
- [ ] Code references this document for type catalog
- [ ] `src/config/record_types.ts` updated if types added

---

**END OF DOCUMENT**
