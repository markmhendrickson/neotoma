#!/bin/bash
# Complete submodule setup - run after creating GitHub repository

set -euo pipefail

SHARED_REPO_URL="${1:-https://github.com/markmhendrickson/react-components.git}"
REACT_COMPONENTS_REPO="$HOME/repos/react-components"
ATELES_SHARED="/Users/markmhendrickson/repos/ateles/execution/website/shared"
NEOTOMA_ROOT="/Users/markmhendrickson/repos/neotoma"

echo "🔧 Completing shared UI components submodule setup"
echo "Repository URL: $SHARED_REPO_URL"
echo ""

# Step 1: Add remote and push shared directory
echo "Step 1: Setting up remote for shared directory..."
cd "$ATELES_SHARED"

if git remote | grep -q "^origin$"; then
  echo "⚠️  Remote 'origin' already exists. Updating..."
  git remote set-url origin "$SHARED_REPO_URL"
else
  git remote add origin "$SHARED_REPO_URL"
fi

echo "Pushing to remote..."
git branch -M main
git push -u origin main || {
  echo "❌ Failed to push. Please check:"
  echo "   1. Repository exists on GitHub: $SHARED_REPO_URL"
  echo "   2. You have push access"
  echo "   3. SSH keys are set up"
  exit 1
}

echo "✅ Shared repository pushed successfully"
echo ""

# Step 2: Remove from ateles parent and add as submodule
echo "Step 2: Converting to submodule in ateles..."
cd /Users/markmhendrickson/repos/ateles

# Check if already a submodule
if [ -f ".gitmodules" ] && grep -q "shared-ui-components" .gitmodules; then
  echo "⚠️  Submodule already exists in ateles. Skipping..."
else
  # Remove from parent repo (but keep files)
  if git ls-files --error-unmatch execution/website/shared >/dev/null 2>&1; then
    echo "Removing shared directory from ateles git tracking..."
    git rm -r --cached execution/website/shared
    git commit -m "Remove shared directory (converting to submodule)" || echo "⚠️  No changes to commit"
  fi
  
  # Remove the directory if it exists
  if [ -d "execution/website/shared" ]; then
    rm -rf execution/website/shared
  fi
  
  # Add as submodule
  echo "Adding as submodule..."
  git submodule add "$SHARED_REPO_URL" execution/website/shared || {
    echo "⚠️  Submodule path may already exist. Removing and re-adding..."
    rm -rf execution/website/shared
    git submodule add "$SHARED_REPO_URL" execution/website/shared
  }
  
  echo "✅ Submodule added to ateles"
  git status --short
fi

echo ""

# Step 3: Add to neotoma as submodule
echo "Step 3: Adding submodule to neotoma..."
cd "$NEOTOMA_ROOT"

# Check if already a submodule
if [ -f ".gitmodules" ] && grep -q "shared-ui-components" .gitmodules; then
  echo "⚠️  Submodule already exists in neotoma. Updating..."
  git submodule update --init --recursive
else
  # Create directory if needed
  mkdir -p frontend/src
  
  # Add as submodule
  echo "Adding as submodule..."
  git submodule add "$SHARED_REPO_URL" frontend/src/shared
  
  echo "✅ Submodule added to neotoma"
  git status --short
fi

echo ""
echo "✅ Submodule setup complete!"
echo ""
echo "Next steps:"
echo "  1. Update vite.config.ts in both repos to add '@shared' alias"
echo "  2. Update imports in code to use '@shared' instead of local paths"
echo "  3. Commit the changes:"
echo "     cd /Users/markmhendrickson/repos/ateles && git add .gitmodules execution/website/shared && git commit -m 'Add react-components submodule'"
echo "     cd /Users/markmhendrickson/repos/neotoma && git add .gitmodules frontend/src/shared && git commit -m 'Add react-components submodule'"
