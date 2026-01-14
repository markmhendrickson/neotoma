#!/bin/bash
# Create sample versions of parquet files with 50 records each
# Processes main parquet files (excluding snapshots and samples)

DATA_DIR="${DATA_DIR:-/Users/markmhendrickson/Documents/data}"
SAMPLE_SIZE=50

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

echo "Creating sample parquet files with $SAMPLE_SIZE records each..."
echo ""

success=0
skip=0
error=0

for file in "${FILES[@]}"; do
  source_path="$DATA_DIR/$file"
  sample_path="$DATA_DIR/${file%.parquet}_sample.parquet"
  
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
    print(f'  ✅ Created: $(basename \"$sample_path\") ({len(df_sample)} rows)')
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
