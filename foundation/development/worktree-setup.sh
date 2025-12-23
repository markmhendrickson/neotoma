#!/bin/bash
# Git Worktree Setup Script
# Creates a new git worktree for isolated feature development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in a git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    print_error "Not in a git repository"
    exit 1
fi

# Get repository root
REPO_ROOT=$(git rev-parse --show-toplevel)
REPO_NAME=$(basename "$REPO_ROOT")

# Parse arguments
BRANCH_NAME=""
BASE_BRANCH="dev"
WORKTREE_PATH=""
FEATURE_PREFIX="feature"

# Help message
show_help() {
    cat << EOF
Usage: ./worktree-setup.sh [OPTIONS] <branch-name>

Creates a new git worktree for isolated feature development.

OPTIONS:
    -h, --help              Show this help message
    -b, --base <branch>     Base branch to branch from (default: dev)
    -p, --path <path>       Custom worktree path (default: ../<repo>-<branch>)
    -f, --prefix <prefix>   Branch prefix (default: feature)

EXAMPLES:
    # Create feature branch from dev
    ./worktree-setup.sh my-feature

    # Create feature branch with ID
    ./worktree-setup.sh 123-my-feature

    # Create from different base branch
    ./worktree-setup.sh -b main my-feature

    # Custom worktree path
    ./worktree-setup.sh -p /tmp/my-feature my-feature

    # Custom branch prefix
    ./worktree-setup.sh -f bugfix fix-issue
EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -b|--base)
            BASE_BRANCH="$2"
            shift 2
            ;;
        -p|--path)
            WORKTREE_PATH="$2"
            shift 2
            ;;
        -f|--prefix)
            FEATURE_PREFIX="$2"
            shift 2
            ;;
        *)
            if [ -z "$BRANCH_NAME" ]; then
                BRANCH_NAME="$1"
            else
                print_error "Unknown argument: $1"
                show_help
                exit 1
            fi
            shift
            ;;
    esac
done

# Validate branch name
if [ -z "$BRANCH_NAME" ]; then
    print_error "Branch name is required"
    show_help
    exit 1
fi

# Construct full branch name with prefix
FULL_BRANCH_NAME="${FEATURE_PREFIX}/${BRANCH_NAME}"

# Set default worktree path if not provided
if [ -z "$WORKTREE_PATH" ]; then
    WORKTREE_PATH="../${REPO_NAME}-${BRANCH_NAME}"
fi

print_info "Setting up git worktree..."
print_info "Repository: $REPO_NAME"
print_info "Base branch: $BASE_BRANCH"
print_info "New branch: $FULL_BRANCH_NAME"
print_info "Worktree path: $WORKTREE_PATH"

# Check if base branch exists
if ! git rev-parse --verify "$BASE_BRANCH" > /dev/null 2>&1; then
    print_error "Base branch '$BASE_BRANCH' does not exist"
    exit 1
fi

# Fetch latest changes
print_info "Fetching latest changes..."
git fetch origin

# Update base branch
print_info "Updating base branch..."
git checkout "$BASE_BRANCH"
git pull origin "$BASE_BRANCH"

# Check if branch already exists
if git rev-parse --verify "$FULL_BRANCH_NAME" > /dev/null 2>&1; then
    print_warn "Branch '$FULL_BRANCH_NAME' already exists"
    read -p "Do you want to create a worktree for the existing branch? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    git worktree add "$WORKTREE_PATH" "$FULL_BRANCH_NAME"
else
    # Create worktree with new branch
    print_info "Creating worktree..."
    git worktree add -b "$FULL_BRANCH_NAME" "$WORKTREE_PATH" "$BASE_BRANCH"
fi

# Navigate to worktree
cd "$WORKTREE_PATH"

print_info "Worktree created successfully!"

# Check for package manager
if [ -f "package.json" ]; then
    print_info "Installing dependencies..."
    if command -v npm > /dev/null 2>&1; then
        npm install
    else
        print_warn "npm not found, skipping dependency installation"
    fi
fi

# Check for env copy script
ENV_COPY_SCRIPT="scripts/copy-env-to-worktree.js"
if [ -f "$REPO_ROOT/$ENV_COPY_SCRIPT" ]; then
    print_info "Copying environment files..."
    node "$REPO_ROOT/$ENV_COPY_SCRIPT"
elif [ -f "$REPO_ROOT/.env" ]; then
    print_info "Copying .env file..."
    cp "$REPO_ROOT/.env" ./.env
fi

# Push branch to remote
print_info "Pushing branch to remote..."
git push -u origin "$FULL_BRANCH_NAME"

print_info "Setup complete!"
print_info ""
print_info "Next steps:"
print_info "  cd $WORKTREE_PATH"
print_info "  # Make your changes"
print_info "  git add ."
print_info "  git commit -m \"${FULL_BRANCH_NAME}: Description\""
print_info "  git push"
print_info "  # Create PR via GitHub UI or: gh pr create --base $BASE_BRANCH"
print_info ""
print_info "When done, remove worktree with:"
print_info "  cd $REPO_ROOT"
print_info "  git worktree remove $WORKTREE_PATH"

