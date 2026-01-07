#!/bin/bash
# Script to apply file naming convention to docs directory
# Converts kebab-case to snake_case and uppercase to lowercase (except README/CHANGELOG)

set -e

DOCS_DIR="docs"

# Function to rename file and update references
rename_file() {
    local old_path="$1"
    local new_path="$2"
    local old_name=$(basename "$old_path")
    local new_name=$(basename "$new_path")
    
    if [ "$old_path" = "$new_path" ]; then
        return 0
    fi
    
    echo "Renaming: $old_path -> $new_path"
    
    # Rename the file
    git mv "$old_path" "$new_path" 2>/dev/null || mv "$old_path" "$new_path"
    
    # Update references in all markdown files
    find "$DOCS_DIR" -type f -name "*.md" -exec sed -i '' "s|$old_name|$new_name|g" {} +
    find "$DOCS_DIR" -type f -name "*.yaml" -exec sed -i '' "s|$old_name|$new_name|g" {} +
    find "$DOCS_DIR" -type f -name "*.yml" -exec sed -i '' "s|$old_name|$new_name|g" {} +
    
    # Update references with relative paths
    local old_rel_path="${old_path#$DOCS_DIR/}"
    local new_rel_path="${new_path#$DOCS_DIR/}"
    find "$DOCS_DIR" -type f -name "*.md" -exec sed -i '' "s|$old_rel_path|$new_rel_path|g" {} +
}

# Files with dashes (kebab-case) - excluding FU-XXX pattern
echo "=== Renaming files with dashes (kebab-case) ==="
find "$DOCS_DIR" -type f -name "*.md" | while read file; do
    # Skip FU-XXX files (feature unit IDs use dashes intentionally)
    if [[ "$file" =~ FU-[0-9] ]]; then
        continue
    fi
    
    if [[ "$file" =~ - ]]; then
        new_file=$(echo "$file" | sed 's/-/_/g')
        rename_file "$file" "$new_file"
    fi
done

# Files with uppercase (except README/CHANGELOG and specs/)
echo "=== Renaming files with uppercase ==="
find "$DOCS_DIR" -type f -name "*.md" | while read file; do
    # Skip README and CHANGELOG (special files allowed uppercase)
    basename_file=$(basename "$file")
    if [[ "$basename_file" == "README.md" ]] || [[ "$basename_file" == "CHANGELOG.md" ]]; then
        continue
    fi
    
    # Skip specs/ directory (legacy uppercase convention)
    if [[ "$file" =~ ^docs/specs/ ]]; then
        continue
    fi
    
    # Check if filename has uppercase
    if [[ "$basename_file" =~ [A-Z] ]]; then
        dir=$(dirname "$file")
        new_basename=$(echo "$basename_file" | tr '[:upper:]' '[:lower:]')
        new_file="$dir/$new_basename"
        rename_file "$file" "$new_file"
    fi
done

echo "=== File naming convention applied ==="


