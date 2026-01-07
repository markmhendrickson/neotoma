/**
 * Schema Definitions for All Record Types
 *
 * Defines schema definitions for all record types including new financial types
 * from the finances repository. These can be registered with the schema registry.
 */

import type { SchemaDefinition, ReducerConfig } from "./schema_registry.js";

export interface RecordTypeSchema {
  entity_type: string;
  schema_version: string;
  schema_definition: SchemaDefinition;
  reducer_config: ReducerConfig;
}

/**
 * Schema definitions for all record types
 */
export const RECORD_TYPE_SCHEMAS: Record<string, RecordTypeSchema> = {
  holding: {
    entity_type: "holding",
    schema_version: "1.0",
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

  purchase: {
    entity_type: "purchase",
    schema_version: "1.0",
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
};

/**
 * Expanded schema definitions for existing types
 */
export const EXPANDED_RECORD_TYPE_SCHEMAS: Record<
  string,
  Partial<RecordTypeSchema>
> = {
  transaction: {
    entity_type: "transaction",
    schema_version: "1.0",
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
    schema_version: "1.1",
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
};

/**
 * Get schema definition for a record type
 */
export function getSchemaDefinition(
  recordType: string,
): RecordTypeSchema | null {
  return RECORD_TYPE_SCHEMAS[recordType] || null;
}

/**
 * Get expanded schema additions for existing record types
 */
export function getExpandedSchemaDefinition(
  recordType: string,
): Partial<RecordTypeSchema> | null {
  return EXPANDED_RECORD_TYPE_SCHEMAS[recordType] || null;
}
