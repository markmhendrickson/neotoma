export type RecordTypeCategory =
  | "finance"
  | "productivity"
  | "knowledge"
  | "health"
  | "media";

export interface RecordTypeDefinition {
  id: string;
  label: string;
  description: string;
  category: RecordTypeCategory;
  primaryProperties: string[];
  aliases?: string[];
}

export type RecordTypeMatch = "canonical" | "alias" | "custom" | "default";

const definitions: ReadonlyArray<RecordTypeDefinition> = [
  {
    id: "account",
    label: "Account",
    description: "Financial account snapshots (bank, brokerage, wallet).",
    category: "finance",
    primaryProperties: [
      "external_id",
      "institution",
      "balance",
      "currency",
      "status",
      "wallet",
      "wallet_name",
      "number",
      "categories",
      "denomination",
      "notes",
    ],
    aliases: ["bank_account", "wallet", "ledger_account"],
  },
  {
    id: "transaction",
    label: "Transaction",
    description: "Individual debits/credits pulled from Plaid or uploads.",
    category: "finance",
    primaryProperties: [
      "amount",
      "currency",
      "date",
      "merchant_name",
      "status",
      "account_id",
      "posting_date",
      "category",
      "bank_provider",
      "amount_original",
    ],
    aliases: ["transactions", "txn", "expense", "purchase", "payment"],
  },
  {
    id: "invoice",
    label: "Invoice",
    description: "Money owed to you or vendors.",
    category: "finance",
    primaryProperties: [
      "invoice_number",
      "amount_due",
      "due_date",
      "vendor",
      "status",
    ],
    aliases: ["bill"],
  },
  {
    id: "receipt",
    label: "Receipt",
    description: "Proof-of-purchase documents.",
    category: "finance",
    primaryProperties: [
      "receipt_number",
      "amount_total",
      "date",
      "merchant_name",
      "currency",
    ],
    aliases: ["proof_of_purchase"],
  },
  {
    id: "statement",
    label: "Statement",
    description: "Periodic statements (bank, credit, utilities).",
    category: "finance",
    primaryProperties: [
      "statement_period_start",
      "statement_period_end",
      "balance",
      "institution",
    ],
    aliases: ["bank_statement"],
  },
  {
    id: "budget",
    label: "Budget",
    description: "Planned vs actual spend for a window/category.",
    category: "finance",
    primaryProperties: [
      "period",
      "category",
      "amount_limit",
      "amount_spent",
      "currency",
    ],
    aliases: ["spending_plan"],
  },
  {
    id: "subscription",
    label: "Subscription",
    description: "Recurring payment agreements.",
    category: "finance",
    primaryProperties: [
      "provider",
      "plan_name",
      "amount",
      "currency",
      "renewal_date",
      "status",
    ],
    aliases: ["membership", "recurring_payment"],
  },
  {
    id: "note",
    label: "Note",
    description: "Free-form text, journals, scratchpads.",
    category: "productivity",
    primaryProperties: ["title", "content", "tags", "source", "summary"],
    aliases: ["journal", "memo"],
  },
  {
    id: "document",
    label: "Document",
    description: "Structured files, specs, PDFs, knowledge assets.",
    category: "knowledge",
    primaryProperties: ["title", "summary", "source", "tags", "link"],
    aliases: ["doc", "file", "pdf"],
  },
  {
    id: "message",
    label: "Message",
    description: "Emails, DMs, chat transcripts.",
    category: "knowledge",
    primaryProperties: [
      "thread_id",
      "channel",
      "sender",
      "recipient",
      "subject",
      "body",
      "engagement_stats",
    ],
    aliases: ["email", "dm", "sms"],
  },
  {
    id: "task",
    label: "Task",
    description: "Action items with status.",
    category: "productivity",
    primaryProperties: ["title", "status", "due_date", "assignee", "priority"],
    aliases: ["todo", "action_item"],
  },
  {
    id: "project",
    label: "Project",
    description: "Multi-step initiatives.",
    category: "productivity",
    primaryProperties: ["name", "status", "owner", "start_date", "due_date"],
    aliases: ["initiative", "program"],
  },
  {
    id: "goal",
    label: "Goal",
    description: "Outcome targets or OKRs.",
    category: "productivity",
    primaryProperties: [
      "name",
      "metric",
      "target_value",
      "deadline",
      "category",
    ],
    aliases: ["objective", "okr"],
  },
  {
    id: "event",
    label: "Event",
    description: "Meetings, appointments, scheduled interactions.",
    category: "productivity",
    primaryProperties: [
      "title",
      "start_time",
      "end_time",
      "location",
      "attendees",
      "recurring",
      "frequency",
      "duration_hours",
      "times_per_year",
    ],
    aliases: ["meeting", "appointment", "calendar_event", "recurring_event"],
  },
  {
    id: "contact",
    label: "Contact",
    description: "People and organization records.",
    category: "knowledge",
    primaryProperties: [
      "name",
      "email",
      "phone",
      "organization",
      "role",
      "contact_type",
      "category",
      "platform",
      "address",
      "country",
      "website",
      "notes",
      "first_contact_date",
      "last_contact_date",
      "created_date",
      "updated_date",
    ],
    aliases: ["person", "lead"],
  },
  {
    id: "exercise",
    label: "Exercise",
    description: "Single workout sessions or sets.",
    category: "health",
    primaryProperties: [
      "name",
      "duration",
      "intensity",
      "muscle_group",
      "sets",
      "reps",
    ],
    aliases: ["workout", "training_session"],
  },
  {
    id: "measurement",
    label: "Measurement",
    description: "Biometrics and quantitative stats.",
    category: "health",
    primaryProperties: ["metric", "value", "unit", "recorded_at", "context"],
    aliases: ["biometric", "stat"],
  },
  {
    id: "meal",
    label: "Meal",
    description: "Food logs and nutrition captures.",
    category: "health",
    primaryProperties: ["name", "calories", "macros", "consumed_at", "items"],
    aliases: ["food_log", "nutrition"],
  },
  {
    id: "sleep_session",
    label: "Sleep Session",
    description: "Bedtime tracking entries.",
    category: "health",
    primaryProperties: [
      "start_time",
      "end_time",
      "duration",
      "quality",
      "notes",
    ],
    aliases: ["sleep", "rest"],
  },
  {
    id: "media_asset",
    label: "Media Asset",
    description: "Uploaded files, images, videos, or remote media.",
    category: "media",
    primaryProperties: [
      "file_name",
      "mime_type",
      "size",
      "url",
      "checksum",
      "engagement_stats",
    ],
    aliases: ["file_asset", "file", "attachment", "asset"],
  },
  {
    id: "dataset",
    label: "Dataset",
    description: "Tabular datasets produced from CSV or spreadsheet uploads.",
    category: "knowledge",
    primaryProperties: ["row_count", "source_file", "summary"],
    aliases: ["csv", "spreadsheet", "table", "dataset_file"],
  },
  {
    id: "dataset_row",
    label: "Dataset Row",
    description: "Single row derived from a dataset upload.",
    category: "knowledge",
    primaryProperties: ["csv_origin", "row_index", "source_file"],
    aliases: ["table_row", "csv_row"],
  },
  {
    id: "contract",
    label: "Contract",
    description: "Legal contracts and agreements.",
    category: "finance",
    primaryProperties: [
      "contract_number",
      "parties",
      "effective_date",
      "expiration_date",
      "status",
      "name",
      "signed_date",
      "companies",
      "files",
      "type",
      "notes",
    ],
    aliases: ["agreement", "legal_document"],
  },
  {
    id: "holding",
    label: "Holding",
    description:
      "Portfolio position snapshots tracking asset holdings over time.",
    category: "finance",
    primaryProperties: [
      "asset_symbol",
      "snapshot_date",
      "quantity",
      "current_value_usd",
      "account_id",
    ],
    aliases: ["portfolio_position", "asset_holding"],
  },
  {
    id: "income",
    label: "Income",
    description: "Income stream records from various sources.",
    category: "finance",
    primaryProperties: ["income_date", "source", "amount_usd", "tax_year"],
    aliases: ["earnings", "revenue"],
  },
  {
    id: "tax_event",
    label: "Tax Event",
    description: "Capital gains, losses, and tax-related transactions.",
    category: "finance",
    primaryProperties: [
      "event_date",
      "asset_symbol",
      "tax_year",
      "gain_loss_usd",
    ],
    aliases: ["capital_gain", "tax_transaction"],
  },
  {
    id: "crypto_transaction",
    label: "Crypto Transaction",
    description: "On-chain cryptocurrency transactions.",
    category: "finance",
    primaryProperties: [
      "transaction_date",
      "tx_hash",
      "asset_symbol",
      "value_usd",
    ],
    aliases: ["blockchain_transaction", "crypto_tx"],
  },
  {
    id: "liability",
    label: "Liability",
    description: "Debt and obligation tracking.",
    category: "finance",
    primaryProperties: [
      "name",
      "liability_type",
      "amount_usd",
      "snapshot_date",
    ],
    aliases: ["debt", "obligation"],
  },
  {
    id: "flow",
    label: "Flow",
    description: "Cash flow tracking for income and expenses over time.",
    category: "finance",
    primaryProperties: [
      "flow_name",
      "flow_date",
      "amount_usd",
      "for_cash_flow",
    ],
    aliases: ["cash_flow", "money_flow"],
  },
  {
    id: "purchase",
    label: "Purchase",
    description: "Planned and completed purchase tracking.",
    category: "productivity",
    primaryProperties: ["item_name", "status", "created_date"],
    aliases: ["buy", "acquisition"],
  },
  {
    id: "transfer",
    label: "Transfer",
    description: "Asset transfers between accounts.",
    category: "finance",
    primaryProperties: [
      "name",
      "created_time",
      "origin_account",
      "destination_account",
    ],
    aliases: ["asset_transfer", "account_transfer"],
  },
  {
    id: "wallet",
    label: "Wallet",
    description: "Financial institutions and wallets containing accounts.",
    category: "finance",
    primaryProperties: ["name", "status"],
    aliases: ["financial_institution", "institution"],
  },
  {
    id: "tax_filing",
    label: "Tax Filing",
    description: "Tax filing tracking and status.",
    category: "finance",
    primaryProperties: ["name", "jurisdiction", "year", "status"],
    aliases: ["tax_return", "filing"],
  },
  {
    id: "order",
    label: "Order",
    description: "Trading orders and order tracking.",
    category: "finance",
    primaryProperties: ["name", "date", "order_type", "amount"],
    aliases: ["trade_order", "trading_order"],
  },
  {
    id: "fixed_cost",
    label: "Fixed Cost",
    description: "Recurring expenses and subscriptions.",
    category: "finance",
    primaryProperties: [
      "merchant",
      "expense_name",
      "status",
      "frequency_per_year",
    ],
    aliases: ["recurring_expense", "subscription_cost"],
  },
  {
    id: "property",
    label: "Property",
    description: "Real estate property tracking.",
    category: "finance",
    primaryProperties: ["name", "address", "purchase_date"],
    aliases: ["real_estate", "asset_property"],
  },
  {
    id: "balance",
    label: "Balance",
    description: "Account balance snapshots over time.",
    category: "finance",
    primaryProperties: [
      "snapshot_date",
      "account_id",
      "balance_usd",
      "currency_original",
    ],
    aliases: ["account_balance", "balance_snapshot"],
  },
] as const;

