#!/bin/bash
# Set local git identity to castor-agent for the current repo/worktree.
# Run this in any worktree where agents will be committing.
# Does NOT affect global git config — scoped to the repo only.

set -e

AGENT_NAME="castor-agent"
AGENT_EMAIL="markmhendrickson+castor-agent@gmail.com"

git config user.name "$AGENT_NAME"
git config user.email "$AGENT_EMAIL"

echo "Git identity set:"
echo "  user.name  = $(git config user.name)"
echo "  user.email = $(git config user.email)"
