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
    
    # Step 3: Apply database migrations
    echo "[INFO] Applying database migrations..."
    
    # Try CLI first (if available and authenticated)
    LINK_OUTPUT=$(npx supabase link --project-ref "$PROJECT_REF" 2>&1)
    if echo "$LINK_OUTPUT" | grep -q "already linked\|Finished supabase link"; then
      echo "[INFO] ✅ Supabase project linked"
      echo "[INFO] Applying migrations via CLI..."
      if npx supabase db push 2>&1 | grep -v "^$"; then
        echo "[INFO] ✅ Migrations applied via CLI"
      else
        echo "[WARN] CLI migration failed, trying Node.js script..."
        # Fallback to Node.js script
        node scripts/apply_migrations_direct.js 2>&1 || echo "[WARN] Node.js migration script failed"
      fi
    else
      echo "[INFO] Supabase CLI linking unavailable (authentication required in cloud agents)"
      echo "[INFO] Applying migrations via Management API (using service key)..."
      # Use Node.js script that applies migrations via Management API
      if node scripts/apply_migrations_direct.js 2>&1; then
        echo "[INFO] ✅ Migrations applied via Management API"
      else
        echo "[WARN] Migration application failed - check logs above"
        echo "[WARN] Migrations may need to be applied manually via Supabase Dashboard SQL Editor"
      fi
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

