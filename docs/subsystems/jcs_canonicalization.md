# JCS canonicalisation (RFC 8785) and cross-language vectors
## Scope
This document covers:
- The shared canonicaliser in `src/shared/jcs.ts`: its accepted value domain, its refusals, and its serialisation rules
- The committed cross-language vector file `tests/fixtures/jcs_vectors.json`: its format, its pinned hash, and how a suite in another language consumes it

This document does NOT cover:
- Any digest construction built on top of the canonicaliser (a later change defines which values are hashed)
- Timestamp or other value normalisation that happens before canonicalisation
- Parsing of untrusted JSON text, including duplicate-key detection (see [Duplicate keys](#duplicate-keys))

## Purpose
Two implementations in different languages must produce byte-identical canonical JSON for the same logical value, so that a digest computed in one can be recomputed in the other. `canonicalise` produces that text for a deliberately small value domain; the vector file lets a second implementation prove it agrees.

## Invariants
1. Same value yields the same output, independent of object key insertion order.
2. A value outside the domain is refused with a typed `JcsError`; it is never coerced, dropped or defaulted.
3. Error messages never contain the offending value or key.
4. The vector file is pinned by hash (below); a change to it requires a deliberate update of that hash and of every consumer's pin.

## Definitions
- **Domain**: strings, booleans, `null`, arrays, plain objects, and integers within +/-(2^53 - 1).
- **UTF-16 order**: keys are ordered by their UTF-16 code units (RFC 8785 section 3.2.3). For characters outside the Basic Multilingual Plane this differs from code point order: U+10000 (code units `D800 DC00`) sorts before U+FFFD, but after it by code point. Sorting by code point (the default of Python's `sort_keys`, and of many other languages) is the classic cross-language failure the vectors are built to catch.

## Rules
Serialisation:
- No whitespace between tokens.
- Strings: `"` and `\` are backslash-escaped; `\b \f \n \r \t` use the short forms; every other control character below U+0020 is `\u00xx` with lowercase hex. Nothing else is escaped: `/`, U+007F, U+2028 and U+2029 stay literal and non-ASCII text is emitted raw. No Unicode normalisation is applied to keys or values.
- Integers: plain decimal text with no exponent and no leading `+`. `-0` serialises as `0`.
- Arrays keep their order. Object members are ordered by key in UTF-16 order.

Refusals (`JcsError.code`):

| Code | Cause |
| --- | --- |
| `non_finite_number` | NaN, Infinity, -Infinity |
| `non_integer_number` | any number with a fractional part |
| `integer_out_of_range` | an integer whose magnitude exceeds 2^53 - 1 |
| `lone_surrogate` | an unpaired UTF-16 surrogate in a string value or an object key |
| `unsupported_type` | undefined, bigint, function, symbol, sparse array hole, accessor property, symbol-keyed property |
| `non_plain_object` | Date, Map, Set, class instance, boxed primitive, typed array |
| `cycle` | an object or array that contains itself |
| `depth_exceeded` | nesting deeper than 256 |

A language without a distinct integer type (or whose JSON parser maps `1.0` and `1e2` to a float) will refuse inputs that JavaScript parses as the integers `1` and `100`. The vector file therefore avoids inputs whose number type is parser-dependent, and a consumer must treat any number it receives as a float as a refusal.

### Duplicate keys
A parsed JavaScript object cannot hold two members with the same name, so `canonicalise` has nothing to detect. Whatever parses untrusted JSON text must refuse duplicate member names before canonicalising. Keys that merely look alike (for example a precomposed and a decomposed accent, or a key with a trailing space) are distinct and are both kept; the vectors include such pairs.

## Vector file
Path: `tests/fixtures/jcs_vectors.json`. A JSON array of entries:

```json
{ "name": "…", "input_json_text": "…", "canonical": "…", "sha256": "…" }
```

- `input_json_text` is the input as TEXT, so each language parses it with its own JSON parser.
- `canonical` is the exact expected canonical text, and `sha256` is the lowercase hex SHA-256 of its UTF-8 bytes.
- A rejection entry carries `"canonical": null`, `"sha256": null` and `"reject": "<code>"`. The code is the JavaScript error code and is informational for other languages: the consumer must refuse the input, whatever it names the failure.
- The file is ASCII only (all non-ASCII text is `\u` escaped), so it is immune to encoding and normalisation differences in transit.

Coverage includes the RFC 8785 section 3.2.3 sorting example and the integer-free part of the section 3.2.2 string example, UTF-16 versus code point key ordering (including astral keys, nested), every escape form, all control characters, U+2028 and U+2029, integer bounds, empty containers, nesting depth, no-normalisation key pairs, three digest-shaped examples using the key set `grant_id, owner_user_id, match_thumbprint, match_sub, match_iss, valid_from, valid_until, capability` with synthetic values, and the rejection cases above.

Vector file sha256: `778e7d66a0f7a1c4c6cf9c661b097fa3959ceabf076bb80f5837d1e05e5e8a80`

## Consuming the vectors from another language
Pin the hash above in the consumer's suite, fail if the vendored file's SHA-256 differs, then for each entry:

1. Parse `input_json_text` with the language's JSON parser (rejecting any float).
2. If the entry has `reject`, assert the canonicaliser refuses the value.
3. Otherwise assert the canonical text equals `canonical` exactly, and the SHA-256 of its UTF-8 bytes equals `sha256`.

A Python canonicaliser must order keys by `key.encode("utf-16-be", "surrogatepass")` rather than by `sorted(keys)`, and must escape with `ensure_ascii=False` semantics plus the lowercase `\u00xx` rule above.

The Neotoma suite (`tests/unit/jcs.test.ts`) runs every entry, asserts the pinned hash against this document, and includes a mutation check showing that a code-point-sorting canonicaliser goes red on the non-BMP vectors.

## Testing requirements
- `npx vitest run tests/unit/jcs.test.ts`
- Updating the vector file requires regenerating the hash in this document; the unit test fails until both agree.

## Agent instructions
Load this document before changing `src/shared/jcs.ts` or `tests/fixtures/jcs_vectors.json`. Do not widen the domain (floats, bigint, normalisation, key coercion) without a design decision, because every consumer's digest depends on identical behaviour. Never edit the vector file without updating the pinned hash here and noting that downstream pins must move.
