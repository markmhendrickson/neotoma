import { describe, it, expect } from 'vitest';
import { redactPlaidItem, type PlaidItemRow } from './plaid_sync.js';

describe('Plaid sync helpers', () => {
  it('redactPlaidItem removes access token', () => {
    const item: PlaidItemRow = {
      id: 'uuid-123',
      item_id: 'item-123',
      institution_id: 'ins_109508',
      institution_name: 'Test Institution',
      access_token: 'secret-access-token',
      environment: 'sandbox',
      products: ['transactions'],
      country_codes: ['US'],
      cursor: 'cursor-1',
      webhook_status: null,
      last_successful_sync: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const redacted = redactPlaidItem(item);
    expect(redacted).not.toHaveProperty('access_token');
    expect(redacted.item_id).toBe('item-123');
    expect(redacted.environment).toBe('sandbox');
  });
});


