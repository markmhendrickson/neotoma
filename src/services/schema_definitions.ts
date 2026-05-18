/**
 * Entity Schema Definitions for All Entity Types
 *
 * Defines entity schemas for all entity types including new financial types
 * from the finances repository.
 *
 * **Primary Usage:** Initialize schemas in the database via `npm run schema:init`
 * This makes schemas transparent and queryable in the database, and is the recommended
 * approach for production environments.
 *
 * **Fallback Usage:** These schemas are also used as runtime fallbacks when no schema
 * is registered in the database. This provides convenience during development but should
 * not be relied upon in production. See src/services/interpretation.ts for fallback logic.
 *
 * **Schema Initialization:**
 * Run `npm run schema:init` to register all schemas from this file into the
 * schema_registry database table. This ensures schemas are available in the database
 * and eliminates the need for runtime fallbacks.
 */

import type { SchemaDefinition, ReducerConfig } from "./schema_registry.js";

/**
 * Metadata for entity schemas
 * Contains human-readable labels, descriptions, categories, and aliases
 */
export interface EntitySchemaMetadata {
  label: string;
  description: string;
  category: "finance" | "productivity" | "knowledge" | "health" | "media" | "agent_runtime";
  aliases?: string[];
  primaryProperties?: string[]; // Optional: can derive from required fields
  guest_access_policy?: "closed" | "read_only" | "submit_only" | "submitter_scoped" | "open";
}

export interface EntitySchema {
  entity_type: string;
  schema_version: string;
  metadata?: EntitySchemaMetadata;
  schema_definition: SchemaDefinition;
  reducer_config: ReducerConfig;
}

/**
 * Default entity schemas for all entity types
 * These are used as fallbacks when no schema is registered in the database.
 */
