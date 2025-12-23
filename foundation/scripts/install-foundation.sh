#!/bin/bash
# Foundation Installation Script
# Sets up foundation in a consuming repository

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

# Parse arguments
FOUNDATION_REPO=""
INSTALL_METHOD="submodule"  # or "symlink", "copy"
FOUNDATION_PATH="foundation"

show_help() {
    cat << EOF
Usage: ./install-foundation.sh [OPTIONS] <foundation-repo>

Installs the foundation into a consuming repository.

OPTIONS:
    -h, --help              Show this help message
    -m, --method <method>   Installation method: submodule (default), symlink, copy
    -p, --path <path>       Foundation path (default: foundation)

EXAMPLES:
    # Install as git submodule (recommended)
    ./install-foundation.sh ../foundation

    # Install as git submodule from remote
    ./install-foundation.sh https://github.com/user/foundation.git

    # Install as symlink (for local development)
    ./install-foundation.sh -m symlink ../foundation

    # Install as copy (for modification)
    ./install-foundation.sh -m copy ../foundation
EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -m|--method)
            INSTALL_METHOD="$2"
            shift 2
            ;;
        -p|--path)
            FOUNDATION_PATH="$2"
            shift 2
            ;;
        *)
            if [ -z "$FOUNDATION_REPO" ]; then
                FOUNDATION_REPO="$1"
            else
                print_error "Unknown argument: $1"
                show_help
                exit 1
            fi
            shift
            ;;
    esac
done

# Validate arguments
if [ -z "$FOUNDATION_REPO" ]; then
    print_error "Foundation repository path/URL is required"
    show_help
    exit 1
fi

# Check if we're in a git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    print_error "Not in a git repository"
    exit 1
fi

print_info "Installing foundation..."
print_info "Source: $FOUNDATION_REPO"
print_info "Method: $INSTALL_METHOD"
print_info "Path: $FOUNDATION_PATH"

# Install based on method
case $INSTALL_METHOD in
    submodule)
        print_info "Adding as git submodule..."
        git submodule add "$FOUNDATION_REPO" "$FOUNDATION_PATH"
        git submodule update --init --recursive
        print_info "✅ Foundation added as submodule"
        ;;
    
    symlink)
        print_info "Creating symlink..."
        if [ -e "$FOUNDATION_PATH" ]; then
            print_error "Path already exists: $FOUNDATION_PATH"
            exit 1
        fi
        ln -s "$FOUNDATION_REPO" "$FOUNDATION_PATH"
        print_info "✅ Foundation symlinked"
        ;;
    
    copy)
        print_info "Copying foundation..."
        if [ -e "$FOUNDATION_PATH" ]; then
            print_error "Path already exists: $FOUNDATION_PATH"
            exit 1
        fi
        cp -r "$FOUNDATION_REPO" "$FOUNDATION_PATH"
        print_info "✅ Foundation copied"
        ;;
    
    *)
        print_error "Unknown installation method: $INSTALL_METHOD"
        exit 1
        ;;
esac

# Generate default config if it doesn't exist
if [ ! -f "foundation-config.yaml" ]; then
    print_info "Generating foundation-config.yaml..."
    if [ -f "$FOUNDATION_PATH/config/foundation-config.yaml" ]; then
        cp "$FOUNDATION_PATH/config/foundation-config.yaml" ./foundation-config.yaml
        print_info "✅ Config file created: foundation-config.yaml"
        print_warn "Please customize foundation-config.yaml for your repository"
    else
        print_warn "Foundation config template not found"
    fi
fi

# Create .gitignore entries if needed
if [ -f ".gitignore" ]; then
    if ! grep -q "^foundation-config.local.yaml$" .gitignore 2>/dev/null; then
        echo "" >> .gitignore
        echo "# Foundation local overrides" >> .gitignore
        echo "foundation-config.local.yaml" >> .gitignore
        print_info "✅ Added foundation config to .gitignore"
    fi
fi

print_info ""
print_info "✅ Foundation installation complete!"
print_info ""
print_info "Next steps:"
print_info "  1. Customize foundation-config.yaml for your repository"
print_info "  2. Run ./foundation/scripts/validate-setup.sh to verify installation"
print_info "  3. See foundation/README.md for usage documentation"

