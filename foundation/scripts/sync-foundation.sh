#!/bin/bash
# Foundation Sync Script
# Syncs foundation changes between shared repo and consuming repos

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get repository root
REPO_ROOT="$(git rev-parse --show-toplevel)"
FOUNDATION_DIR="${REPO_ROOT}/foundation"

if [ ! -d "$FOUNDATION_DIR" ]; then
    print_error "Foundation not found at: $FOUNDATION_DIR"
    exit 1
fi

cd "$FOUNDATION_DIR"

# Check if we're in a submodule or the foundation repo itself
if [ -f ".git" ] && [ ! -d ".git" ]; then
    # We're in a submodule (file .git points to actual git dir)
    print_info "Syncing foundation submodule..."
    
    # Check for uncommitted changes
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        print_warn "Foundation has uncommitted changes"
        echo "Uncommitted changes:"
        git status --short
        read -p "Commit changes before syncing? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_info "Please commit your changes and run this script again"
            exit 1
        fi
    fi
    
    # Pull latest changes
    print_info "Pulling latest foundation changes..."
    git fetch origin
    git pull origin main
    
    # Update parent repo's submodule reference
    cd "$REPO_ROOT"
    git add foundation
    print_info "✅ Foundation synced"
    print_warn "Don't forget to commit the submodule update in the parent repo"
    
elif [ -d ".git" ]; then
    # We're in the foundation repo itself
    print_info "Pushing foundation changes..."
    
    # Check for uncommitted changes
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        print_warn "Foundation has uncommitted changes"
        git status --short
        read -p "Commit and push changes? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Sync cancelled"
            exit 0
        fi
        
        # Prompt for commit message
        read -p "Commit message: " COMMIT_MSG
        git add .
        git commit -m "$COMMIT_MSG"
    fi
    
    # Push changes
    git push origin main
    print_info "✅ Foundation changes pushed"
    print_info "Other repos can sync with: git submodule update --remote foundation"
    
else
    print_error "Unable to determine foundation repository type"
    exit 1
fi