export const ENTITY_SCHEMAS: Record<string, EntitySchema> = {
  holding: {
    entity_type: "holding",
    schema_version: "1.0",
    metadata: {
      label: "Holding",
      description: "Portfolio position snapshots tracking asset holdings over time.",
      category: "finance",
      aliases: ["portfolio_position", "asset_holding"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        snapshot_date: { type: "date", required: true },
        asset_symbol: { type: "string", required: true },
        asset_name: { type: "string", required: false },
        asset_type: { type: "string", required: false },
        quantity: { type: "number", required: true },
        cost_basis_usd: { type: "number", required: false },
        current_value_usd: { type: "number", required: true },
        account_id: { type: "string", required: false },
        account_type: { type: "string", required: false },
        provider: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        current_value_usd: { strategy: "last_write" },
        quantity: { strategy: "last_write" },
        snapshot_date: { strategy: "last_write" },
      },
    },
  },

  income: {
    entity_type: "income",
    schema_version: "1.0",
    metadata: {
      label: "Income",
      description: "Income stream records from various sources.",
      category: "finance",
      aliases: ["earnings", "revenue"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        income_date: { type: "date", required: true },
        income_type: { type: "string", required: false },
        source: { type: "string", required: true },
        amount_usd: { type: "number", required: true },
        amount_original: { type: "number", required: false },
        currency_original: { type: "string", required: false },
        description: { type: "string", required: false },
        entity: { type: "string", required: false },
        tax_year: { type: "number", required: true },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        amount_usd: { strategy: "last_write" },
        income_date: { strategy: "last_write" },
      },
    },
  },

  tax_event: {
    entity_type: "tax_event",
    schema_version: "1.0",
    metadata: {
      label: "Tax Event",
      description: "Capital gains, losses, and tax-related transactions.",
      category: "finance",
      aliases: ["capital_gain", "tax_transaction"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        event_date: { type: "date", required: true },
        event_type: { type: "string", required: false },
        asset_symbol: { type: "string", required: true },
        quantity: { type: "number", required: false },
        cost_basis_usd: { type: "number", required: false },
        proceeds_usd: { type: "number", required: false },
        gain_loss_usd: { type: "number", required: true },
        tax_year: { type: "number", required: true },
        jurisdiction: { type: "string", required: false },
        description: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        gain_loss_usd: { strategy: "last_write" },
        event_date: { strategy: "last_write" },
      },
    },
  },

  crypto_transaction: {
    entity_type: "crypto_transaction",
    schema_version: "1.0",
    metadata: {
      label: "Crypto Transaction",
      description: "On-chain cryptocurrency transactions.",
      category: "finance",
      aliases: ["blockchain_transaction", "crypto_tx"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        transaction_date: { type: "date", required: true },
        transaction_type: { type: "string", required: false },
        blockchain: { type: "string", required: false },
        from_address: { type: "string", required: false },
        to_address: { type: "string", required: false },
        asset_symbol: { type: "string", required: true },
        quantity: { type: "number", required: false },
        value_usd: { type: "number", required: true },
        fee_usd: { type: "number", required: false },
        tx_hash: { type: "string", required: true },
        wallet_id: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        tx_hash: { strategy: "last_write" },
        value_usd: { strategy: "last_write" },
      },
    },
  },

  liability: {
    entity_type: "liability",
    schema_version: "1.0",
    metadata: {
      label: "Liability",
      description: "Debt and obligation tracking.",
      category: "finance",
      aliases: ["debt", "obligation"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        name: { type: "string", required: true },
        liability_type: { type: "string", required: false },
        amount_usd: { type: "number", required: true },
        amount_original: { type: "number", required: false },
        currency_original: { type: "string", required: false },
        snapshot_date: { type: "date", required: true },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        amount_usd: { strategy: "last_write" },
        snapshot_date: { strategy: "last_write" },
      },
    },
  },

  flow: {
    entity_type: "flow",
    schema_version: "1.0",
    metadata: {
      label: "Flow",
      description: "Cash flow tracking for income and expenses over time.",
      category: "finance",
      aliases: ["cash_flow", "money_flow"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        flow_name: { type: "string", required: true },
        flow_date: { type: "date", required: true },
        year: { type: "number", required: false },
        timeline: { type: "string", required: false },
        amount_usd: { type: "number", required: true },
        amount_original: { type: "number", required: false },
        currency_original: { type: "string", required: false },
        for_cash_flow: { type: "boolean", required: false },
        party: { type: "string", required: false },
        flow_type: { type: "string", required: false },
        location: { type: "string", required: false },
        category: { type: "string", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        amount_usd: { strategy: "last_write" },
        flow_date: { strategy: "last_write" },
      },
    },
  },

  insurance_policy: {
    entity_type: "insurance_policy",
    schema_version: "1.0",
    metadata: {
      label: "Insurance policy",
      description: "Insurance policy records and coverage metadata.",
      category: "finance",
      aliases: ["policy", "insurance"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        provider: { type: "string", required: false },
        policy_number: { type: "string", required: false },
        insured: { type: "string", required: false },
        effective_date: { type: "date", required: false },
        coverage: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        effective_date: { strategy: "last_write" },
      },
    },
  },

  invoice: {
    entity_type: "invoice",
    schema_version: "1.0",
    metadata: {
      label: "Invoice",
      description: "Money owed to you or vendors.",
      category: "finance",
      aliases: ["bill", "factura"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        invoice_number: { type: "string", required: true },
        invoice_date: { type: "date", required: true },
        amount_due: { type: "number", required: true },
        currency: { type: "string", required: true },
        date_due: { type: "date", required: false },
        vendor_name: { type: "string", required: false, preserveCase: true },
        customer_name: { type: "string", required: false, preserveCase: true },
        tax_amount: { type: "number", required: false },
        tax_rate: { type: "string", required: false },
        subtotal: { type: "number", required: false },
        items: { type: "array", required: false },
        description: { type: "string", required: false, preserveCase: true },
        notes: { type: "string", required: false, preserveCase: true },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      canonical_name_fields: ["invoice_number", "vendor_name", "invoice_date"],
      temporal_fields: [
        { field: "invoice_date", event_type: "InvoiceIssued" },
        { field: "date_due", event_type: "InvoiceDue" },
      ],
    },
    reducer_config: {
      merge_policies: {
        amount_due: { strategy: "last_write" },
        invoice_date: { strategy: "last_write" },
        date_due: { strategy: "last_write" },
      },
    },
  },

  receipt: {
    entity_type: "receipt",
    schema_version: "1.0",
    metadata: {
      label: "Receipt",
      description: "Proof-of-purchase documents.",
      category: "finance",
      aliases: ["proof_of_purchase", "recibo", "comprobante"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        merchant_name: { type: "string", required: true },
        amount_total: { type: "number", required: true },
        currency: { type: "string", required: true },
        date_purchased: { type: "date", required: true },
        receipt_number: { type: "string", required: false },
        payment_method: { type: "string", required: false },
        items: { type: "array", required: false },
        tax_amount: { type: "number", required: false },
        description: { type: "string", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
        // Optional fields matching common extraction output (transaction receipts, bank slips)
        merchant: { type: "string", required: false },
        amount: { type: "number", required: false },
        transaction_date: { type: "date", required: false },
        posting_date: { type: "date", required: false },
        category: { type: "string", required: false },
        account: { type: "string", required: false },
        status: { type: "string", required: false },
        transaction_id: { type: "string", required: false },
      },
      canonical_name_fields: ["merchant_name", "date_purchased", "amount_total"],
      temporal_fields: [
        { field: "date_purchased", event_type: "ReceiptIssued" },
        { field: "transaction_date", event_type: "TransactionDate" },
      ],
    },
    reducer_config: {
      merge_policies: {
        amount_total: { strategy: "last_write" },
        date_purchased: { strategy: "last_write" },
      },
    },
  },

  purchase: {
    entity_type: "purchase",
    schema_version: "1.0",
    metadata: {
      label: "Purchase",
      description: "Planned and completed purchase tracking.",
      category: "productivity",
      aliases: ["buy", "acquisition"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        item_name: { type: "string", required: true },
        status: { type: "string", required: true },
        location: { type: "string", required: false },
        priority: { type: "string", required: false },
        estimated_cost_usd: { type: "number", required: false },
        actual_cost_usd: { type: "number", required: false },
        currency: { type: "string", required: false },
        category: { type: "string", required: false },
        vendor: { type: "string", required: false },
        created_date: { type: "date", required: true },
        completed_date: { type: "date", required: false },
        notes: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        status: { strategy: "last_write" },
        actual_cost_usd: { strategy: "last_write" },
        completed_date: { strategy: "last_write" },
      },
    },
  },

  transfer: {
    entity_type: "transfer",
    schema_version: "1.0",
    metadata: {
      label: "Transfer",
      description: "Asset transfers between accounts.",
      category: "finance",
      aliases: ["asset_transfer", "account_transfer"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        name: { type: "string", required: true },
        status: { type: "string", required: false },
        amount: { type: "number", required: false },
        origin_account: { type: "string", required: true },
        destination_account: { type: "string", required: true },
        created_time: { type: "date", required: true },
        deposit_address: { type: "string", required: false },
        fees: { type: "number", required: false },
        transaction: { type: "string", required: false },
        transactions: { type: "string", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        status: { strategy: "last_write" },
        created_time: { strategy: "last_write" },
      },
    },
  },

  wallet: {
    entity_type: "wallet",
    schema_version: "1.0",
    metadata: {
      label: "Wallet",
      description: "Financial institutions and wallets containing accounts.",
      category: "finance",
      aliases: ["financial_institution", "institution"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        name: { type: "string", required: true },
        number: { type: "number", required: false },
        accounts: { type: "string", required: false },
        categories: { type: "string", required: false },
        url: { type: "string", required: false },
        urls: { type: "string", required: false },
        investments: { type: "string", required: false },
        status: { type: "string", required: true },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        status: { strategy: "last_write" },
        accounts: { strategy: "merge_array" },
      },
    },
  },

  tax_filing: {
    entity_type: "tax_filing",
    schema_version: "1.0",
    metadata: {
      label: "Tax Filing",
      description: "Tax filing tracking and status.",
      category: "finance",
      aliases: ["tax_return", "filing"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        name: { type: "string", required: true },
        jurisdiction: { type: "string", required: true },
        year: { type: "number", required: true },
        filings: { type: "string", required: false },
        status: { type: "string", required: true },
        companies: { type: "string", required: false },
        due_date: { type: "date", required: false },
        filed_date: { type: "date", required: false },
        amount_owed: { type: "number", required: false },
        amount_paid: { type: "number", required: false },
        currency: { type: "string", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        status: { strategy: "last_write" },
        filed_date: { strategy: "last_write" },
        amount_paid: { strategy: "last_write" },
      },
    },
  },

  order: {
    entity_type: "order",
    schema_version: "1.0",
    metadata: {
      label: "Order",
      description: "Trading orders and order tracking.",
      category: "finance",
      aliases: ["trade_order", "trading_order"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        name: { type: "string", required: true },
        status: { type: "string", required: false },
        accounts: { type: "string", required: false },
        amount: { type: "number", required: false },
        asset_type: { type: "string", required: false },
        order_type: { type: "string", required: true },
        price: { type: "number", required: false },
        url: { type: "string", required: false },
        date: { type: "date", required: true },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        status: { strategy: "last_write" },
        date: { strategy: "last_write" },
      },
    },
  },

  fixed_cost: {
    entity_type: "fixed_cost",
    schema_version: "1.0",
    metadata: {
      label: "Fixed Cost",
      description: "Recurring expenses and subscriptions.",
      category: "finance",
      aliases: ["recurring_expense", "subscription_cost"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        merchant: { type: "string", required: true },
        expense_name: { type: "string", required: true },
        expense_type: { type: "string", required: false },
        location: { type: "string", required: false },
        frequency_per_year: { type: "number", required: true },
        payment_amount_eur: { type: "number", required: false },
        payment_amount_usd: { type: "number", required: false },
        yearly_amount_eur: { type: "number", required: false },
        yearly_amount_usd: { type: "number", required: false },
        monthly_amount_eur: { type: "number", required: false },
        monthly_amount_usd: { type: "number", required: false },
        percent_fixed_expenses: { type: "number", required: false },
        percent_net_income: { type: "number", required: false },
        inflates: { type: "boolean", required: false },
        status: { type: "string", required: true },
        notes: { type: "string", required: false },
        renews: { type: "string", required: false },
        started: { type: "string", required: false },
        ended: { type: "string", required: false },
        payment_method: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        status: { strategy: "last_write" },
        payment_amount_usd: { strategy: "last_write" },
      },
    },
  },

  property: {
    entity_type: "property",
    schema_version: "1.0",
    metadata: {
      label: "Property",
      description: "Real estate property tracking.",
      category: "finance",
      aliases: ["real_estate", "asset_property"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        name: { type: "string", required: true },
        address: { type: "string", required: true },
        type: { type: "string", required: false },
        purchase_date: { type: "date", required: true },
        purchase_price: { type: "number", required: false },
        current_value: { type: "number", required: false },
        currency: { type: "string", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        current_value: { strategy: "last_write" },
        purchase_date: { strategy: "last_write" },
      },
    },
  },

  balance: {
    entity_type: "balance",
    schema_version: "1.0",
    metadata: {
      label: "Balance",
      description: "Account balance snapshots over time.",
      category: "finance",
      aliases: ["account_balance", "balance_snapshot"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        snapshot_date: { type: "date", required: true },
        account_id: { type: "string", required: true },
        account_type: { type: "string", required: false },
        account_name: { type: "string", required: false },
        balance_usd: { type: "number", required: true },
        balance_original: { type: "number", required: false },
        currency_original: { type: "string", required: false },
        provider: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      canonical_name_fields: ["snapshot_date", "account_id"],
      temporal_fields: [{ field: "snapshot_date", event_type: "BalanceSnapshot" }],
    },
    reducer_config: {
      merge_policies: {
        balance_usd: { strategy: "last_write" },
        snapshot_date: { strategy: "last_write" },
      },
    },
  },

  address: {
    entity_type: "address",
    schema_version: "1.0",
    metadata: {
      label: "Address",
      description: "Physical and mailing addresses.",
      category: "knowledge",
      aliases: ["location", "mailing_address"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        street: { type: "string", required: false },
        city: { type: "string", required: false },
        state: { type: "string", required: false },
        postal_code: { type: "string", required: false },
        country: { type: "string", required: false },
        address_line_1: { type: "string", required: false },
        address_line_2: { type: "string", required: false },
        formatted_address: { type: "string", required: false },
        latitude: { type: "number", required: false },
        longitude: { type: "number", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        formatted_address: { strategy: "highest_priority" },
        latitude: { strategy: "last_write" },
        longitude: { strategy: "last_write" },
      },
    },
  },

  company: {
    entity_type: "company",
    schema_version: "1.0",
    metadata: {
      label: "Company",
      description: "Company and organization records.",
      category: "knowledge",
      aliases: ["organization", "business"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        name: { type: "string", required: true, preserveCase: true },
        legal_name: { type: "string", required: false, preserveCase: true },
        website: { type: "string", required: false },
        email: { type: "string", required: false },
        phone: { type: "string", required: false },
        address: { type: "string", required: false, preserveCase: true },
        country: { type: "string", required: false, preserveCase: true },
        industry: { type: "string", required: false },
        type: { type: "string", required: false },
        description: { type: "string", required: false, preserveCase: true },
        notes: { type: "string", required: false, preserveCase: true },
        external_id: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: ordered identity precedence (R1 shape). Strong identifiers
      // first (external_id, website, email, legal_name), falling through
      // to `name` as the last resort so name-only observations still
      // resolve deterministically.
      canonical_name_fields: ["external_id", "website", "email", "legal_name", "name"],
    },
    reducer_config: {
      merge_policies: {
        name: { strategy: "highest_priority" },
        legal_name: { strategy: "highest_priority" },
        website: { strategy: "highest_priority" },
        email: { strategy: "highest_priority" },
      },
    },
  },

  person: {
    entity_type: "person",
    schema_version: "1.0",
    metadata: {
      label: "Person",
      description: "Individual person records.",
      category: "knowledge",
      aliases: ["individual", "contact_person"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        name: { type: "string", required: true, preserveCase: true },
        first_name: { type: "string", required: false, preserveCase: true },
        last_name: { type: "string", required: false, preserveCase: true },
        email: { type: "string", required: false },
        phone: { type: "string", required: false },
        organization: { type: "string", required: false, preserveCase: true },
        role: { type: "string", required: false },
        address: { type: "string", required: false, preserveCase: true },
        country: { type: "string", required: false, preserveCase: true },
        website: { type: "string", required: false },
        notes: { type: "string", required: false },
        external_id: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: ordered identity precedence. Email/phone/external_id are strong
      // single-field identifiers; first+last is a stable composite; `name`
      // is the final fallback so name-only observations still resolve.
      canonical_name_fields: [
        "email",
        "phone",
        "external_id",
        { composite: ["first_name", "last_name"] },
        "name",
      ],
    },
    reducer_config: {
      merge_policies: {
        name: { strategy: "highest_priority" },
        email: { strategy: "highest_priority" },
        phone: { strategy: "highest_priority" },
        external_id: { strategy: "highest_priority" },
      },
    },
  },

  location: {
    entity_type: "location",
    schema_version: "1.0",
    metadata: {
      label: "Location",
      description: "Geographic locations and coordinates.",
      category: "knowledge",
      aliases: ["place", "geographic_location"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        name: { type: "string", required: true },
        address: { type: "string", required: false },
        city: { type: "string", required: false },
        state: { type: "string", required: false },
        country: { type: "string", required: false },
        postal_code: { type: "string", required: false },
        latitude: { type: "number", required: false },
        longitude: { type: "number", required: false },
        type: { type: "string", required: false },
        description: { type: "string", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        name: { strategy: "highest_priority" },
        latitude: { strategy: "last_write" },
        longitude: { strategy: "last_write" },
      },
    },
  },

  conversation: {
    entity_type: "conversation",
    schema_version: "1.3",
    metadata: {
      label: "Conversation",
      description: "Chat conversation container entity.",
      category: "knowledge",
      aliases: ["chat_conversation", "thread"],
      guest_access_policy: "submitter_scoped",
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        // v1.2: caller-supplied stable identifier linking all turns in this
        // conversation. Declared as the primary canonical_name_fields rule so
        // distinct sessions never heuristically merge via `title`. See
        // docs/foundation/entity_resolution.md and
        // .cursor/plans/conversation_entity_collision_fix_aef8ba0d.plan.md.
        conversation_id: { type: "string", required: false },
        title: { type: "string", required: false, preserveCase: true },
        // Phase 1: identifies the participant topology of the conversation so
        // downstream views can distinguish human<->agent chats from
        // agent<->agent (A2A) or multi-party threads. Optional; defaults to
        // "human_agent" when omitted.
        thread_kind: { type: "string", required: false },
        client_name: { type: "string", required: false },
        harness: { type: "string", required: false },
        workspace_kind: { type: "string", required: false },
        // Stable repository label plus optional local checkout path. Keep the
        // absolute path as context only; it is intentionally excluded from
        // canonical_name_fields because paths move and can include usernames.
        repository_name: { type: "string", required: false },
        repository_root: { type: "string", required: false },
        repository_remote: { type: "string", required: false },
        scope_summary: { type: "string", required: false, preserveCase: true },
      },
      // v1.2+: session-scoped identity via caller-supplied `conversation_id`.
      // When absent, resolution falls through to the heuristic path; the
      // schema-level `name_collision_policy: reject` (R2) then converts that
      // heuristic match into ERR_STORE_RESOLUTION_FAILED instead of silently
      // collapsing unrelated sessions by `title`.
      canonical_name_fields: ["conversation_id"],
      name_collision_policy: "reject",
    },
    reducer_config: {
      merge_policies: {
        title: { strategy: "highest_priority", tie_breaker: "source_priority" },
        thread_kind: { strategy: "last_write" },
        client_name: { strategy: "last_write" },
        harness: { strategy: "last_write" },
        workspace_kind: { strategy: "last_write" },
        repository_name: { strategy: "last_write" },
        repository_root: { strategy: "last_write" },
        repository_remote: { strategy: "last_write" },
        scope_summary: { strategy: "last_write" },
      },
    },
  },

  conversation_message: {
    entity_type: "conversation_message",
    schema_version: "1.3",
    metadata: {
      label: "Chat Message",
      description:
        "One turn in a conversation. Sender may be a human user, an assistant, another agent, a system, or a tool; see sender_kind. Phase 2 (2026-04) renamed the canonical entity_type from `agent_message`; `agent_message` remains an alias for backward compatibility.",
      category: "knowledge",
      aliases: ["agent_message", "chat_message"],
      guest_access_policy: "submitter_scoped",
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        role: { type: "string", required: true },
        content: { type: "string", required: true, preserveCase: true },
        turn_key: { type: "string", required: false },
        // Phase 1: authoritative sender category. One of
        // "user" | "assistant" | "agent" | "system" | "tool". New writers set
        // this alongside `role` (mirror for user/assistant, richer values for
        // A2A and tool turns). Reads should prefer sender_kind and fall back
        // to role when missing on legacy rows.
        sender_kind: { type: "string", required: false },
        // Phase 1: stable identifier of the sending agent. Derived from
        // AAuth thumbprint / clientInfo / agent_sub where available; see
        // docs/subsystems/agent_attribution_integration.md.
        sender_agent_id: { type: "string", required: false },
        // Phase 1: stable identifier of the recipient agent for A2A traffic.
        recipient_agent_id: { type: "string", required: false },
        // v1.3: optional reporter environment for messages on issue threads.
        // Soft requirement (server warns rather than rejects); agent
        // instructions require populating these when the message is
        // authored by a user/assistant on an `issue`'s conversation so
        // operators can correlate debugging steps with the build the
        // reporter is testing against.
        reporter_git_sha: { type: "string", required: false },
        reporter_git_ref: { type: "string", required: false },
        reporter_channel: { type: "string", required: false },
        reporter_app_version: { type: "string", required: false },
      },
      // v1.2: turn-scoped identity via caller-supplied `turn_key`. Falls
      // through to heuristic when missing; R2 `name_collision_policy: reject`
      // converts that to ERR_STORE_RESOLUTION_FAILED rather than a silent
      // merge across turns with identical content.
      canonical_name_fields: ["turn_key"],
      name_collision_policy: "reject",
    },
    reducer_config: {
      merge_policies: {
        role: { strategy: "last_write" },
        content: { strategy: "last_write" },
        turn_key: { strategy: "last_write" },
        sender_kind: { strategy: "last_write" },
        sender_agent_id: { strategy: "last_write" },
        recipient_agent_id: { strategy: "last_write" },
        reporter_git_sha: { strategy: "last_write" },
        reporter_git_ref: { strategy: "last_write" },
        reporter_channel: { strategy: "last_write" },
        reporter_app_version: { strategy: "last_write" },
      },
    },
  },

  relationship: {
    entity_type: "relationship",
    schema_version: "1.0",
    metadata: {
      label: "Relationship",
      description: "Relationships between entities.",
      category: "knowledge",
      aliases: ["connection", "link"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        source_entity_id: { type: "string", required: true },
        target_entity_id: { type: "string", required: true },
        relationship_type: { type: "string", required: true },
        description: { type: "string", required: false },
        started_date: { type: "date", required: false },
        ended_date: { type: "date", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        relationship_type: { strategy: "highest_priority" },
        started_date: { strategy: "last_write" },
        ended_date: { strategy: "last_write" },
      },
    },
  },

  task: {
    entity_type: "task",
    schema_version: "1.0",
    metadata: {
      label: "Task",
      description: "Action items with status.",
      category: "productivity",
      aliases: ["todo", "action_item"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        title: { type: "string", required: true, preserveCase: true },
        description: { type: "string", required: false, preserveCase: true },
        status: { type: "string", required: true },
        priority: { type: "string", required: false },
        assignee: { type: "string", required: false },
        project_id: { type: "string", required: false },
        due_date: { type: "date", required: false },
        completed_date: { type: "date", required: false },
        created_date: { type: "date", required: false },
        updated_date: { type: "date", required: false },
        created_at: {
          type: "date",
          required: false,
          converters: [
            {
              from: "number",
              to: "date",
              function: "timestamp_nanos_to_iso",
              deterministic: true,
            },
          ],
        },
        updated_at: {
          type: "date",
          required: false,
          converters: [
            {
              from: "number",
              to: "date",
              function: "timestamp_nanos_to_iso",
              deterministic: true,
            },
          ],
        },
        tags: { type: "string", required: false },
        notes: { type: "string", required: false, preserveCase: true },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      temporal_fields: [
        { field: "due_date", event_type: "TaskDue" },
        { field: "completed_date", event_type: "TaskCompleted" },
      ],
      // R2: tasks are usually uniquely identified by title within a project
      // or by explicit external_id. Fall back to title alone so that
      // title-only observations still resolve deterministically.
      canonical_name_fields: [
        { composite: ["project_id", "title"] },
        { composite: ["title", "due_date"] },
        "title",
      ],
    },
    reducer_config: {
      merge_policies: {
        status: { strategy: "last_write" },
        completed_date: { strategy: "last_write" },
        notes: { strategy: "highest_priority", tie_breaker: "source_priority" },
        description: { strategy: "highest_priority", tie_breaker: "source_priority" },
        updated_date: { strategy: "last_write" },
        created_at: { strategy: "last_write" },
        updated_at: { strategy: "last_write" },
      },
    },
  },

  project: {
    entity_type: "project",
    schema_version: "1.0",
    metadata: {
      label: "Project",
      description: "Multi-step initiatives.",
      category: "productivity",
      aliases: ["initiative", "program"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        name: { type: "string", required: true },
        description: { type: "string", required: false },
        status: { type: "string", required: true },
        owner: { type: "string", required: false },
        start_date: { type: "date", required: false },
        end_date: { type: "date", required: false },
        created_date: { type: "date", required: false },
        updated_date: { type: "date", required: false },
        tags: { type: "string", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: project name is the natural identifier.
      canonical_name_fields: ["name"],
    },
    reducer_config: {
      merge_policies: {
        status: { strategy: "last_write" },
        end_date: { strategy: "last_write" },
        updated_date: { strategy: "last_write" },
      },
    },
  },

  goal: {
    entity_type: "goal",
    schema_version: "1.0",
    metadata: {
      label: "Goal",
      description: "Target metrics and OKRs to achieve.",
      category: "productivity",
      aliases: ["target", "okr", "key_result"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        title: { type: "string", required: true },
        description: { type: "string", required: false },
        status: { type: "string", required: true },
        target_date: { type: "date", required: false },
        completed_date: { type: "date", required: false },
        created_date: { type: "date", required: false },
        updated_date: { type: "date", required: false },
        metrics: { type: "string", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        status: { strategy: "last_write" },
        completed_date: { strategy: "last_write" },
        updated_date: { strategy: "last_write" },
      },
    },
  },

  email: {
    entity_type: "email",
    schema_version: "1.0",
    metadata: {
      label: "Email",
      description: "Email-specific messages with threads and subjects.",
      category: "knowledge",
      aliases: ["email_message", "email_thread"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        subject: { type: "string", required: false },
        from: { type: "string", required: true },
        to: { type: "string", required: false },
        cc: { type: "string", required: false },
        bcc: { type: "string", required: false },
        body: { type: "string", required: false },
        sent_at: { type: "date", required: true },
        received_at: { type: "date", required: false },
        thread_id: { type: "string", required: false },
        message_id: { type: "string", required: false },
        status: { type: "string", required: false },
        tags: { type: "string", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: RFC 5322 message_id is the canonical strong identifier when
      // present. Fall back to (from, subject, sent_at) which uniquely
      // identifies the message within most mailboxes.
      canonical_name_fields: ["message_id", { composite: ["from", "subject", "sent_at"] }],
    },
    reducer_config: {
      merge_policies: {
        sent_at: { strategy: "last_write" },
        received_at: { strategy: "last_write" },
        body: { strategy: "highest_priority" },
      },
    },
  },

  message: {
    entity_type: "message",
    schema_version: "1.0",
    metadata: {
      label: "Message",
      description: "Generic messages (DMs, SMS, chat) without email-specific structure.",
      category: "knowledge",
      aliases: ["dm", "sms", "chat_message"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        subject: { type: "string", required: false, preserveCase: true },
        sender: { type: "string", required: true },
        recipient: { type: "string", required: false },
        body: { type: "string", required: false, preserveCase: true },
        sent_at: { type: "date", required: true },
        thread_id: { type: "string", required: false },
        message_type: { type: "string", required: false },
        platform: { type: "string", required: false },
        status: { type: "string", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: thread_id+sent_at disambiguates within a thread; fall back to
      // sender+sent_at which uniquely identifies most single-channel chats.
      canonical_name_fields: [
        { composite: ["thread_id", "sender", "sent_at"] },
        { composite: ["sender", "sent_at"] },
      ],
    },
    reducer_config: {
      merge_policies: {
        sent_at: { strategy: "last_write" },
        body: { strategy: "highest_priority" },
      },
    },
  },

  note: {
    entity_type: "note",
    schema_version: "1.0",
    metadata: {
      label: "Note",
      description: "Free-form text, journals, scratchpads.",
      category: "productivity",
      aliases: ["journal", "memo", "nota"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        title: { type: "string", required: false, preserveCase: true },
        content: { type: "string", required: true, preserveCase: true },
        tags: { type: "string", required: false },
        source: { type: "string", required: false },
        created_date: { type: "date", required: false },
        updated_date: { type: "date", required: false },
        summary: { type: "string", required: false, preserveCase: true },
        notes: { type: "string", required: false, preserveCase: true },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: title is a natural identifier when present; content is the
      // fallback so title-less scratchpads still resolve deterministically.
      canonical_name_fields: ["title", { composite: ["source", "created_date"] }],
    },
    reducer_config: {
      merge_policies: {
        content: { strategy: "highest_priority" },
        updated_date: { strategy: "last_write" },
      },
    },
  },

  dataset: {
    entity_type: "dataset",
    schema_version: "1.0",
    metadata: {
      label: "Dataset",
      description: "Tabular datasets produced from CSV or spreadsheet uploads.",
      category: "knowledge",
      primaryProperties: ["row_count", "source_file", "summary"],
      aliases: ["csv", "spreadsheet", "table", "dataset_file"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        row_count: { type: "number", required: false },
        source_file: { type: "string", required: false },
        summary: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {},
    },
  },

  dataset_row: {
    entity_type: "dataset_row",
    schema_version: "1.0",
    metadata: {
      label: "Dataset Row",
      description: "Single row derived from a dataset upload.",
      category: "knowledge",
      primaryProperties: ["csv_origin", "row_index", "source_file"],
      aliases: ["table_row", "csv_row"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        csv_origin: { type: "string", required: false },
        row_index: { type: "number", required: false },
        source_file: { type: "string", required: false },
      },
      canonical_name_fields: ["source_file", "row_index"],
    },
    reducer_config: {
      merge_policies: {},
    },
  },

  event: {
    entity_type: "event",
    schema_version: "1.0",
    metadata: {
      label: "Event",
      description: "Meetings, appointments, scheduled interactions.",
      category: "productivity",
      aliases: ["meeting", "appointment", "calendar_event", "recurring_event"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        title: { type: "string", required: true },
        description: { type: "string", required: false },
        start_time: { type: "date", required: true },
        end_time: { type: "date", required: false },
        location: { type: "string", required: false },
        attendees: { type: "string", required: false },
        event_type: { type: "string", required: false },
        status: { type: "string", required: false },
        created_date: { type: "date", required: false },
        updated_date: { type: "date", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      temporal_fields: [
        { field: "start_time", event_type: "EventStart" },
        { field: "end_time", event_type: "EventEnd" },
      ],
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        start_time: { strategy: "last_write" },
        end_time: { strategy: "last_write" },
        updated_date: { strategy: "last_write" },
      },
    },
  },

  exercise: {
    entity_type: "exercise",
    schema_version: "1.0",
    metadata: {
      label: "Exercise",
      description: "Individual exercise activities or training sets (atomic unit).",
      category: "health",
      aliases: ["workout", "training_session", "activity"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        name: { type: "string", required: true },
        exercise_type: { type: "string", required: false },
        date: { type: "date", required: true },
        duration_minutes: { type: "number", required: false },
        sets: { type: "number", required: false },
        repetitions: { type: "number", required: false },
        weight: { type: "number", required: false },
        distance: { type: "number", required: false },
        calories: { type: "number", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        date: { strategy: "last_write" },
        duration_minutes: { strategy: "last_write" },
      },
    },
  },

  meal: {
    entity_type: "meal",
    schema_version: "1.0",
    metadata: {
      label: "Meal",
      description: "Food logs and nutrition captures.",
      category: "health",
      aliases: ["food_log", "nutrition"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        name: { type: "string", required: true },
        meal_type: { type: "string", required: false },
        date: { type: "date", required: true },
        calories: { type: "number", required: false },
        protein: { type: "number", required: false },
        carbs: { type: "number", required: false },
        fat: { type: "number", required: false },
        foods: { type: "string", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        date: { strategy: "last_write" },
        calories: { strategy: "last_write" },
      },
    },
  },

  transaction: {
    entity_type: "transaction",
    schema_version: "1.0",
    metadata: {
      label: "Transaction",
      description: "Individual debits/credits pulled from Plaid or uploads.",
      category: "finance",
      aliases: ["transactions", "txn", "expense", "purchase", "payment", "transaccion"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        amount: { type: "number", required: false },
        amount_original: { type: "number", required: false },
        currency: { type: "string", required: false },
        date: { type: "date", required: false },
        posting_date: { type: "date", required: false },
        merchant_name: { type: "string", required: false },
        status: { type: "string", required: false },
        account_id: { type: "string", required: false },
        category: { type: "string", required: false },
        bank_provider: { type: "string", required: false },
      },
      canonical_name_fields: ["posting_date", "category", "amount_original", "bank_provider"],
      temporal_fields: [
        { field: "posting_date", event_type: "TransactionPosted" },
        { field: "date", event_type: "TransactionDate" },
      ],
    },
    reducer_config: {
      merge_policies: {
        posting_date: { strategy: "last_write" },
        status: { strategy: "last_write" },
        category: { strategy: "last_write" },
      },
    },
  },

  contact: {
    entity_type: "contact",
    schema_version: "1.0",
    metadata: {
      label: "Contact",
      description: "People and organization records.",
      category: "knowledge",
      aliases: ["person", "lead"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        name: { type: "string", required: false },
        email: { type: "string", required: false },
        phone: { type: "string", required: false },
        organization: { type: "string", required: false },
        role: { type: "string", required: false },
        type: { type: "string", required: false },
        contact_type: { type: "string", required: false },
        category: { type: "string", required: false },
        platform: { type: "string", required: false },
        address: { type: "string", required: false },
        country: { type: "string", required: false },
        website: { type: "string", required: false },
        notes: { type: "string", required: false },
        contact_id: { type: "string", required: false },
        external_id: { type: "string", required: false },
        first_contact_date: { type: "date", required: false },
        last_contact_date: { type: "date", required: false },
        created_date: { type: "date", required: false },
        updated_date: { type: "date", required: false },
      },
      // R2: ordered identity precedence. Contact records arrive with varied
      // identifiers depending on source (CRM export, email signature, chat
      // mention), so each strong identifier is a single-field rule.
      canonical_name_fields: ["email", "phone", "external_id", "contact_id", "name"],
    },
    reducer_config: {
      merge_policies: {
        name: { strategy: "highest_priority" },
        email: { strategy: "highest_priority" },
        phone: { strategy: "highest_priority" },
        external_id: { strategy: "highest_priority" },
        last_contact_date: { strategy: "last_write" },
        updated_date: { strategy: "last_write" },
      },
    },
  },

  contract: {
    entity_type: "contract",
    schema_version: "1.0",
    metadata: {
      label: "Contract",
      description: "Legal contracts and agreements.",
      category: "finance",
      aliases: ["agreement", "legal_document", "contrato"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        name: { type: "string", required: false },
        contract_number: { type: "string", required: false },
        parties: { type: "string", required: false },
        effective_date: { type: "date", required: false },
        expiration_date: { type: "date", required: false },
        signed_date: { type: "date", required: false },
        status: { type: "string", required: false },
        companies: { type: "string", required: false },
        files: { type: "string", required: false },
        type: { type: "string", required: false },
        notes: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        signed_date: { strategy: "last_write" },
        effective_date: { strategy: "last_write" },
        expiration_date: { strategy: "last_write" },
        status: { strategy: "last_write" },
        files: { strategy: "merge_array" },
      },
    },
  },

  account: {
    entity_type: "account",
    schema_version: "1.0",
    metadata: {
      label: "Account",
      description: "Financial account snapshots (bank, brokerage, wallet).",
      category: "finance",
      aliases: ["bank_account", "wallet", "ledger_account"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        external_id: { type: "string", required: false },
        institution: { type: "string", required: false },
        currency: { type: "string", required: false },
        balance: { type: "number", required: false },
        wallet: { type: "string", required: false },
        wallet_name: { type: "string", required: false },
        number: { type: "string", required: false },
        categories: { type: "string", required: false },
        denomination: { type: "string", required: false },
        status: { type: "string", required: false },
        notes: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        status: { strategy: "last_write" },
        categories: { strategy: "merge_array" },
      },
    },
  },

  belief: {
    entity_type: "belief",
    schema_version: "1.0",
    metadata: {
      label: "Belief",
      description: "Personal beliefs and assumptions tracking.",
      category: "knowledge",
      aliases: ["assumption", "conviction"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        belief_id: { type: "string", required: false },
        name: { type: "string", required: true },
        categories: { type: "string", required: false },
        confidence_level: { type: "string", required: false },
        asset_types: { type: "string", required: false },
        date: { type: "date", required: false },
        events: { type: "string", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        name: { strategy: "last_write" },
        confidence_level: { strategy: "last_write" },
        categories: { strategy: "merge_array" },
      },
    },
  },

  habit: {
    entity_type: "habit",
    schema_version: "1.0",
    metadata: {
      label: "Habit",
      description: "Habit tracking for recurring behaviors and daily practices.",
      category: "health",
      aliases: ["daily_habit", "practice", "behavior"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        habit_id: { type: "string", required: false },
        name: { type: "string", required: true },
        description: { type: "string", required: false },
        target_frequency: { type: "string", required: false },
        current_streak: { type: "number", required: false },
        longest_streak: { type: "number", required: false },
        status: { type: "string", required: false },
        start_date: { type: "date", required: false },
        priority: { type: "string", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        current_streak: { strategy: "last_write" },
        longest_streak: { strategy: "last_write" },
        status: { strategy: "last_write" },
      },
    },
  },

  workout: {
    entity_type: "workout",
    schema_version: "1.0",
    metadata: {
      label: "Workout",
      description: "Complete workout routines combining multiple exercises.",
      category: "health",
      aliases: ["training_routine", "exercise_plan", "routine"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        workout_id: { type: "string", required: false },
        name: { type: "string", required: true },
        exercises: { type: "string", required: false },
        type: { type: "string", required: false },
        circuits: { type: "string", required: false },
        primary_muscles: { type: "string", required: false },
        secondary_muscles: { type: "string", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        name: { strategy: "last_write" },
        exercises: { strategy: "merge_array" },
      },
    },
  },

  outcome: {
    entity_type: "outcome",
    schema_version: "1.0",
    metadata: {
      label: "Outcome",
      description: "Achieved results and deliverables organized by strategic goals.",
      category: "productivity",
      aliases: ["objective", "result", "deliverable"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        outcome_id: { type: "string", required: false },
        outcome_name: { type: "string", required: true },
        outcome_type: { type: "string", required: false },
        goal_id: { type: "string", required: false },
        goal_category: { type: "string", required: false },
        domain: { type: "string", required: false },
        status: { type: "string", required: false },
        target_date: { type: "date", required: false },
        description: { type: "string", required: false },
        notes: { type: "string", required: false },
        created_at: { type: "date", required: false },
        updated_at: { type: "date", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        status: { strategy: "last_write" },
        updated_at: { strategy: "last_write" },
      },
    },
  },

  emotion: {
    entity_type: "emotion",
    schema_version: "1.0",
    metadata: {
      label: "Emotion",
      description: "Emotion tracking and categorization.",
      category: "health",
      aliases: ["feeling", "mood"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        emotion_id: { type: "string", required: false },
        name: { type: "string", required: true },
        category: { type: "string", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        name: { strategy: "last_write" },
      },
    },
  },

  domain: {
    entity_type: "domain",
    schema_version: "1.0",
    metadata: {
      label: "Domain",
      description: "Domain name registrations and management.",
      category: "knowledge",
      aliases: ["domain_name", "website_domain"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        domain_id: { type: "string", required: false },
        name: { type: "string", required: true },
        companies: { type: "string", required: false },
        registrar: { type: "string", required: false },
        expiry_date: { type: "date", required: false },
        status: { type: "string", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        status: { strategy: "last_write" },
        expiry_date: { strategy: "last_write" },
      },
    },
  },

  research: {
    entity_type: "research",
    schema_version: "1.0",
    metadata: {
      label: "Research",
      description:
        "Research summaries and notes from articles, podcasts, papers, and other sources.",
      category: "knowledge",
      aliases: ["research_note", "study", "article_summary"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        research_id: { type: "string", required: false },
        title: { type: "string", required: true },
        source_url: { type: "string", required: false },
        source_type: { type: "string", required: false },
        author: { type: "string", required: false },
        publication_date: { type: "date", required: false },
        summary: { type: "string", required: false },
        topics: { type: "string", required: false },
        created_date: { type: "date", required: false },
        updated_date: { type: "date", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        summary: { strategy: "last_write" },
        updated_date: { strategy: "last_write" },
      },
    },
  },

  argument: {
    entity_type: "argument",
    schema_version: "1.0",
    metadata: {
      label: "Argument",
      description: "Relationship arguments tracking (restricted).",
      category: "knowledge",
      aliases: ["dispute", "disagreement"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        argument_id: { type: "string", required: false },
        name: { type: "string", required: true },
        date: { type: "date", required: false },
        category: { type: "string", required: false },
        resolution: { type: "string", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        resolution: { strategy: "last_write" },
      },
    },
  },

  strategy: {
    entity_type: "strategy",
    schema_version: "1.0",
    metadata: {
      label: "Strategy",
      description: "Strategic documents and tactics from markdown files.",
      category: "productivity",
      aliases: ["strategic_document", "tactic"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        strategy_id: { type: "string", required: true },
        title: { type: "string", required: true },
        content: { type: "string", required: true },
        category: { type: "string", required: true },
        domain: { type: "string", required: true },
        file_path: { type: "string", required: true },
        status: { type: "string", required: false },
        last_updated_date: { type: "date", required: false },
        created_date: { type: "date", required: false },
        import_date: { type: "date", required: true },
        import_source_file: { type: "string", required: true },
        notes: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        content: { strategy: "last_write" },
        status: { strategy: "last_write" },
        last_updated_date: { strategy: "last_write" },
      },
    },
  },

  process: {
    entity_type: "process",
    schema_version: "1.0",
    metadata: {
      label: "Process",
      description: "Process documents and analysis records.",
      category: "productivity",
      aliases: ["procedure", "workflow"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        process_id: { type: "string", required: false },
        title: { type: "string", required: true },
        content: { type: "string", required: false },
        process_type: { type: "string", required: false },
        sources: { type: "string", required: false },
        created_date: { type: "date", required: false },
        created_datetime: { type: "date", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        content: { strategy: "last_write" },
      },
    },
  },

  task_attachment: {
    entity_type: "task_attachment",
    schema_version: "1.0",
    metadata: {
      label: "Task Attachment",
      description: "File attachments on tasks.",
      category: "productivity",
      aliases: ["task_file", "attachment"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        attachment_id: { type: "string", required: false },
        task_id: { type: "string", required: false },
        asana_task_gid: { type: "string", required: false },
        asana_attachment_gid: { type: "string", required: false },
        asana_workspace: { type: "string", required: false },
        name: { type: "string", required: true },
        resource_subtype: { type: "string", required: false },
        content_type: { type: "string", required: false },
        size_bytes: { type: "number", required: false },
        local_path: { type: "string", required: false },
        download_url: { type: "string", required: false },
        created_at: { type: "date", required: false },
        imported_at: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        local_path: { strategy: "last_write" },
      },
    },
  },

  task_comment: {
    entity_type: "task_comment",
    schema_version: "1.0",
    metadata: {
      label: "Task Comment",
      description: "Comments on tasks.",
      category: "productivity",
      aliases: ["comment", "task_note"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        comment_id: { type: "string", required: false },
        task_id: { type: "string", required: false },
        asana_task_gid: { type: "string", required: false },
        asana_story_gid: { type: "string", required: false },
        asana_workspace: { type: "string", required: false },
        author_name: { type: "string", required: false },
        author_gid: { type: "string", required: false },
        text: { type: "string", required: true },
        comment_html: { type: "string", required: false },
        comment_html_remote: { type: "string", required: false },
        created_at: { type: "date", required: false },
        imported_at: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        text: { strategy: "last_write" },
      },
    },
  },

  task_dependency: {
    entity_type: "task_dependency",
    schema_version: "1.0",
    metadata: {
      label: "Task Dependency",
      description: "Task blocking relationships.",
      category: "productivity",
      aliases: ["dependency", "task_blocker"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        dependency_id: { type: "string", required: false },
        task_id: { type: "string", required: false },
        asana_task_gid: { type: "string", required: false },
        asana_workspace: { type: "string", required: false },
        predecessor_task_id: { type: "string", required: false },
        predecessor_asana_gid: { type: "string", required: false },
        successor_task_id: { type: "string", required: false },
        successor_asana_gid: { type: "string", required: false },
        created_at: { type: "date", required: false },
        imported_at: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {},
    },
  },

  task_story: {
    entity_type: "task_story",
    schema_version: "1.0",
    metadata: {
      label: "Task Story",
      description: "Activity log entries for tasks.",
      category: "productivity",
      aliases: ["story", "activity_log"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        story_id: { type: "string", required: false },
        task_id: { type: "string", required: false },
        asana_task_gid: { type: "string", required: false },
        asana_story_gid: { type: "string", required: false },
        asana_workspace: { type: "string", required: false },
        story_type: { type: "string", required: false },
        author_name: { type: "string", required: false },
        author_gid: { type: "string", required: false },
        text: { type: "string", required: false },
        story_html: { type: "string", required: false },
        story_html_remote: { type: "string", required: false },
        created_at: { type: "date", required: false },
        imported_at: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {},
    },
  },

  habit_completion: {
    entity_type: "habit_completion",
    schema_version: "1.0",
    metadata: {
      label: "Habit Completion",
      description: "Daily completion tracking for habits.",
      category: "health",
      aliases: ["completion", "habit_log"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        completion_id: { type: "string", required: false },
        habit_id: { type: "string", required: true },
        completion_date: { type: "date", required: true },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {},
    },
  },

  habit_objective: {
    entity_type: "habit_objective",
    schema_version: "1.0",
    metadata: {
      label: "Habit Objective",
      description: "Target benefits and objectives for habits.",
      category: "health",
      aliases: ["habit_goal", "habit_target"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        objective_id: { type: "string", required: false },
        habit_id: { type: "string", required: true },
        objective: { type: "string", required: true },
        objective_type: { type: "string", required: false },
        priority: { type: "string", required: false },
        notes: { type: "string", required: false },
        import_date: { type: "date", required: false },
        import_source_file: { type: "string", required: false },
      },
      // R2: bookkeeping/auxiliary schema with no inherent strong identifier;
      // declare explicit opt-out so resolution falls through to the heuristic
      // path. See docs/foundation/schema_agnostic_design_rules.md.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        priority: { strategy: "last_write" },
      },
    },
  },

  // ---------------------------------------------------------------------
  // Fleet-general agent runtime schemas (v0.1)
  //
  // These six singular, unprefixed schemas capture the LCD of the
  // `task -> attempt -> outcome -> artifact` chain that autonomous agent
  // fleets (AIBTC Lumen, LangGraph, OpenClaw, homegrown loops) share.
  // They intentionally cover only the lowest common denominator; fleet-
  // specific extensions (AIBTC `skills_loaded`, LangGraph node ids,
  // custom-adapter metadata) land later as minor-bump optional fields or
  // sibling `*_extension` entity types linked via REFERS_TO.
  //
  // Cross-cutting:
  //   * Agent identity is NOT a schema field — it lives in provenance
  //     via AAuth (`agent_sub` / `agent_public_key`) with OAuth /
  //     bearer / `clientInfo` as the fallback tier. See
  //     docs/subsystems/sources.md.
  //   * Every write should carry an `observation_source` classification
  //     (sensor | workflow_state | llm_summary | human | import). The
  //     reducer uses it as a tie-break after `source_priority`; see
  //     src/shared/action_schemas.ts and src/reducers/observation_reducer.ts.
  //   * Schema version is pinned at `0.1.0` so the next fleet-validated
  //     promotion is a standard minor bump.
  // ---------------------------------------------------------------------

  agent_task: {
    entity_type: "agent_task",
    schema_version: "0.1.0",
    metadata: {
      label: "Agent task",
      description:
        "Fleet-general unit of agent work dispatched to a runtime (agent-runtime, LangGraph, OpenClaw, custom). LCD v0.1; fleet-specific fields ride a minor bump.",
      category: "agent_runtime",
      aliases: ["agent_job", "runtime_task"],
    },
    schema_definition: {
      fields: {
        task_id: { type: "string", required: true },
        parent_task_id: { type: "string", required: false },
        status: { type: "string", required: false },
        description: { type: "string", required: false, preserveCase: true },
        started_at: { type: "date", required: false },
        completed_at: { type: "date", required: false },
        source: { type: "string", required: false },
        priority: { type: "string", required: false },
        input_summary: { type: "string", required: false, preserveCase: true },
      },
      canonical_name_fields: ["task_id"],
      temporal_fields: [
        { field: "started_at", event_type: "AgentTaskStarted" },
        { field: "completed_at", event_type: "AgentTaskCompleted" },
      ],
    },
    reducer_config: {
      merge_policies: {
        status: { strategy: "last_write" },
        description: { strategy: "highest_priority", tie_breaker: "source_priority" },
        started_at: { strategy: "last_write" },
        completed_at: { strategy: "last_write" },
        source: { strategy: "last_write" },
        priority: { strategy: "last_write" },
        input_summary: {
          strategy: "highest_priority",
          tie_breaker: "source_priority",
        },
      },
    },
  },

  agent_attempt: {
    entity_type: "agent_attempt",
    schema_version: "0.1.0",
    metadata: {
      label: "Agent attempt",
      description:
        "A single execution attempt of an agent_task on a named runtime. Captures lifecycle + cost/timing. Fleet-general LCD.",
      category: "agent_runtime",
      aliases: ["agent_run", "agent_execution"],
    },
    schema_definition: {
      fields: {
        attempt_id: { type: "string", required: true },
        task_id: { type: "string", required: true },
        runtime: { type: "string", required: false },
        status: { type: "string", required: false },
        started_at: { type: "date", required: false },
        completed_at: { type: "date", required: false },
        tokens: { type: "number", required: false },
        cost: { type: "number", required: false },
        duration_ms: { type: "number", required: false },
        adapter: { type: "string", required: false },
      },
      canonical_name_fields: ["attempt_id"],
      temporal_fields: [
        { field: "started_at", event_type: "AgentAttemptStarted" },
        { field: "completed_at", event_type: "AgentAttemptCompleted" },
      ],
    },
    reducer_config: {
      merge_policies: {
        status: { strategy: "last_write" },
        runtime: { strategy: "last_write" },
        started_at: { strategy: "last_write" },
        completed_at: { strategy: "last_write" },
        tokens: { strategy: "last_write" },
        cost: { strategy: "last_write" },
        duration_ms: { strategy: "last_write" },
        adapter: { strategy: "last_write" },
      },
    },
  },

  agent_outcome: {
    entity_type: "agent_outcome",
    schema_version: "0.1.0",
    metadata: {
      label: "Agent outcome",
      description:
        "Terminal result of an agent_attempt (success/failure + summary + evidence refs). Fleet-general LCD.",
      category: "agent_runtime",
      aliases: ["agent_result"],
    },
    schema_definition: {
      fields: {
        outcome_id: { type: "string", required: true },
        attempt_id: { type: "string", required: true },
        success: { type: "boolean", required: false },
        summary: { type: "string", required: false, preserveCase: true },
        error: { type: "string", required: false, preserveCase: true },
        evidence_summary: {
          type: "string",
          required: false,
          preserveCase: true,
        },
        artifact_refs: { type: "object", required: false },
      },
      canonical_name_fields: ["outcome_id"],
    },
    reducer_config: {
      merge_policies: {
        success: { strategy: "last_write" },
        summary: { strategy: "highest_priority", tie_breaker: "source_priority" },
        error: { strategy: "highest_priority", tie_breaker: "source_priority" },
        evidence_summary: {
          strategy: "highest_priority",
          tie_breaker: "source_priority",
        },
        artifact_refs: { strategy: "last_write" },
      },
    },
  },

  agent_artifact: {
    entity_type: "agent_artifact",
    schema_version: "0.1.0",
    metadata: {
      label: "Agent artifact",
      description:
        "A concrete artifact emitted by an agent_outcome (file, message, tool output, text, image). Linked via outcome_id.",
      category: "agent_runtime",
      aliases: ["agent_output"],
    },
    schema_definition: {
      fields: {
        artifact_id: { type: "string", required: true },
        outcome_id: { type: "string", required: true },
        kind: { type: "string", required: false },
        uri: { type: "string", required: false },
        hash: { type: "string", required: false },
        size_bytes: { type: "number", required: false },
        mime_type: { type: "string", required: false },
      },
      canonical_name_fields: ["artifact_id"],
    },
    reducer_config: {
      merge_policies: {
        kind: { strategy: "last_write" },
        uri: { strategy: "last_write" },
        hash: { strategy: "last_write" },
        size_bytes: { strategy: "last_write" },
        mime_type: { strategy: "last_write" },
      },
    },
  },

  agent_sensor_signal: {
    entity_type: "agent_sensor_signal",
    schema_version: "0.1.0",
    metadata: {
      label: "Agent sensor signal",
      description:
        "Ground-truth emission from an agent sensor (tool event, telemetry, env probe). Use with observation_source=sensor so the reducer can rank sensor reality over LLM summaries.",
      category: "agent_runtime",
      aliases: ["sensor_emission", "agent_signal"],
    },
    schema_definition: {
      fields: {
        sensor_id: { type: "string", required: true },
        signal_kind: { type: "string", required: false },
        payload_summary: {
          type: "string",
          required: false,
          preserveCase: true,
        },
        emitted_at: { type: "date", required: false },
        payload: { type: "object", required: false },
      },
      canonical_name_fields: [{ composite: ["sensor_id", "emitted_at"] }, "sensor_id"],
      temporal_fields: [{ field: "emitted_at", event_type: "AgentSensorEmitted" }],
    },
    reducer_config: {
      merge_policies: {
        signal_kind: { strategy: "last_write" },
        payload_summary: {
          strategy: "highest_priority",
          tie_breaker: "source_priority",
        },
        emitted_at: { strategy: "last_write" },
        payload: { strategy: "last_write" },
      },
      // Sensor emissions are the ground-truth baseline for this schema;
      // keep the registry-wide default order (sensor > workflow_state >
      // llm_summary > human > import) explicit so future edits don't
      // accidentally demote sensor writes below summaries.
      observation_source_priority: ["sensor", "workflow_state", "llm_summary", "human", "import"],
    },
  },

  agent_cycle_summary: {
    entity_type: "agent_cycle_summary",
    schema_version: "0.1.0",
    metadata: {
      label: "Agent cycle summary",
      description:
        "Roll-up of one fleet cycle (wall clock, tasks dispatched, cost, optional external-state hash for drift reconciliation).",
      category: "agent_runtime",
      aliases: ["agent_cycle"],
    },
    schema_definition: {
      fields: {
        cycle_id: { type: "string", required: true },
        tasks_dispatched: { type: "number", required: false },
        started_at: { type: "date", required: false },
        ended_at: { type: "date", required: false },
        tokens: { type: "number", required: false },
        cost: { type: "number", required: false },
        external_state_hash: { type: "string", required: false },
      },
      canonical_name_fields: ["cycle_id"],
      temporal_fields: [
        { field: "started_at", event_type: "AgentCycleStarted" },
        { field: "ended_at", event_type: "AgentCycleEnded" },
      ],
    },
    reducer_config: {
      merge_policies: {
        tasks_dispatched: { strategy: "last_write" },
        started_at: { strategy: "last_write" },
        ended_at: { strategy: "last_write" },
        tokens: { strategy: "last_write" },
        cost: { strategy: "last_write" },
        external_state_hash: { strategy: "last_write" },
      },
    },
  },

  agent_grant: {
    entity_type: "agent_grant",
    schema_version: "1.0.0",
    metadata: {
      label: "Agent grant",
      description:
        "AAuth admission grant. Maps a verified AAuth identity (sub / iss / thumbprint) to a Neotoma user with scoped capabilities. Created by the user (Inspector) or the env-config import command; mutated through the standard entity store. Status transitions (active → suspended ↔ active → revoked) are written as ordinary observations so the observation history doubles as an audit log.",
      category: "agent_runtime",
      aliases: [],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: false },
        label: { type: "string", required: true },
        match_sub: { type: "string", required: false },
        match_iss: { type: "string", required: false },
        match_thumbprint: { type: "string", required: false },
        capabilities: { type: "array", required: true },
        status: { type: "string", required: true },
        notes: { type: "string", required: false },
        last_used_at: { type: "date", required: false },
        import_source: { type: "string", required: false },
        linked_github_login: { type: "string", required: false },
        linked_github_user_id: { type: "number", required: false },
        linked_github_verified_at: { type: "date", required: false },
      },
      // Identity rules: thumbprint pin wins (rotated JWT issuer cannot
      // quietly replace the grant); otherwise a (sub, iss) composite; else
      // sub alone. Enforced in the grants service so resolution upserts on
      // re-imports and Inspector edits.
      canonical_name_fields: [
        { composite: ["match_thumbprint"] },
        { composite: ["match_sub", "match_iss"] },
        { composite: ["match_sub"] },
      ],
      name_collision_policy: "merge",
    },
    reducer_config: {
      merge_policies: {
        label: { strategy: "last_write" },
        capabilities: { strategy: "last_write" },
        status: { strategy: "last_write" },
        notes: { strategy: "last_write" },
        last_used_at: { strategy: "last_write" },
        match_sub: { strategy: "last_write" },
        match_iss: { strategy: "last_write" },
        match_thumbprint: { strategy: "last_write" },
        import_source: { strategy: "last_write" },
        linked_github_login: { strategy: "last_write" },
        linked_github_user_id: { strategy: "last_write" },
        linked_github_verified_at: { strategy: "last_write" },
      },
    },
  },

  conversation_turn: {
    entity_type: "conversation_turn",
    schema_version: "1.1",
    metadata: {
      label: "Conversation Turn",
      description:
        "Per-turn telemetry accreted by hook lifecycle events across all harnesses. One entity per (session_id, turn_id) capturing hook events, tool invocations, entity store/retrieve counts, missed steps, and compliance status. Supersedes the legacy `turn_compliance` entity; both `turn_compliance` and `turn_activity` are kept as aliases for backward compatibility.",
      category: "agent_runtime",
      aliases: ["turn_compliance", "turn_activity"],
    },
    schema_definition: {
      fields: {
        session_id: { type: "string", required: true },
        turn_id: { type: "string", required: true },
        turn_key: { type: "string", required: false },
        conversation_id: { type: "string", required: false },
        harness: { type: "string", required: false },
        harness_version: { type: "string", required: false },
        model: { type: "string", required: false },
        status: { type: "string", required: false },
        hook_events: { type: "array", required: false },
        missed_steps: { type: "array", required: false },
        tool_invocation_count: { type: "number", required: false },
        store_structured_calls: { type: "number", required: false },
        retrieve_calls: { type: "number", required: false },
        neotoma_tool_failures: { type: "number", required: false },
        harness_loop_count: { type: "number", required: false },
        injected_context_chars: { type: "number", required: false },
        retrieved_entity_ids: { type: "array", required: false },
        stored_entity_ids: { type: "array", required: false },
        failure_hint_shown: { type: "boolean", required: false },
        safety_net_used: { type: "boolean", required: false },
        started_at: { type: "date", required: false },
        ended_at: { type: "date", required: false },
        cwd: { type: "string", required: false },
        working_directory: { type: "string", required: false },
        git_branch: { type: "string", required: false },
        active_file_refs: { type: "array", required: false },
        context_source: { type: "string", required: false },
      },
      canonical_name_fields: [{ composite: ["session_id", "turn_id"] }],
      name_collision_policy: "reject",
    },
    reducer_config: {
      merge_policies: {
        turn_key: { strategy: "last_write" },
        conversation_id: { strategy: "last_write" },
        harness: { strategy: "last_write" },
        harness_version: { strategy: "last_write" },
        model: { strategy: "last_write" },
        status: { strategy: "last_write" },
        hook_events: { strategy: "last_write" },
        missed_steps: { strategy: "last_write" },
        tool_invocation_count: { strategy: "last_write" },
        store_structured_calls: { strategy: "last_write" },
        retrieve_calls: { strategy: "last_write" },
        neotoma_tool_failures: { strategy: "last_write" },
        harness_loop_count: { strategy: "last_write" },
        injected_context_chars: { strategy: "last_write" },
        retrieved_entity_ids: { strategy: "last_write" },
        stored_entity_ids: { strategy: "last_write" },
        failure_hint_shown: { strategy: "last_write" },
        safety_net_used: { strategy: "last_write" },
        started_at: { strategy: "last_write" },
        ended_at: { strategy: "last_write" },
        cwd: { strategy: "last_write" },
        working_directory: { strategy: "last_write" },
        git_branch: { strategy: "last_write" },
        active_file_refs: { strategy: "last_write" },
        context_source: { strategy: "last_write" },
      },
    },
  },

  tool_invocation: {
    entity_type: "tool_invocation",
    schema_version: "1.0",
    metadata: {
      label: "Tool Invocation",
      description:
        "A single tool call observed during an agent turn. Keyed by (turn_key, tool_name, invoked_at) so each call is a distinct entity.",
      category: "agent_runtime",
      aliases: [],
    },
    schema_definition: {
      fields: {
        turn_key: { type: "string", required: true },
        tool_name: { type: "string", required: true },
        invoked_at: { type: "date", required: true },
        duration_ms: { type: "number", required: false },
        result_status: { type: "string", required: false },
        harness: { type: "string", required: false },
      },
      canonical_name_fields: [{ composite: ["turn_key", "tool_name", "invoked_at"] }],
      name_collision_policy: "reject",
    },
    reducer_config: {
      merge_policies: {
        duration_ms: { strategy: "last_write" },
        result_status: { strategy: "last_write" },
        harness: { strategy: "last_write" },
      },
    },
  },

  tool_invocation_failure: {
    entity_type: "tool_invocation_failure",
    schema_version: "1.0",
    metadata: {
      label: "Tool Invocation Failure",
      description:
        "A failed tool call with error classification. Keyed by (turn_key, tool_name, error_class, observed_at).",
      category: "agent_runtime",
      aliases: [],
    },
    schema_definition: {
      fields: {
        turn_key: { type: "string", required: true },
        tool_name: { type: "string", required: true },
        error_class: { type: "string", required: true },
        observed_at: { type: "date", required: true },
        error_message: { type: "string", required: false },
        hint_shown: { type: "boolean", required: false },
        harness: { type: "string", required: false },
      },
      canonical_name_fields: [
        { composite: ["turn_key", "tool_name", "error_class", "observed_at"] },
      ],
      name_collision_policy: "reject",
    },
    reducer_config: {
      merge_policies: {
        error_message: { strategy: "last_write" },
        hint_shown: { strategy: "last_write" },
        harness: { strategy: "last_write" },
      },
    },
  },

  context_event: {
    entity_type: "context_event",
    schema_version: "1.0",
    metadata: {
      label: "Context Event",
      description:
        "A discrete event during context assembly for a turn (retrieval injection, system prompt transform, etc.). Keyed by (turn_key, event, observed_at).",
      category: "agent_runtime",
      aliases: [],
    },
    schema_definition: {
      fields: {
        turn_key: { type: "string", required: true },
        event: { type: "string", required: true },
        observed_at: { type: "date", required: true },
        chars_injected: { type: "number", required: false },
        entity_ids: { type: "array", required: false },
        harness: { type: "string", required: false },
      },
      canonical_name_fields: [{ composite: ["turn_key", "event", "observed_at"] }],
      name_collision_policy: "reject",
    },
    reducer_config: {
      merge_policies: {
        chars_injected: { strategy: "last_write" },
        entity_ids: { strategy: "last_write" },
        harness: { strategy: "last_write" },
      },
    },
  },

  gist: {
    entity_type: "gist",
    schema_version: "1.0",
    metadata: {
      label: "Gist",
      description: "GitHub Gists and similar code/text snippets shared via URL.",
      category: "knowledge",
      aliases: ["github_gist", "code_snippet"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: false },
        url: { type: "string", required: false },
        gist_id: { type: "string", required: false },
        description: { type: "string", required: false, preserveCase: true },
        title: { type: "string", required: false, preserveCase: true },
        content: { type: "string", required: false, preserveCase: true },
        language: { type: "string", required: false },
        created_at: { type: "date", required: false },
        updated_at: { type: "date", required: false },
      },
      // Callers commonly supply a pre-formed canonical_name or a stable gist_id;
      // identity_opt_out allows both paths without requiring composite fields.
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        description: { strategy: "last_write" },
        title: { strategy: "last_write" },
        content: { strategy: "last_write" },
        url: { strategy: "last_write" },
        language: { strategy: "last_write" },
        updated_at: { strategy: "last_write" },
      },
    },
  },

  neotoma_repair: {
    entity_type: "neotoma_repair",
    schema_version: "1.0",
    metadata: {
      label: "Neotoma Repair",
      description: "A record of a repair or remediation action taken within Neotoma.",
      category: "agent_runtime",
      aliases: ["repair", "remediation"],
    },
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: false },
        title: { type: "string", required: false, preserveCase: true },
        diagnosis: { type: "string", required: false, preserveCase: true },
        diagnosis_classification: { type: "string", required: false },
        trigger: { type: "string", required: false, preserveCase: true },
        applied_fix: { type: "string", required: false, preserveCase: true },
        proactive_remediation_required: { type: "boolean", required: false },
        remediation_status: { type: "string", required: false },
        created_at: { type: "date", required: false },
      },
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: {
        title: { strategy: "last_write" },
        diagnosis: { strategy: "last_write" },
        diagnosis_classification: { strategy: "last_write" },
        trigger: { strategy: "last_write" },
        applied_fix: { strategy: "last_write" },
        proactive_remediation_required: { strategy: "last_write" },
        remediation_status: { strategy: "last_write" },
      },
    },
  },

  external_link: {
    entity_type: "external_link",
    schema_version: "1.0",
    metadata: {
      label: "External Link",
      description:
        "A URL bookmark or reference with optional metadata. Supports common link provenance fields: description, data_source, link_kind, visibility.",
      category: "knowledge",
      aliases: ["bookmark", "link", "url_reference"],
    },
    schema_definition: {
      fields: {
        title: { type: "string", required: true },
        url: { type: "string", required: true },
        description: { type: "string", required: false },
        data_source: { type: "string", required: false },
        link_kind: { type: "string", required: false },
        visibility: { type: "string", required: false },
      },
      canonical_name_fields: ["url", "title"],
    },
    reducer_config: {
      merge_policies: {
        title: { strategy: "last_write" },
        description: { strategy: "last_write" },
        data_source: { strategy: "last_write" },
        link_kind: { strategy: "last_write" },
        visibility: { strategy: "last_write" },
      },
    },
  },
};

/**
 * @deprecated EXPANDED_ENTITY_SCHEMAS has been merged into ENTITY_SCHEMAS.
 * All schemas are now in a single unified structure.
 * This export is kept for backward compatibility but will be removed in a future version.
 */
export const EXPANDED_ENTITY_SCHEMAS: Record<string, Partial<EntitySchema>> = {};

/**
 * Get entity schema for an entity type
 */
export function getSchemaDefinition(entityType: string): EntitySchema | null {
  return ENTITY_SCHEMAS[entityType] || null;
}

/**
 * Normalize string for alias matching: lowercase, trim, strip diacritics.
 * So "Récibo" and "Recibo" both match alias "recibo".
 */
function normalizeForAliasMatch(s: string): string {
  const trimmed = s.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.normalize("NFD").replace(/\p{Diacritic}/gu, "") || trimmed;
}

/**
 * Resolve an extracted or localized entity type to a canonical entity_type
 * by matching against registered schemas' entity_type and metadata.aliases.
 * No hardcoded map: all mappings come from schema definitions, so new schemas
 * and aliases extend behavior automatically.
 * Matching is case- and accent-insensitive (e.g. "Recibo", "Récibo" -> receipt).
 *
 * @param extractedType - Raw type from LLM or client (e.g. "Recibo", "factura")
 * @returns Canonical entity_type if a schema matches, otherwise null
 */
export function resolveEntityTypeFromAlias(extractedType: string): string | null {
  const normalized = normalizeForAliasMatch(extractedType);
  if (!normalized) return null;

  for (const [canonicalType, schema] of Object.entries(ENTITY_SCHEMAS)) {
    if (normalized === normalizeForAliasMatch(canonicalType)) return canonicalType;
    const aliases = schema.metadata?.aliases ?? [];
    if (aliases.some((a) => normalizeForAliasMatch(a) === normalized)) return canonicalType;
  }
  return null;
}

/**
 * Return all canonical entity types that have a registered schema.
 * Used e.g. for LLM-based entity type inference when no alias matches.
 */
export function getRegisteredEntityTypes(): string[] {
  return Object.keys(ENTITY_SCHEMAS);
}

/** Minimal schema shape for scoring (code-defined or registry entry). */
export interface SchemaCandidate {
  entity_type: string;
  schema_definition: { fields?: Record<string, { type: string; required?: boolean }> };
}

/**
 * Score how well a set of extracted field keys matches a schema.
 * Required fields present count 2, optional count 1. Keys compared case-insensitively.
 */
function scoreSchemaMatch(
  extractedKeys: Set<string>,
  schema: SchemaCandidate
): { required: number; optional: number } {
  const fields = schema.schema_definition?.fields ?? {};
  let required = 0;
  let optional = 0;
  for (const [name, def] of Object.entries(fields)) {
    if (name === "schema_version") continue;
    const key = name.toLowerCase();
    if (!extractedKeys.has(key)) continue;
    if ((def as { required?: boolean }).required) {
      required += 1;
    } else {
      optional += 1;
    }
  }
  return { required, optional };
}

/** Types that are generic or catch-all; refinement may override these. */
const GENERIC_ENTITY_TYPES = new Set(["note", "generic"]);

/**
 * Refine entity type using extracted field keys: if the current type fits poorly
 * (e.g. 0–1 required fields) and another schema fits better (e.g. 2+ required fields),
 * return the better-matching type. Reduces misclassification (e.g. receipt doc → note).
 *
 * Works with a dynamic number of schema types: pass candidateSchemas from the registry
 * (e.g. schemaRegistry.listActiveSchemas(userId)) merged with code-defined schemas so
 * user/global DB schemas participate. When candidateSchemas is omitted, only code-defined
 * ENTITY_SCHEMAS are considered.
 *
 * @param currentEntityType - Resolved type from alias/LLM
 * @param extractedFieldKeys - Keys from extracted entity data (e.g. Object.keys(fields))
 * @param candidateSchemas - Optional list of schemas to consider (code + DB); when omitted, uses ENTITY_SCHEMAS only
 * @returns Refined entity type, or currentEntityType if no better match
 */
export function refineEntityTypeFromExtractedFields(
  currentEntityType: string,
  extractedFieldKeys: string[],
  candidateSchemas?: SchemaCandidate[]
): string {
  const keySet = new Set(extractedFieldKeys.map((k) => k.trim().toLowerCase()).filter(Boolean));
  if (keySet.size === 0) return currentEntityType;

  const candidates: SchemaCandidate[] =
    candidateSchemas ??
    Object.entries(ENTITY_SCHEMAS).map(([entity_type, s]) => ({
      entity_type,
      schema_definition: s.schema_definition,
    }));

  const currentSchema =
    candidates.find((c) => c.entity_type === currentEntityType) ??
    getSchemaDefinition(currentEntityType);
  const shouldRefineCurrentType = GENERIC_ENTITY_TYPES.has(currentEntityType) || !currentSchema;
  if (!shouldRefineCurrentType) return currentEntityType;

  const currentScore = currentSchema
    ? scoreSchemaMatch(keySet, currentSchema as SchemaCandidate)
    : { required: 0, optional: 0 };

  // If current type already has strong fit (2+ required), keep it
  if (currentScore.required >= 2) return currentEntityType;

  let bestOther: { type: string; required: number; optional: number } | null = null;
  for (const schema of candidates) {
    if (schema.entity_type === currentEntityType) continue;
    const s = scoreSchemaMatch(keySet, schema);
    if (
      s.required >= 2 &&
      (!bestOther ||
        s.required > bestOther.required ||
        (s.required === bestOther.required && s.optional > bestOther.optional))
    ) {
      bestOther = { type: schema.entity_type, required: s.required, optional: s.optional };
    }
  }
  if (!bestOther) return currentEntityType;
  // Override when another type has clearly better fit
  const currentTotal = currentScore.required * 2 + currentScore.optional;
  const bestTotal = bestOther.required * 2 + bestOther.optional;
  if (bestTotal > currentTotal + 1) return bestOther.type;
  return currentEntityType;
}

/**
 * @deprecated Use getSchemaDefinition() instead. All schemas are now unified.
 * This function is kept for backward compatibility but will be removed in a future version.
 */
export function getExpandedSchemaDefinition(entityType: string): Partial<EntitySchema> | null {
  // All schemas are now in ENTITY_SCHEMAS, so just use that
  return getSchemaDefinition(entityType);
}
