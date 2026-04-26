/**
 * Driver registry. New providers slot in here so the runner can pick
 * the right driver from a scenario's `models[].provider` field without
 * the runner needing to know the SDK details.
 */

import type { LLMDriver, ProviderId } from "../types.js";
import { claudeAgentSdkDriver } from "./claude_agent_sdk.js";
import { openaiAgentsDriver } from "./openai_agents.js";
import { stubDriver } from "./stub.js";

const DEFAULT_DRIVERS: Map<ProviderId, LLMDriver> = new Map([
  ["claude" as ProviderId, claudeAgentSdkDriver as LLMDriver],
  ["openai" as ProviderId, openaiAgentsDriver as LLMDriver],
  ["stub" as ProviderId, stubDriver as LLMDriver],
]);

export function getDriver(provider: ProviderId): LLMDriver {
  const driver = DEFAULT_DRIVERS.get(provider);
  if (!driver) {
    throw new Error(`no driver registered for provider "${provider}"`);
  }
  return driver;
}

export function registerDriver(driver: LLMDriver): void {
  DEFAULT_DRIVERS.set(driver.id, driver);
}

export function listProviders(): ProviderId[] {
  return [...DEFAULT_DRIVERS.keys()];
}
