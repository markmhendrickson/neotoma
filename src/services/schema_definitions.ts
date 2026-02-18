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
  category: "finance" | "productivity" | "knowledge" | "health" | "media";
  aliases?: string[];
  primaryProperties?: string[]; // Optional: can derive from required fields
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
    },
    reducer_config: {
      merge_policies: {
        amount_usd: { strategy: "last_write" },
        flow_date: { strategy: "last_write" },
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
      },
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
    },
    reducer_config: {
      merge_policies: {
        name: { strategy: "highest_priority" },
        latitude: { strategy: "last_write" },
        longitude: { strategy: "last_write" },
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
        posting_date: { type: "date", required: false },
        category: { type: "string", required: false },
        bank_provider: { type: "string", required: false },
        amount_original: { type: "number", required: false },
      },
    },
    reducer_config: {
      merge_policies: {
        posting_date: { strategy: "last_write" },
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
        signed_date: { type: "date", required: false },
        companies: { type: "string", required: false },
        files: { type: "string", required: false },
        type: { type: "string", required: false },
        notes: { type: "string", required: false },
      },
    },
    reducer_config: {
      merge_policies: {
        signed_date: { strategy: "last_write" },
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
        wallet: { type: "string", required: false },
        wallet_name: { type: "string", required: false },
        number: { type: "string", required: false },
        categories: { type: "string", required: false },
        denomination: { type: "string", required: false },
        status: { type: "string", required: false },
        notes: { type: "string", required: false },
      },
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
    },
    reducer_config: {
      merge_policies: {
        priority: { strategy: "last_write" },
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
    candidateSchemas ?? Object.entries(ENTITY_SCHEMAS).map(([entity_type, s]) => ({ entity_type, schema_definition: s.schema_definition }));

  const currentSchema = candidates.find((c) => c.entity_type === currentEntityType) ?? getSchemaDefinition(currentEntityType);
  const currentScore = currentSchema
    ? scoreSchemaMatch(keySet, currentSchema as SchemaCandidate)
    : { required: 0, optional: 0 };

  // If current type already has strong fit (2+ required), keep it
  if (currentScore.required >= 2) return currentEntityType;

  let bestOther: { type: string; required: number; optional: number } | null = null;
  for (const schema of candidates) {
    if (schema.entity_type === currentEntityType) continue;
    const s = scoreSchemaMatch(keySet, schema);
    if (s.required >= 2 && (!bestOther || s.required > bestOther.required || (s.required === bestOther.required && s.optional > bestOther.optional))) {
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
