import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';

const MCP_CMD = process.env.MCP_CMD || 'node';
const MCP_ARGS = (process.env.MCP_ARGS ? JSON.parse(process.env.MCP_ARGS) : ['dist/index.js']) as string[];
const PORT = parseInt(process.env.WS_PORT || '8081', 10);

const wss = new WebSocketServer({ port: PORT, path: '/mcp' });

wss.on('connection', (ws) => {
  const child = spawn(MCP_CMD, MCP_ARGS, { stdio: ['pipe', 'pipe', 'inherit'] });

  // Client → stdio (binary-safe)
  ws.on('message', (msg) => {
    try {
      child.stdin.write(msg as Buffer);
    } catch (_) {
      // ignore write after end
    }
  });

  ws.on('close', () => {
    try { child.kill('SIGTERM'); } catch (_) {}
  });

  // stdio → client
  child.stdout.on('data', (chunk) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(chunk);
    }
  });
});

// eslint-disable-next-line no-console
console.log(`MCP WebSocket bridge on ws://localhost:${PORT}/mcp`);

