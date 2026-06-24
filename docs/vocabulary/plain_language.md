# Neotoma in five words — a plain-language primer

A re-readable cheat-sheet for the core Neotoma primitives. Keep it open while you build. For the precise, formal definitions (and forbidden synonyms), see [canonical_terms.md](./canonical_terms.md).

**The whole model in one sentence:** you store _facts_ (**observations**) about _things_ (**records / entities**); every fact traces back to where it came from (a **source**), sometimes via a structured reading of that source (an **interpretation**); and things connect to each other through typed links (**relationships**). Those five building blocks are what "**primitive**" means — the kinds of thing Neotoma is made of.

## The five (plus one) in plain language

| Term | Plain meaning | Everyday analogy |
| --- | --- | --- |
| **Record / Entity** | A thing you track — a person, a project, a PDF. "Record" and "entity" are the same thing; "entity" is just the type name. | A contact card in your phone. |
| **Observation** | One fact about a record, at one moment, with who said it. A record is _computed_ from its observations — you don't edit it directly. | A single journal line: "On May 8, Jeroen said X." |
| **Source** | The raw artifact a fact came from — a file, an email, a transcript. | The original PDF in your drawer. |
| **Interpretation** | A structured reading pulled out of a source (e.g. parsing a PDF into fields). Keeps the link back to the source. | Your highlighter notes on the PDF. |
| **Relationship** | A typed link between two records — `PART_OF`, `REFERS_TO`, `DEPENDS_ON`. | An arrow on a whiteboard between two cards. |

## "You say → Neotoma says"

You don't have to adopt new words to use Neotoma. Map your own:

- "entity" → **record** (interchangeable — use whichever feels natural)
- "a fact / a note about something" → **observation**
- "the original file / where it came from" → **source**
- "a structured version of that file" → **interpretation**
- "a long-standing rule" → just a **record** of a type _you choose_; the system doesn't care what you name the type
- "a link / connection between two things" → a typed **relationship**

## Two things that trip people up

- **You add, you don't overwrite.** To change a record, you add an observation (or a `correct`-ion at higher priority) and the record recomputes. History is never lost, and you can ask "what did this look like on date X?". So you never have to "keep it tidy" by deleting — see [what_to_store.md](../foundation/what_to_store.md).
- **Any type you like.** "In the realm of entity types, you can do whatever you want." The type name is yours; the mechanics (observations → computed record, provenance, dedup) are identical no matter what you call it.
