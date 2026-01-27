#!/bin/bash
# Helper script to set up frontend environment variables in .env

set -e

ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found"
  exit 1
fi

# Source .env to get SUPABASE_PROJECT_ID
source "$ENV_FILE"

if [ -z "$SUPABASE_PROJECT_ID" ]; then
  echo "Warning: SUPABASE_PROJECT_ID not found in .env"
  echo "Please set VITE_SUPABASE_URL manually in $ENV_FILE"
else
  # Construct Supabase URL from project ID
  SUPABASE_URL="https://${SUPABASE_PROJECT_ID}.supabase.co"
  
  # Update .env with the URL
  if grep -q "^VITE_SUPABASE_URL=" "$ENV_FILE"; then
    # Update existing line (works on both macOS and Linux)
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^VITE_SUPABASE_URL=.*|VITE_SUPABASE_URL=$SUPABASE_URL|" "$ENV_FILE"
    else
      sed -i "s|^VITE_SUPABASE_URL=.*|VITE_SUPABASE_URL=$SUPABASE_URL|" "$ENV_FILE"
    fi
    echo "✅ Updated VITE_SUPABASE_URL in $ENV_FILE"
  else
    # Append if not found
    echo "VITE_SUPABASE_URL=$SUPABASE_URL" >> "$ENV_FILE"
    echo "✅ Added VITE_SUPABASE_URL to $ENV_FILE"
  fi
fi

echo ""
echo "📝 Next steps:"
echo "1. Get your Supabase anon key from: Supabase Dashboard → Settings → API → Project API keys → anon public"
echo "2. Update VITE_SUPABASE_ANON_KEY in $ENV_FILE"
echo "3. Restart your Vite dev server (npm run dev:ui)"
