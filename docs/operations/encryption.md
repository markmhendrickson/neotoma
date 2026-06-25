---
title: Encryption and Key Management
summary: Optional at-rest encryption, key sources, what is covered, and what to pair it with.
category: operations
audience: operator
visibility: public
order: 30
tags: [encryption, keys, security, privacy, operations]
---

# Encryption and Key Management

Neotoma can encrypt sensitive data at rest. Encryption is optional and off by default; the database and source files are otherwise stored in plaintext under your data directory.

## Enabling it

Set `NEOTOMA_ENCRYPTION_ENABLED=true` and provide a key from one of two sources:

- **Key file:** `NEOTOMA_KEY_FILE_PATH` points to a 32-byte key.
- **Mnemonic:** `NEOTOMA_MNEMONIC` (a BIP-39 phrase), optionally with `NEOTOMA_MNEMONIC_PASSPHRASE`.

From the root secret, Neotoma derives purpose-specific keys with HKDF (a data key for column encryption, a log key, an MCP auth token, and a signing identity), so a single key file or mnemonic backs all encrypted surfaces.

## What is encrypted

When enabled, sensitive content and metadata columns are encrypted with AES-256-GCM (a fresh IV per value, with an authentication tag). This covers the columns that hold observation fields, entity and relationship snapshots and their provenance, raw fragments, schema recommendation payloads, and similar. IDs, timestamps, hashes, signatures, `user_id`, and canonical names stay in plaintext because the deterministic engine and integrity chain depend on them.

## What is not yet covered

Some surfaces are not column-encrypted by default. The event log is encrypted only when `NEOTOMA_LOG_ENCRYPTION_ENABLED` is set, and embeddings are stored unencrypted for vector search. For full at-rest coverage, pair encryption with an encrypted volume (for example FileVault or LUKS) holding the data directory.

## Tokens

`NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY` encrypts stored MCP OAuth refresh tokens in hosted mode. Set it whenever you run OAuth so tokens are not persisted in plaintext.

## Operational notes

- Back up your key file or mnemonic separately from the data directory. Losing the key makes encrypted data unrecoverable.
- Encryption is a per-install decision; enable it before ingesting data you intend to keep encrypted.
- Verify the posture with `neotoma doctor`.

See [Privacy](../subsystems/privacy.md) and the security section of the [architecture doc](../architecture/architecture.md) for the broader model.
