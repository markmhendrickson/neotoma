#!/bin/bash
# Create sample versions of parquet files with 50 records each
# Stores samples in $DATA_DIR/samples/[entity_type].parquet to preserve entity type names
# Processes main parquet files (excluding snapshots and samples)

DATA_DIR="${DATA_DIR:-/Users/markmhendrickson/Documents/data}"
SAMPLES_DIR="$DATA_DIR/samples"
SAMPLE_SIZE=50

# Function to infer entity type from filename (matches parquet_reader.ts logic)
infer_entity_type() {
  local basename="$1"
  local name=$(echo "$basename" | tr '[:upper:]' '[:lower:]')
  
  # Remove common suffixes
  if [[ "$name" == *_missing_gid ]]; then
    name="${name%_missing_gid}"
  fi
  
  # Handle pluralization patterns (matches parquet_reader.ts)
  if [[ "$name" == *ies ]]; then
    # companies -> company, properties -> property
    echo "${name%ies}y"
  elif [[ "$name" == *sses ]] || [[ "$name" == *xes ]] || [[ "$name" == *ches ]] || [[ "$name" == *shes ]]; then
    # addresses -> address, taxes -> tax
    echo "${name%es}"
  elif [[ "$name" == *s ]]; then
    # transactions -> transaction, tasks -> task
    echo "${name%s}"
  else
    echo "$name"
  fi
}

# List of main parquet files to process
FILES=(
  "tax_events/tax_events.parquet"
  "research/research.parquet"
  "tasks/tasks_missing_gid.parquet"
  "tasks/tasks.parquet"
  "purchases/purchases.parquet"
  "crypto_transactions/crypto_transactions.parquet"
  "messages/messages.parquet"
  "user_accounts/user_accounts.parquet"
  "domains/domains.parquet"
  "tax_filings/tax_filings.parquet"
  "task_comments/task_comments.parquet"
  "goals/goals.parquet"
  "recurring_events/recurring_events.parquet"
)

# Create samples directory if it doesn't exist
mkdir -p "$SAMPLES_DIR"

echo "Creating sample parquet files with $SAMPLE_SIZE records each..."
echo "Samples will be stored in: $SAMPLES_DIR"
echo ""

success=0
skip=0
error=0

for file in "${FILES[@]}"; do
  source_path="$DATA_DIR/$file"
  
  # Extract basename and infer entity type
  basename=$(basename "$file" .parquet)
  entity_type=$(infer_entity_type "$basename")
  sample_path="$SAMPLES_DIR/${entity_type}.parquet"
  
  if [ ! -f "$source_path" ]; then
    echo "⚠️  File not found: $file"
    ((error++))
    continue
  fi
  
  if [ -f "$sample_path" ]; then
    echo "⏭️  Sample already exists: $(basename "$sample_path")"
    ((skip++))
    continue
  fi
  
  echo "Processing: $(basename "$file")"
  
  # Use Python to create sample
  python3 -c "
import pandas as pd
import sys
import os

try:
    source = '$source_path'
    sample = '$sample_path'
    
    # Check file size
    size_mb = os.path.getsize(source) / (1024 * 1024)
    if size_mb > 100:
        print(f'  ⚠️  File too large ({size_mb:.1f} MB), skipping')
        sys.exit(1)
    
    # Read and sample
    df = pd.read_parquet(source, engine='pyarrow')
    sample_size = min($SAMPLE_SIZE, len(df))
    df_sample = df.head(sample_size)
    
    if len(df_sample) == 0:
        print('  ⚠️  No rows found')
        sys.exit(1)
    
    # Write sample
    df_sample.to_parquet(sample, index=False, engine='pyarrow')
    entity_type = os.path.basename(sample).replace('.parquet', '')
    print(f'  ✅ Created: {os.path.basename(sample)} ({len(df_sample)} rows)')
    print(f'     Entity type: {entity_type}')
    sys.exit(0)
except Exception as e:
    print(f'  ❌ Error: {str(e)}')
    sys.exit(1)
" 2>&1
  
  if [ $? -eq 0 ]; then
    ((success++))
  else
    ((error++))
  fi
  echo ""
done

echo "✅ Complete!"
echo "   Created: $success"
echo "   Skipped: $skip"
echo "   Errors: $error"
