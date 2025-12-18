import { describe, it, expect } from "vitest";
import { config } from "../../config.js";
import {
  isPlaidConfigured,
  createSandboxPublicToken,
  exchangePublicToken,
  buildPlaidItemContext,
  syncTransactions,
} from "./client.js";

const shouldRun = isPlaidConfigured() && config.plaid.environment === "sandbox";

(shouldRun ? describe : describe.skip)('Plaid sandbox integration', () => {
  it('exchanges a sandbox public token and fetches accounts/transactions', async () => {
    const publicToken = await createSandboxPublicToken('ins_109508', ['transactions']);
    expect(publicToken).toBeTruthy();

    const exchange = await exchangePublicToken(publicToken);
    expect(exchange.accessToken).toBeTruthy();
    expect(exchange.itemId).toBeTruthy();

    const context = await buildPlaidItemContext(exchange.accessToken);
    expect(context.item.item_id).toBe(exchange.itemId);
    expect(Array.isArray(context.accounts)).toBe(true);
    expect(context.accounts.length).toBeGreaterThan(0);

    const syncResult = await syncTransactions({
      accessToken: exchange.accessToken,
    });

    expect(syncResult.nextCursor).toBeTruthy();
    expect(syncResult.accounts.length).toBeGreaterThan(0);
    expect(Array.isArray(syncResult.added)).toBe(true);
    expect(Array.isArray(syncResult.modified)).toBe(true);
    expect(Array.isArray(syncResult.removed)).toBe(true);
  }, 30000);
});


