#!/bin/bash
# Setup script for shared UI components submodule
# This script helps set up the shared components as a git submodule

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ATELES_SHARED="/Users/markmhendrickson/repos/ateles/execution/website/shared"

echo "🔧 Setting up shared UI components submodule"
echo ""

# Step 1: Check if submodule repo exists
echo "Step 1: Checking for existing submodule repository..."
SHARED_REPO_URL="${SHARED_REPO_URL:-git@github.com:markmhendrickson/shared-ui-components.git}"

if git ls-remote "$SHARED_REPO_URL" &>/dev/null; then
  echo "✅ Repository exists: $SHARED_REPO_URL"
else
  echo "❌ Repository does not exist: $SHARED_REPO_URL"
  echo ""
  echo "Please create the repository first:"
  echo "  1. Go to https://github.com/new"
  echo "  2. Create repository: shared-ui-components"
  echo "  3. Set it to private (if needed)"
  echo "  4. Run this script again with:"
  echo "     SHARED_REPO_URL=git@github.com:YOUR_USERNAME/shared-ui-components.git ./scripts/setup_shared_submodule.sh"
  exit 1
fi

# Step 2: Initialize the shared repository if needed
echo ""
echo "Step 2: Setting up shared repository..."
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

cd "$TEMP_DIR"
git clone "$SHARED_REPO_URL" shared-repo 2>/dev/null || {
  # Repository is empty, initialize it
  mkdir -p shared-repo
  cd shared-repo
  git init
  git remote add origin "$SHARED_REPO_URL"
  
  # Copy files from ateles
  echo "Copying files from ateles shared directory..."
  cp -r "$ATELES_SHARED"/* .
  
  # Create initial commit
  git add .
  git commit -m "Initial commit: Shared UI components from ateles" || {
    echo "⚠️  Repository already has content, skipping initial commit"
  }
  
  # Push to remote
  echo "Pushing to remote repository..."
  git branch -M main
  git push -u origin main || {
    echo "⚠️  Could not push to remote. You may need to push manually:"
    echo "   cd $TEMP_DIR/shared-repo"
    echo "   git push -u origin main"
  }
}

# Step 3: Add submodule to neotoma
echo ""
echo "Step 3: Adding submodule to neotoma..."
cd "$REPO_ROOT"

# Remove existing shared directory if it exists (backup first)
if [ -d "frontend/src/shared" ]; then
  echo "⚠️  Backing up existing frontend/src/shared..."
  mv frontend/src/shared frontend/src/shared.backup.$(date +%Y%m%d_%H%M%S)
fi

# Add submodule
git submodule add "$SHARED_REPO_URL" frontend/src/shared || {
  echo "⚠️  Submodule may already exist. Updating..."
  git submodule update --init --recursive
}

# Step 4: Update .gitmodules if needed
echo ""
echo "Step 4: Verifying .gitmodules configuration..."
if [ -f .gitmodules ]; then
  echo "✅ .gitmodules exists"
  cat .gitmodules
else
  echo "⚠️  .gitmodules not found"
fi

echo ""
echo "✅ Submodule setup complete!"
echo ""
echo "Next steps:"
echo "  1. Update vite.config.ts to add alias: '@shared': path.resolve(__dirname, './src/shared')"
echo "  2. Update imports in components to use '@shared'"
echo "  3. Commit the submodule addition: git add .gitmodules frontend/src/shared"
echo "  4. For ateles repo, run similar setup to replace shared/ with submodule"
