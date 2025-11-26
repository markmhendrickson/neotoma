#!/usr/bin/env node

/**
 * Reverse proxy server that routes branch-based domains to the appropriate dev servers.
 * Routes [BRANCH_NAME].dev to Vite UI port and proxies /api/* to HTTP Actions server port.
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const PROXY_HTTP_PORT = parseInt(process.env.PROXY_HTTP_PORT || process.env.PROXY_PORT || '80', 10);
const PROXY_HTTPS_PORT = parseInt(process.env.PROXY_HTTPS_PORT || '443', 10);
const CERT_DIR = path.join(projectRoot, '.dev-certs');
const CERT_PATH = path.join(CERT_DIR, 'dev.crt');
const KEY_PATH = path.join(CERT_DIR, 'dev.key');
const BRANCH_PORTS_DIR = path.join(projectRoot, '.branch-ports');
const DEV_SERVE_DIR = path.join(projectRoot, '.dev-serve');

// Map of branch name -> { http, vite, ws }
const branchPorts = new Map();

function sanitizeBranchNameForHost(branchName) {
  // Convert branch name to hostname-safe format (e.g., "feature/test" -> "feature-test")
  return branchName.replace(/\//g, '-').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function sanitizeBranchName(hostname) {
  // Extract branch name from hostname like "feature-branch.dev" or "feature-branch.dev:80"
  // Port is optional and will be stripped
  const match = hostname.match(/^([^:]+)\.dev/);
  if (!match) {
    return null;
  }
  return match[1];
}

function findBranchByHostname(hostname) {
  // First try exact match
  const sanitized = sanitizeBranchName(hostname);
  if (!sanitized) {
    return null;
  }
  
  // Try exact match first
  for (const [branch, ports] of branchPorts.entries()) {
    if (branch === sanitized) {
      return { branch, ports };
    }
  }
  
  // Try sanitized match (for branches with slashes like "feature/test")
  for (const [branch, ports] of branchPorts.entries()) {
    if (sanitizeBranchNameForHost(branch) === sanitized) {
      return { branch, ports };
    }
  }
  
  return null;
}

function readStateFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function scanBranchPorts() {
  branchPorts.clear();

  // Scan .branch-ports directory
  if (fs.existsSync(BRANCH_PORTS_DIR)) {
    const files = fs.readdirSync(BRANCH_PORTS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(BRANCH_PORTS_DIR, file);
        const state = readStateFile(filePath);
        if (state && state.branch && state.ports) {
          branchPorts.set(state.branch, {
            http: state.ports.http,
            vite: state.ports.vite,
            ws: state.ports.ws,
          });
        }
      }
    }
  }

  // Scan .dev-serve directory (takes precedence)
  if (fs.existsSync(DEV_SERVE_DIR)) {
    const files = fs.readdirSync(DEV_SERVE_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(DEV_SERVE_DIR, file);
        const state = readStateFile(filePath);
        if (state && state.branch && state.ports) {
          // Override with dev-serve state
          branchPorts.set(state.branch, {
            http: state.ports.http,
            vite: state.ports.vite,
            ws: state.ports.ws,
          });
        }
      }
    }
  }
}

function proxyRequest(req, res, targetPort, rewritePath = null) {
  const targetUrl = `http://localhost:${targetPort}${rewritePath || req.url || '/'}`;
  const url = new URL(targetUrl);

  const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${url.hostname}:${url.port}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Bad Gateway: ${err.message}`);
    }
  });

  req.pipe(proxyReq);
}

function proxyWebSocket(req, socket, head, targetPort) {
  const proxyReq = http.request({
    hostname: 'localhost',
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `localhost:${targetPort}`,
    },
  });

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    // Write upgrade response to client
    socket.write(`HTTP/${proxyRes.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`);
    Object.keys(proxyRes.headers).forEach((key) => {
      socket.write(`${key}: ${proxyRes.headers[key]}\r\n`);
    });
    socket.write('\r\n');
    
    // Write any head data
    if (proxyHead && proxyHead.length > 0) {
      socket.write(proxyHead);
    }
    
    // Pipe sockets bidirectionally
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
    
    // Handle errors
    proxySocket.on('error', () => {
      if (!socket.destroyed) {
        socket.destroy();
      }
    });
    
    socket.on('error', () => {
      if (!proxySocket.destroyed) {
        proxySocket.destroy();
      }
    });
  });

  proxyReq.on('error', (err) => {
    console.error(`[dev-proxy] WebSocket proxy error:`, err.message);
    if (!socket.destroyed) {
      socket.destroy();
    }
  });

  socket.on('error', () => {
    if (!proxyReq.destroyed) {
      proxyReq.destroy();
    }
  });

  // Write head data and pipe request
  if (head && head.length > 0) {
    proxyReq.write(head);
  }
  
  socket.pipe(proxyReq);
}

function createRequestHandler() {
  return (req, res) => {
    const hostname = req.headers.host?.split(':')[0] || '';
    const match = findBranchByHostname(hostname);

    if (!match) {
      const availableBranches = Array.from(branchPorts.keys())
        .map((b) => sanitizeBranchNameForHost(b))
        .join(', ') || 'none';
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Branch not found for "${hostname}". Available branches: ${availableBranches}`);
      return;
    }

    const { branch, ports } = match;

    // Determine target based on path
    const isApiRequest = req.url?.startsWith('/api');
    const targetPort = isApiRequest ? ports.http : ports.vite;
    const rewritePath = isApiRequest && req.url ? req.url.replace(/^\/api/, '') : null;

    proxyRequest(req, res, targetPort, rewritePath);
  };
}

function createUpgradeHandler() {
  return (req, socket, head) => {
    const hostname = req.headers.host?.split(':')[0] || '';
    const match = findBranchByHostname(hostname);
    
    if (!match) {
      socket.destroy();
      return;
    }

    const { ports } = match;
    proxyWebSocket(req, socket, head, ports.vite);
  };
}

function createHttpProxy() {
  const server = http.createServer(createRequestHandler());
  server.on('upgrade', createUpgradeHandler());
  return server;
}

function createHttpsProxy() {
  // Load SSL certificate
  let sslOptions;
  try {
    if (fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH)) {
      sslOptions = {
        cert: fs.readFileSync(CERT_PATH),
        key: fs.readFileSync(KEY_PATH),
      };
    } else {
      console.warn('[dev-proxy] SSL certificates not found. HTTPS will be disabled.');
      console.warn(`[dev-proxy] Run: ./scripts/generate-dev-cert.sh`);
      return null;
    }
  } catch (error) {
    console.error(`[dev-proxy] Failed to load SSL certificates: ${error.message}`);
    return null;
  }

  const server = https.createServer(sslOptions, createRequestHandler());
  server.on('upgrade', createUpgradeHandler());
  return server;
}

// Initial scan
scanBranchPorts();

// Watch for changes to state directories
const watchers = new Set();

function setupWatchers() {
  for (const dir of [BRANCH_PORTS_DIR, DEV_SERVE_DIR]) {
    if (fs.existsSync(dir)) {
      try {
        const watcher = fs.watch(dir, { recursive: false }, (eventType) => {
          if (eventType === 'rename') {
            // Debounce scans to avoid excessive updates
            setTimeout(() => {
              scanBranchPorts();
              const branchList = Array.from(branchPorts.keys()).join(', ') || 'none';
              console.log(`[dev-proxy] Updated branch mappings. Available: ${branchList}`);
            }, 100);
          }
        });
        watchers.add(watcher);
      } catch (err) {
        // Directory might not exist, ignore
      }
    }
  }
}

setupWatchers();

// Periodically rescan (fallback for file system watcher issues)
setInterval(() => {
  const oldSize = branchPorts.size;
  scanBranchPorts();
  if (branchPorts.size !== oldSize) {
    const branchList = Array.from(branchPorts.keys()).join(', ') || 'none';
    console.log(`[dev-proxy] Rescanned branch mappings. Available: ${branchList}`);
  }
}, 5000);

const httpServer = createHttpProxy();
const httpsServer = createHttpsProxy();

const branchList = Array.from(branchPorts.keys())
  .map((b) => sanitizeBranchNameForHost(b))
  .join(', ') || 'none';

// Start HTTP server
const httpListenOptions = { port: PROXY_HTTP_PORT };
if (PROXY_HTTP_PORT === 80) {
  httpListenOptions.host = '0.0.0.0';
}

httpServer.listen(httpListenOptions, () => {
  const portSuffix = PROXY_HTTP_PORT === 80 ? '' : `:${PROXY_HTTP_PORT}`;
  console.log(`[dev-proxy] HTTP reverse proxy listening on port ${PROXY_HTTP_PORT}`);
  console.log(`[dev-proxy] Available branches: ${branchList}`);
  console.log(`[dev-proxy] HTTP access: http://[BRANCH_NAME].dev${portSuffix}`);
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[dev-proxy] Port ${PROXY_HTTP_PORT} is already in use. Set PROXY_HTTP_PORT to use a different port.`);
    process.exit(1);
  }
  if (err.code === 'EACCES' && PROXY_HTTP_PORT === 80) {
    console.error(`[dev-proxy] Cannot bind to port 80 (requires root privileges).`);
    console.error(`[dev-proxy] Options:`);
    console.error(`[dev-proxy]   1. Run with sudo: sudo npm run dev:serve`);
    console.error(`[dev-proxy]   2. Use a different port: PROXY_HTTP_PORT=8000 npm run dev:serve`);
    process.exit(1);
  }
  throw err;
});

// Start HTTPS server if certificates are available
if (httpsServer) {
  const httpsListenOptions = { port: PROXY_HTTPS_PORT };
  if (PROXY_HTTPS_PORT === 443) {
    httpsListenOptions.host = '0.0.0.0';
  }

  httpsServer.listen(httpsListenOptions, () => {
    const portSuffix = PROXY_HTTPS_PORT === 443 ? '' : `:${PROXY_HTTPS_PORT}`;
    console.log(`[dev-proxy] HTTPS reverse proxy listening on port ${PROXY_HTTPS_PORT}`);
    console.log(`[dev-proxy] HTTPS access: https://[BRANCH_NAME].dev${portSuffix}`);
  });

  httpsServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[dev-proxy] Port ${PROXY_HTTPS_PORT} is already in use. Set PROXY_HTTPS_PORT to use a different port.`);
      process.exit(1);
    }
    if (err.code === 'EACCES' && PROXY_HTTPS_PORT === 443) {
      console.error(`[dev-proxy] Cannot bind to port 443 (requires root privileges).`);
      console.error(`[dev-proxy] Options:`);
      console.error(`[dev-proxy]   1. Run with sudo: sudo npm run dev:serve`);
      console.error(`[dev-proxy]   2. Use a different port: PROXY_HTTPS_PORT=8443 npm run dev:serve`);
      process.exit(1);
    }
    throw err;
  });
}

// Graceful shutdown
function shutdown() {
  console.log('[dev-proxy] Shutting down...');
  watchers.forEach((watcher) => watcher.close());
  
  const closePromises = [new Promise((resolve) => httpServer.close(() => resolve()))];
  if (httpsServer) {
    closePromises.push(new Promise((resolve) => httpsServer.close(() => resolve())));
  }
  
  Promise.all(closePromises).then(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
