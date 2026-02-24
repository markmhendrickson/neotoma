#!/bin/bash
# Move all *_rules.mdc and *_rules.md from docs/ to .cursor/rules/ with "_rules" suffix removed from filename.
set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
mkdir -p .cursor/rules
MOVED=0
while IFS= read -r -d '' f; do
  rel="${f#docs/}"
  dir=$(dirname "$rel")
  base=$(basename "$f")
  base_no_ext="${base%.*}"
  name="${base_no_ext%_rules}"
  ext="${base##*.}"
  prefix=$(echo "$dir" | tr '/' '_')
  if [ -z "$prefix" ] || [ "$prefix" = "." ]; then
    dest=".cursor/rules/${name}.${ext}"
  else
    dest=".cursor/rules/${prefix}_${name}.${ext}"
  fi
  cp "$f" "$dest" && rm "$f" && echo "Moved $f -> $dest" && MOVED=$((MOVED+1))
done < <(find docs -maxdepth 4 -type f \( -name '*_rules.mdc' -o -name '*_rules.md' \) -print0)
echo "MOVED_COUNT=$MOVED"
ls .cursor/rules/
