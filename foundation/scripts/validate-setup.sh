#!/bin/bash
# Foundation Setup Validation Script
# Verifies foundation is properly installed and configured

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

print_success() {
    echo -e "${GREEN}✅${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️ ${NC} $1"
    ((WARNINGS++))
}

print_failure() {
    echo -e "${RED}❌${NC} $1"
    ((ERRORS++))
}

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_info "Validating foundation setup..."
echo ""

# Check 1: Foundation directory exists
if [ -d "foundation" ]; then
    print_success "Foundation directory exists"
else
    print_failure "Foundation directory not found"
fi

# Check 2: Foundation config exists
if [ -f "foundation-config.yaml" ]; then
    print_success "Foundation config file exists"
    
    # Check if config is still template
    if grep -q "your-project" foundation-config.yaml; then
        print_warning "Config appears to be template (contains 'your-project')"
        print_info "   Please customize foundation-config.yaml for your repository"
    fi
else
    print_failure "Foundation config file not found (foundation-config.yaml)"
fi

# Check 3: Check if foundation is a submodule
if [ -f "foundation/.git" ] && [ ! -d "foundation/.git" ]; then
    print_success "Foundation installed as git submodule"
elif [ -d "foundation/.git" ]; then
    print_warning "Foundation appears to be a full git repository (not a submodule)"
    print_info "   Consider using git submodule for easier updates"
elif [ -L "foundation" ]; then
    print_success "Foundation installed as symlink"
else
    print_warning "Foundation installation method unclear"
fi

# Check 4: Key foundation files exist
KEY_FILES=(
    "foundation/README.md"
    "foundation/conventions/code-conventions.md"
    "foundation/conventions/documentation-standards.md"
    "foundation/development/workflow.md"
    "foundation/config/foundation-config.yaml"
)

MISSING_FILES=0
for file in "${KEY_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        ((MISSING_FILES++))
    fi
done

if [ $MISSING_FILES -eq 0 ]; then
    print_success "All key foundation files present"
else
    print_failure "$MISSING_FILES key foundation files missing"
fi

# Check 5: Git configuration
if git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    print_success "Repository is a git repository"
else
    print_failure "Not in a git repository"
fi

# Check 6: .gitignore configuration
if [ -f ".gitignore" ]; then
    if grep -q "foundation-config.local.yaml" .gitignore; then
        print_success ".gitignore includes foundation-config.local.yaml"
    else
        print_warning ".gitignore should include foundation-config.local.yaml"
    fi
    
    if grep -q "\.env" .gitignore; then
        print_success ".gitignore includes .env files"
    else
        print_warning ".gitignore should include .env* files"
    fi
fi

# Check 7: Security setup
if [ -f "foundation/security/pre-commit-audit.sh" ]; then
    if [ -x "foundation/security/pre-commit-audit.sh" ]; then
        print_success "Pre-commit audit script is executable"
    else
        print_warning "Pre-commit audit script exists but is not executable"
        print_info "   Run: chmod +x foundation/security/pre-commit-audit.sh"
    fi
fi

# Summary
echo ""
echo "Validation complete:"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    print_success "All checks passed!"
elif [ $ERRORS -eq 0 ]; then
    print_warning "$WARNINGS warning(s) found"
    print_info "Setup is functional but could be improved"
else
    print_failure "$ERRORS error(s) and $WARNINGS warning(s) found"
    print_info "Please address errors before using foundation"
    exit 1
fi

exit 0

