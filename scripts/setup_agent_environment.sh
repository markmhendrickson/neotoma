#!/bin/bash
# scripts/setup_agent_environment.sh
# Automated setup script for agent environments (local-only mode)

set -e

echo "[INFO] Setting up agent environment..."

# Step 1: Load environment variables (if .env exists)
if [ -f .env ]; then
  echo "[INFO] Loading environment variables from .env"
  export $(grep -v '^#' .env | xargs)
fi

# Step 1b: Configure git identity for castor-agent
echo "[INFO] Configuring git identity for castor-agent..."
git config user.name "castor-agent"
git config user.email "markmhendrickson+castor-agent@gmail.com"
echo "[INFO] ✅ Git identity set to castor-agent"

# Step 2: Install Playwright browsers (if needed)
echo "[INFO] Checking Playwright browsers..."
if npx playwright install --with-deps chromium --dry-run 2>&1 | grep -q "already installed"; then
  echo "[INFO] ✅ Playwright browsers already installed"
else
  echo "[INFO] Installing Playwright browsers..."
  npx playwright install --with-deps chromium
  echo "[INFO] ✅ Playwright browsers installed"
fi

# Step 3: Verify npm dependencies
if [ ! -d "node_modules" ]; then
  echo "[INFO] Installing npm dependencies..."
  npm install
  echo "[INFO] ✅ Dependencies installed"
else
  echo "[INFO] ✅ Dependencies already installed"
fi

echo "[INFO] ✅ Agent environment setup complete"
echo ""
echo "[INFO] Environment summary:"
echo "  - Playwright: $(npx playwright --version 2>&1 | head -1 || echo 'not available')"
echo "  - Node: $(node --version)"
echo "  - npm: $(npm --version)"
