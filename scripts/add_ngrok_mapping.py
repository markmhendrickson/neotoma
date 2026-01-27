#!/usr/bin/env python3
"""Add ngrok authtoken mapping to env_var_mappings parquet file via MCP server."""

import os
import sys
import asyncio
import json
from pathlib import Path

# Try to import MCP client
try:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
except ImportError:
    print("Error: MCP library not installed. Install with: pip install mcp")
    sys.exit(1)

# Get paths from environment or use defaults
PARQUET_MCP_SERVER_PATH = os.getenv(
    "PARQUET_MCP_SERVER_PATH",
    "/Users/markmhendrickson/repos/personal/truth/mcp-servers/parquet/parquet_mcp_server.py"
)
PARQUET_MCP_PYTHON = os.getenv(
    "PARQUET_MCP_PYTHON",
    "/Users/markmhendrickson/repos/personal/execution/venv/bin/python3"
)
DATA_DIR = os.getenv(
    "DATA_DIR",
    "/Users/markmhendrickson/Library/Mobile Documents/com~apple~CloudDocs/Documents/data"
)

async def add_ngrok_mapping():
    """Add NGROK_AUTHTOKEN mapping to env_var_mappings."""
    
    # Check if Python executable exists
    if not Path(PARQUET_MCP_PYTHON).exists():
        print(f"Error: Python executable not found: {PARQUET_MCP_PYTHON}")
        print("Please set PARQUET_MCP_PYTHON environment variable to correct path")
        return False
    
    # Check if MCP server script exists
    if not Path(PARQUET_MCP_SERVER_PATH).exists():
        print(f"Error: MCP server script not found: {PARQUET_MCP_SERVER_PATH}")
        print("Please set PARQUET_MCP_SERVER_PATH environment variable to correct path")
        return False
    
    server_params = StdioServerParameters(
        command=PARQUET_MCP_PYTHON,
        args=[PARQUET_MCP_SERVER_PATH],
        env={"DATA_DIR": DATA_DIR}
    )
    
    try:
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                # Add the mapping
                result = await session.call_tool("add_record", {
                    "data_type": "env_var_mappings",
                    "record": {
                        "env_var": "NGROK_AUTHTOKEN",
                        "op_reference": "op://Private/ngrok Ngrok/authtoken – neotoma (development)",
                        "vault": "Private",
                        "item_name": "ngrok Ngrok",
                        "field_label": "authtoken – neotoma (development)",
                        "service": "ngrok",
                        "is_optional": True,
                        "environment_based": True,
                        "environment_key": "development",
                        "notes": "ngrok authtoken for development environment HTTPS tunneling"
                    }
                })
                
                if result.isError:
                    print(f"Error adding mapping: {result.content}")
                    return False
                
                print("✓ Successfully added NGROK_AUTHTOKEN mapping to env_var_mappings")
                print(f"  Environment variable: NGROK_AUTHTOKEN")
                print(f"  1Password reference: op://Private/ngrok Ngrok/authtoken – neotoma (development)")
                print(f"  Service: ngrok")
                print(f"  Environment: development")
                print("\nNext steps:")
                print("  1. Run: npm run sync:env (or bash scripts/sync-env-from-1password.sh)")
                print("  2. Verify NGROK_AUTHTOKEN is synced to .env")
                return True
                
    except Exception as e:
        print(f"Error connecting to MCP server: {e}")
        print("\nTroubleshooting:")
        print(f"  1. Check Python path: {PARQUET_MCP_PYTHON}")
        print(f"  2. Check MCP server path: {PARQUET_MCP_SERVER_PATH}")
        print(f"  3. Check DATA_DIR: {DATA_DIR}")
        return False

if __name__ == "__main__":
    success = asyncio.run(add_ngrok_mapping())
    sys.exit(0 if success else 1)
