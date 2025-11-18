import type { ProviderClient } from './types.js';
import { providerCatalog, getProviderDefinition, type ProviderDefinition } from './metadata.js';
import { XProviderClient } from './x.js';
import { InstagramProviderClient } from './instagram.js';
import { FacebookProviderClient } from './facebook.js';
import { GmailProviderClient } from './gmail.js';
import { AsanaProviderClient } from './asana.js';

type ProviderFactory = () => ProviderClient;

const providerFactories: Record<string, ProviderFactory> = {
  x: () => new XProviderClient(),
  instagram: () => new InstagramProviderClient(),
  facebook: () => new FacebookProviderClient(),
  gmail: () => new GmailProviderClient(),
  asana: () => new AsanaProviderClient(),
};

export { providerCatalog, getProviderDefinition };

export function getProviderClient(id: string): ProviderClient {
  const factory = providerFactories[id];
  if (!factory) {
    throw new Error(`Provider client for ${id} is not implemented yet`);
  }
  return factory();
}

export function listProviderDefinitions(): ProviderDefinition[] {
  return providerCatalog;
}

