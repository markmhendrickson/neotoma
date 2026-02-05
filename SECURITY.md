# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.2.x   | Yes       |
| < 0.2   | No        |

## Reporting a Vulnerability

If you discover a security vulnerability in Neotoma, please report it privately. **Do not open a public issue.**

- **Preferred:** Open a [GitHub Security Advisory](https://github.com/markmhendrickson/neotoma/security/advisories/new) (draft) or contact the maintainers via the repository.
- **Response time:** We aim to respond within 48 hours.
- **Include:** Description of the vulnerability, steps to reproduce, potential impact, and suggested fix (if any).

## Security Model

Neotoma implements defense-in-depth:

- **Row-level security (RLS)** on all tables
- **OAuth 2.0 with PKCE** for MCP authentication (recommended)
- **Audit trail** for data operations
- **User-controlled data** with export and deletion
- **End-to-end encryption** planned (v2.0.0)

See [Auth](docs/subsystems/auth.md) and [Privacy](docs/subsystems/privacy.md) for details.

## Security Best Practices

When deploying or developing Neotoma:

1. Use OAuth for MCP (not session tokens).
2. Verify RLS and configuration: `npm run doctor`.
3. Keep storage buckets private when using Supabase.
4. Rotate service keys regularly.
5. Never commit `.env` or credentials.
6. Use HTTPS for all API endpoints.

See [Getting started](docs/developer/getting_started.md) for secure setup.