type AliasMap = Map<string, RecordTypeDefinition>;

const aliasMap: AliasMap = definitions.reduce((map, definition) => {
  map.set(definition.id.toLowerCase(), definition);
  (definition.aliases || []).forEach((alias) => {
    map.set(alias.toLowerCase(), definition);
  });
  return map;
}, new Map<string, RecordTypeDefinition>());

export interface RecordTypeResolution {
  type: string;
  match: RecordTypeMatch;
  definition?: RecordTypeDefinition;
  alias?: string;
}

export function listCanonicalRecordTypes(): ReadonlyArray<RecordTypeDefinition> {
  return definitions;
}

/**
 * Normalize record type (FU-100: returns 'document' for unrecognized types)
 *
 * Per MVP requirements, unrecognized types fallback to 'document' instead of creating custom types.
 */
export function normalizeRecordType(
  input?: string | null,
): RecordTypeResolution {
  const trimmed = (input || "").trim();
  if (!trimmed) {
    return { type: "document", match: "default" };
  }

  const lower = trimmed.toLowerCase();
  const canonical = aliasMap.get(lower);
  if (canonical) {
    return {
      type: canonical.id,
      match: lower === canonical.id ? "canonical" : "alias",
      definition: canonical,
      alias: lower === canonical.id ? undefined : trimmed,
    };
  }

  // FU-100: Unrecognized types fallback to 'document' (not custom types)
  return { type: "document", match: "default" };
}

export function isCanonicalRecordType(type: string): boolean {
  return aliasMap.get(type.toLowerCase())?.id === type;
}
