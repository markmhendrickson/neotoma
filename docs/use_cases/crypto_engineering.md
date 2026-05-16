---
title: "AI-assisted crypto & security-sensitive engineering"
summary: "In codebases where a single vulnerability can result in catastrophic financial loss — smart contracts, cryptographic libraries, consensus implementations — AI-assisted development introduces a new audit requirement: understanding exactly..."
---

# AI-assisted crypto & security-sensitive engineering

In codebases where a single vulnerability can result in catastrophic financial loss — smart contracts, cryptographic libraries, consensus implementations — AI-assisted development introduces a new audit requirement: understanding exactly what the agent did, what it verified, what it skipped, and why. Neotoma provides agent-session replay, review-cost reduction, and bounty-report provenance by versioning every agent session, commit attribution, verification step, and security finding as immutable observations. This enables security teams to reconstruct the full agent decision chain behind any commit, reducing review burden while maintaining the audit trail that security-sensitive codebases demand.

## Entity examples

- `agent_session`
- `commit`
- `review`
- `security_finding`
- `bounty_report`

## Key question

> "Which agent wrote this commit, what did it verify, what did it skip, and why?"

## Data sources

- Agent session logs and tool-use traces
- Git commit metadata and diffs
- Code review comments and approvals
- Static analysis and security scanner outputs
- Bug bounty submissions and triage records
- CI/CD pipeline results and test coverage reports

## Activation skills

| Skill | Role |
|-------|------|
| `remember-codebase` | Captures agent sessions, commits, and code review context |
| `store-data` | Persists structured security findings and bounty reports |

## External tools

- GitHub / GitLab APIs for commit and review data
- Security scanning tools (Semgrep, CodeQL, Slither for Solidity)
- Bug bounty platforms (Immunefi, HackerOne)
- CI/CD systems for pipeline and coverage data
