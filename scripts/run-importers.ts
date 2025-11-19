#!/usr/bin/env tsx
import { initDatabase } from '../src/db.js';
import { runConnectorSync, runAllConnectorSyncs } from '../src/services/importers.js';

interface CliOptions {
  provider?: string;
  connectorId?: string;
  syncType?: 'initial' | 'incremental';
  limit?: number;
  maxPages?: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--provider':
      case '-p':
        options.provider = argv[++i];
        break;
      case '--connector-id':
      case '-c':
        options.connectorId = argv[++i];
        break;
      case '--sync-type':
      case '-t':
        options.syncType = argv[++i] as CliOptions['syncType'];
        break;
      case '--limit':
      case '-l':
        options.limit = Number(argv[++i]);
        break;
      case '--max-pages':
      case '-m':
        options.maxPages = Number(argv[++i]);
        break;
      default:
        break;
    }
  }
  return options;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.provider && !args.connectorId) {
    console.error('Usage: npm run import:connector -- --provider <id> [--connector-id <uuid>] [--sync-type initial|incremental] [--limit N] [--max-pages N]');
    process.exit(1);
  }

  await initDatabase();

  if (args.connectorId) {
    const result = await runConnectorSync({
      connectorId: args.connectorId,
      syncType: args.syncType,
      limit: args.limit,
      maxPages: args.maxPages,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!args.provider) {
    console.error('Provider is required when connector-id is not supplied.');
    process.exit(1);
  }

  const results = await runAllConnectorSyncs({
    provider: args.provider,
    limitPerConnector: args.limit,
    maxPages: args.maxPages,
  });
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});




