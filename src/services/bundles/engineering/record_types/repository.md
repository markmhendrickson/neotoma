# `repository`

**Bundle:** `engineering` · **Schema version:** 1.0

A source-code repository.

The schema file `../schemas/repository.ts` is authoritative; this page describes it.

## Identity

Canonical name rules, in order: (`full_name`), then `url`, then `name`. When no rule matches, the resolver falls back to name-like fields.

## Fields

| Field       | Type   | Required | Description                                                  |
| ----------- | ------ | -------- | ------------------------------------------------------------ |
| `name`      | string | no       | Repository name, e.g. 'neotoma'.                             |
| `full_name` | string | no       | Owner-qualified slug, e.g. 'owner/repo'.                     |
| `url`       | string | no       | Canonical web or clone URL.                                  |
| `platform`  | string | no       | Hosting platform, e.g. github, gitlab.                       |
| `path`      | string | no       | Local checkout path, when the repository is tracked locally. |
| `language`  | string | no       | Primary language.                                            |
| `status`    | string | no       | e.g. active, archived.                                       |

## Usage notes

Describes the repository itself. CI runs, commits, and chat turns are separate types; do not store them as `repository`.
