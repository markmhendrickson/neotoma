import { initDatabase } from './db.js';
import { NeotomaServer } from './server.js';
import { initServerKeys } from './services/encryption_service.js';

async function main() {
  try {
    await initDatabase();
    await initServerKeys(); // Initialize server encryption keys
    const server = new NeotomaServer();
    await server.run();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();



