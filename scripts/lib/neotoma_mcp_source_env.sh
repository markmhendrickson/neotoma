#!/usr/bin/env bash
# Shared env sourcing for Neotoma MCP launcher scripts under scripts/.
# Prerequisites: REPO_ROOT must be set to the repository root (absolute path)
# before sourcing this file.

: "${REPO_ROOT:?neotoma_mcp_source_env.sh requires REPO_ROOT to be set}"

for _neotoma_mcp_envfile in "${REPO_ROOT}/.env.dev" "${REPO_ROOT}/.env" "${REPO_ROOT}/.env.development"; do
  if [ -f "${_neotoma_mcp_envfile}" ]; then
    set -a
    # shellcheck disable=SC1090
    source "${_neotoma_mcp_envfile}"
    set +a
    break
  fi
done

unset _neotoma_mcp_envfile
