#!/usr/bin/env bash
# Deprecated: use run_neotoma_mcp_unsigned_stdio_dev_shim.sh (same behavior).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/run_neotoma_mcp_unsigned_stdio_dev_shim.sh" "$@"
