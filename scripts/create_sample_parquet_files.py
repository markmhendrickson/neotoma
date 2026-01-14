#!/usr/bin/env python3
"""
Create sample versions of all parquet files with 50 records each

Reads each parquet file, takes first 50 rows, and writes to a sample file
Sample files are saved in the same directory with "_sample" suffix
"""

import os
import sys
from pathlib import Path
import pandas as pd

DATA_DIR = os.getenv("DATA_DIR", "/Users/markmhendrickson/Documents/data")
SAMPLE_SIZE = 50

def find_parquet_files(root_dir):
    """Find all parquet files in root_dir, excluding samples and snapshots"""
    files = []
    root_path = Path(root_dir)
    
    for parquet_file in root_path.rglob("*.parquet"):
        # Skip sample files and snapshots
        if "_sample" in parquet_file.name or "snapshots" in str(parquet_file):
            continue
        
        sample_path = parquet_file.parent / parquet_file.name.replace(".parquet", "_sample.parquet")
        
        files.append({
            "source": parquet_file,
            "sample": sample_path,
            "name": parquet_file.name
        })
    
    return files

def create_sample_file(source_path, sample_path):
    """Create a sample parquet file with first 50 rows"""
    try:
        # Check file size first - skip if too large (might be corrupted or problematic)
        file_size_mb = source_path.stat().st_size / (1024 * 1024)
        if file_size_mb > 100:  # Skip files larger than 100MB
            print(f"  ⚠️  Skipping {source_path.name}: file too large ({file_size_mb:.1f} MB)")
            return False
        
        # Read parquet file with timeout protection
        print(f"    Reading {source_path.name} ({file_size_mb:.2f} MB)...")
        df = pd.read_parquet(source_path, engine='pyarrow')
        
        print(f"    File has {len(df)} rows, taking first {min(SAMPLE_SIZE, len(df))}...")
        
        # Take first 50 rows (or all if less than 50)
        sample_size = min(SAMPLE_SIZE, len(df))
        df_sample = df.head(sample_size)
        
        if len(df_sample) == 0:
            print(f"  ⚠️  Skipping {source_path.name}: no rows found")
            return False
        
        # Write sample file
        print(f"    Writing sample to {sample_path.name}...")
        df_sample.to_parquet(sample_path, index=False, engine='pyarrow')
        
        print(f"  ✅ Created sample: {sample_path.name} ({len(df_sample)} rows)")
        return True
    except pd.errors.ParquetFileException as e:
        print(f"  ❌ Error reading parquet {source_path.name}: {str(e)}")
        return False
    except Exception as e:
        print(f"  ❌ Error processing {source_path.name}: {str(e)}")
        return False

def main():
    import sys
    
    # Allow limiting number of files for testing
    max_files = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else None
    
    print(f"Finding parquet files in {DATA_DIR}...")
    files = find_parquet_files(DATA_DIR)
    
    if max_files:
        files = files[:max_files]
        print(f"Limiting to first {max_files} files for testing...")
    
    print(f"Found {len(files)} parquet files")
    print(f"Creating sample files with {SAMPLE_SIZE} records each...\n")
    
    success_count = 0
    skip_count = 0
    error_count = 0
    
    for i, file_info in enumerate(files, 1):
        # Check if sample already exists
        if file_info["sample"].exists():
            print(f"[{i}/{len(files)}] ⏭️  Skipping {file_info['name']}: sample already exists")
            skip_count += 1
            continue
        
        print(f"[{i}/{len(files)}] Processing: {file_info['name']}")
        try:
            if create_sample_file(file_info["source"], file_info["sample"]):
                success_count += 1
            else:
                error_count += 1
        except KeyboardInterrupt:
            print("\n\n⚠️  Interrupted by user")
            break
        except Exception as e:
            print(f"  ❌ Fatal error: {str(e)}")
            error_count += 1
    
    print(f"\n✅ Complete!")
    print(f"   Processed: {len(files)} files")
    print(f"   Created: {success_count} sample files")
    print(f"   Skipped: {skip_count} (already exist)")
    print(f"   Errors: {error_count}")

if __name__ == "__main__":
    main()
