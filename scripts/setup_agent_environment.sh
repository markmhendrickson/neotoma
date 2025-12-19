#!/bin/bash
# scripts/setup_agent_environment.sh
# Automated setup script for agent environments
# This script handles all common infrastructure setup that agents need

set -e

echo "[INFO] Setting up agent environment..."

# Step 1: Load environment variables (if .env exists)
if [ -f .env ]; then
  echo "[INFO] Loading environment variables from .env"
  export $(grep -v '^#' .env | xargs)
fi

# Step 2: Extract project ref from SUPABASE_URL
SUPABASE_URL="${SUPABASE_URL:-${DEV_SUPABASE_URL}}"
if [ -z "$SUPABASE_URL" ]; then
  echo "[WARN] SUPABASE_URL or DEV_SUPABASE_URL not set, skipping Supabase setup"
else
  PROJECT_REF=$(echo "$SUPABASE_URL" | sed -E 's|https://([^.]+)\.supabase\.co|\1|')
  
  if [ -z "$PROJECT_REF" ]; then
    echo "[WARN] Could not extract project ref from SUPABASE_URL: $SUPABASE_URL"
  else
    echo "[INFO] Supabase project ref: $PROJECT_REF"
    
    # Step 3: Try to link Supabase project and apply migrations
    echo "[INFO] Attempting to link Supabase project..."
    
    # Try CLI link (may fail without authentication in cloud agents)
    LINK_OUTPUT=$(npx supabase link --project-ref "$PROJECT_REF" 2>&1)
    if echo "$LINK_OUTPUT" | grep -q "already linked\|Finished supabase link"; then
      echo "[INFO] ✅ Supabase project linked"
      echo "[INFO] Applying database migrations..."
      npx supabase db push 2>&1 | grep -v "^$" || echo "[WARN] Migration push completed (check output above for errors)"
    else
      echo "[WARN] Supabase CLI linking failed (authentication required)"
      echo "[WARN] This is expected in cloud agent environments"
      echo "[WARN] Migrations will need to be applied manually via Supabase Dashboard SQL Editor"
      echo "[WARN] For now, integration/E2E tests that require migrations may fail"
    fi
  fi
fi

# Step 5: Install Playwright browsers (if needed)
echo "[INFO] Checking Playwright browsers..."
if npx playwright install --with-deps chromium --dry-run 2>&1 | grep -q "already installed"; then
  echo "[INFO] ✅ Playwright browsers already installed"
else
  echo "[INFO] Installing Playwright browsers..."
  npx playwright install --with-deps chromium
  echo "[INFO] ✅ Playwright browsers installed"
fi

# Step 6: Verify npm dependencies
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
echo "  - Supabase CLI: $(npx supabase --version 2>&1 | head -1 || echo 'not available')"
echo "  - Playwright: $(npx playwright --version 2>&1 | head -1 || echo 'not available')"
echo "  - Node: $(node --version)"
echo "  - npm: $(npm --version)"

