import { initDatabase } from './db.js';
import { NeotomaServer } from './server.js';

async function main() {
  try {
    await initDatabase();
    const server = new NeotomaServer();
    await server.run();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();



