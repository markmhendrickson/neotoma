#!/bin/bash
# Pre-Commit Security Audit Script
# Configurable security checks before committing changes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration (override with environment variables or config file)
PROTECTED_PATHS="${PROTECTED_PATHS:-docs/private/|data/}"
PROTECTED_PATTERNS="${PROTECTED_PATTERNS:-\.env|secrets|credentials}"

echo -e "${GREEN}🔒 Running pre-commit security audit...${NC}"

# Check 1: Protected directories
echo "Checking protected directories..."
if git status --porcelain | grep -E "^[AM]|^\?\?" | grep -qE "$PROTECTED_PATHS"; then
    echo -e "${RED}❌ SECURITY VIOLATION: Files in protected directories detected!${NC}"
    echo "Files:"
    git status --porcelain | grep -E "^[AM]|^\?\?" | grep -E "$PROTECTED_PATHS"
    exit 1
fi

if git diff --cached --name-only 2>/dev/null | grep -qE "$PROTECTED_PATHS"; then
    echo -e "${RED}❌ SECURITY VIOLATION: Protected files already staged!${NC}"
    echo "Files:"
    git diff --cached --name-only | grep -E "$PROTECTED_PATHS"
    exit 1
fi

# Check 2: Protected file patterns (e.g., .env files)
echo "Checking for protected file patterns..."
if git status --porcelain | grep -qE "$PROTECTED_PATTERNS"; then
    echo -e "${RED}❌ SECURITY VIOLATION: Protected file patterns detected!${NC}"
    git status --porcelain | grep -E "$PROTECTED_PATTERNS"
    exit 1
fi

if git diff --cached --name-only 2>/dev/null | grep -qE "$PROTECTED_PATTERNS"; then
    echo -e "${RED}❌ SECURITY VIOLATION: Protected file patterns already staged!${NC}"
    git diff --cached --name-only | grep -E "$PROTECTED_PATTERNS"
    exit 1
fi

# Check 3: Hardcoded credentials (basic check)
echo "Scanning for potential hardcoded credentials..."
STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || echo "")
if [ -n "$STAGED_FILES" ]; then
    for file in $STAGED_FILES; do
        if [ -f "$file" ] && file "$file" | grep -q "text"; then
            if grep -qE "(api[_-]?key|password|secret|token)\s*[:=]\s*['\"][^'\"]{10,}" "$file" 2>/dev/null; then
                echo -e "${YELLOW}⚠️  WARNING: Potential hardcoded credentials detected in: $file${NC}"
                echo "Please review this file before committing."
                # Don't exit, just warn (can be configured to exit 1)
            fi
        fi
    done
fi

echo -e "${GREEN}✅ Security audit passed${NC}"
exit 0

