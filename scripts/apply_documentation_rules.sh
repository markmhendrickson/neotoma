#!/bin/bash
# Apply documentation rules from foundation/agent_instructions/cursor_rules/documentation_rules.md
# to all markdown files in docs/

set -e

DOCS_DIR="docs"
FILES_MODIFIED=0

# Function to apply rules to a single file
apply_rules() {
    local file="$1"
    local temp_file="${file}.tmp"
    local modified=0
    
    # Skip if file doesn't exist or is empty
    [ ! -f "$file" ] && return 0
    [ ! -s "$file" ] && return 0
    
    # Create temp file
    cp "$file" "$temp_file"
    
    # Remove "Related Documents" sections (case insensitive)
    if grep -qi "^## Related" "$temp_file" || grep -qi "^## See Also" "$temp_file"; then
        # Remove from "## Related" or "## See Also" to end of file or next ##
        perl -i -pe 'BEGIN{undef $/;} s/\n## (Related|See Also).*?(?=\n## |\Z)//gism' "$temp_file"
        modified=1
    fi
    
    # Remove "Purpose" sections that just repeat the title
    if grep -q "^## Purpose" "$temp_file" || grep -q "^### Purpose" "$temp_file"; then
        # Check if Purpose section is redundant (contains "This document" or "defines")
        if grep -A 3 "^## Purpose" "$temp_file" | grep -qi "this document\|defines\|establishes"; then
            # Remove Purpose section (from ## Purpose to next ## or ---)
            perl -i -pe 'BEGIN{undef $/;} s/\n## Purpose.*?(?=\n## |\n---|\Z)//gism' "$temp_file"
            perl -i -pe 'BEGIN{undef $/;} s/\n### Purpose.*?(?=\n## |\n### |\n---|\Z)//gism' "$temp_file"
            modified=1
        fi
    fi
    
    # Remove standalone separator lines (---) that aren't grouping distinct sections
    # Remove all standalone --- lines (they're usually unnecessary)
    perl -i -pe 's/^---\s*$//gm' "$temp_file"
    
    # Remove italicized subtitle lines like _(text)_ on their own line
    perl -i -pe 's/^_\([^)]+\)_\s*$//gm' "$temp_file"
    
    # Remove excessive blank lines (more than 2 consecutive)
    perl -i -pe 's/\n{4,}/\n\n\n/g' "$temp_file"
    
    # Remove blank lines at start of file
    perl -i -pe 's/^\n+//' "$temp_file"
    
    # Remove trailing blank lines (keep max 1)
    perl -i -pe 's/\n+$/\n/' "$temp_file"
    
    # Only replace original if modified
    if [ $modified -eq 1 ] || ! cmp -s "$file" "$temp_file"; then
        mv "$temp_file" "$file"
        echo "  ✓ Updated: $file"
        return 1
    else
        rm "$temp_file"
        return 0
    fi
}

# Find all markdown files and process them
echo "Applying documentation rules to all markdown files in $DOCS_DIR..."
echo ""

find "$DOCS_DIR" -name "*.md" -type f | while read -r file; do
    if apply_rules "$file"; then
        FILES_MODIFIED=$((FILES_MODIFIED + 1))
    fi
done

echo ""
echo "Documentation rules applied."
echo "Note: Manual review recommended for Purpose sections and Related Documents."

