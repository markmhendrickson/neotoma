# Style Guide

_(UI Copy Rules for Neotoma)_

## Purpose

This guide defines writing style rules for all Neotoma UI copy (labels, buttons, messages, placeholders, tooltips, errors, empty states). These rules ensure consistent, professional text that avoids AI-generated patterns and maintains clarity across all user-facing text.

This guide adapts `docs/conventions/writing_style_guide.md` for in-app text. Apply both when writing UI copy and documentation.

## Core Principles

1. **Direct and declarative**: Use simple, clear statements
2. **Active voice**: Prefer "The system processes files" over "Files are processed by the system"
3. **One idea per sentence**: Break complex thoughts into multiple sentences
4. **No AI-generated patterns**: Avoid machine-written stylistic quirks
5. **Professional tone**: Technical and precise, not conversational

## Prohibited Patterns

### Em Dashes and En Dashes

**NEVER use:**
- Em dashes (—)
- En dashes (–)

**Use instead:**
- Commas for appositives and lists: "files, records, and entities"
- Periods to separate ideas: "The system processes files. It then validates them."
- Colons to introduce lists or explanations: "Three steps: processing, validation, and storage"
- Standard hyphens (-) for compound words and ranges: "file-based", "v0.1.0-v0.2.0"

**Examples:**
❌ "Neotoma transforms fragmented personal data—connecting people, companies, and events—into a unified memory graph."
✅ "Neotoma transforms fragmented personal data into a unified memory graph. The graph connects people, companies, and events."

❌ "The system processes files—validates them—and stores records."
✅ "The system processes files, validates them, and stores records."

### Conversational Transitions

**NEVER use:**
- "Now, let's..."
- "So, you might..."
- "Interestingly..."
- "As you can see..."
- "Keep in mind that..."

**Use instead:**
- Direct statements without transition words
- "The system..." instead of "Now, the system..."
- Start with the subject directly

### Soft Questions and Offers

**NEVER use:**
- "Would you like to...?"
- "Have you considered...?"
- "Want to try...?"
- "Need help with...?"

**Use instead:**
- Direct instructions: "Use the `store_record` action to..."
- Declarative statements: "The system supports..."

### Motivational Language

**NEVER use:**
- "Get started!"
- "Try it now!"
- "You're all set!"
- "Ready to go!"
- "Let's dive in!"

**Use instead:**
- Neutral completion statements: "Setup is complete."
- Direct next steps: "Next, configure environment variables."

### Excessive Parentheticals

**NEVER use:**
- Multiple parenthetical asides in one sentence
- Long explanatory parentheticals that break flow

**Use instead:**
- Separate sentences for explanations
- Commas for brief clarifications

**Example:**
❌ "The system processes files (which can be PDFs, images, or documents) and extracts data (using deterministic rules) before storing records (in the PostgreSQL database)."
✅ "The system processes files. Supported formats include PDFs, images, and documents. It extracts data using deterministic rules and stores records in the PostgreSQL database."

### Redundant Qualifiers

**NEVER use:**
- "very", "quite", "rather", "somewhat", "pretty"
- "incredibly", "extremely", "highly"

**Use instead:**
- Direct adjectives: "fast" not "very fast"
- Specific measurements when available: "processes 100 files/second" not "very quickly"

### Complex Sentence Structures

**NEVER use:**
- Overly nested clauses
- Multiple dependent clauses in one sentence
- Sentences over 25 words

**Use instead:**
- Simple, short sentences (15-20 words)
- One idea per sentence
- Break complex thoughts into multiple sentences

### Long Paragraphs

**NEVER use:**
- Paragraphs over 5 sentences
- Dense blocks of text without breaks
- Multiple distinct ideas in one paragraph
- Long series of related points in paragraph form

**Use instead:**
- Short paragraphs (3-4 sentences, maximum 5)
- One main idea per paragraph
- Break long paragraphs into multiple focused paragraphs
- Use formatting techniques for complex topics: lists, subheadings, or structured sections
- Convert series of related points into bulleted or numbered lists
- Use lists when presenting multiple items, features, or concepts

**When to use formatting techniques:**
- **Lists**: When presenting 3+ related items, features, capabilities, or concepts
- **Subheadings**: When organizing multiple distinct topics or sections
- **Structured sections**: When breaking down complex explanations into digestible parts

### Immediate Repetition of Proper Nouns

**NEVER use:**
- Repeating the same proper noun in consecutive sentences
- Starting multiple consecutive sentences with the same proper noun
- Overusing proper nouns when pronouns or descriptive terms would work better

**Use instead:**
- Use the proper noun when needed for clarity, emphasis, or after a paragraph break
- Use pronouns (it, they, them) after first mention within the same paragraph
- Use descriptive terms (the system, the platform, the service) to vary sentence structure
- Vary sentence structure to avoid repetitive openings

**Guidelines for proper noun usage:**
- **Use the proper noun**: At the start of a new paragraph, when clarity is needed, or when emphasizing the subject
- **Use pronouns/descriptive terms**: Within the same paragraph after first mention, or when the subject is clear from context
- **Avoid**: Repeating the proper noun in consecutive sentences within the same paragraph

## Preferred Patterns

### Formatting Techniques

**Use formatting to improve readability:**
- **Lists**: Convert series of related points into bulleted or numbered lists
- **Subheadings**: Break long sections into focused subsections
- **Bold text**: Emphasize key terms or concepts (sparingly)
- **Structured sections**: Organize complex topics into digestible parts

**When to use lists:**
- Presenting 3+ related items, features, or capabilities
- Explaining multiple steps or components
- Comparing or contrasting multiple concepts
- Listing examples or use cases

### Punctuation

- **Commas**: For lists, appositives, and joining related clauses
- **Periods**: To end sentences and separate distinct ideas
- **Colons**: To introduce lists, explanations, or definitions
- **Semicolons**: Sparingly, only to connect closely related independent clauses
- **Hyphens**: For compound words (file-based, user-controlled) and ranges (v0.1.0-v0.2.0)

### List Formatting

**For descriptions after list items, use colons:**
✅
```
- **Structured extraction**: Deterministic field extraction from documents
- **Entity resolution**: Hash-based canonical IDs unify entities
```
❌
```
- **Structured extraction** — Deterministic field extraction from documents
- **Entity resolution** — Hash-based canonical IDs unify entities
```

### Sentence Structure

**Preferred:**
- Active voice: "The system validates input"
- Simple subject-verb-object structure
- Present tense for descriptions
- Past tense only for historical events or completed actions

**Example:**
✅ "The system processes files, validates them, and stores records."
❌ "Files are processed by the system (which validates them) and then stored in records—creating a unified memory graph."

## Context-Specific Guidelines

### Button Labels

**Prefer:**
- Imperative, verb-led: "Save", "Upload document", "Retry", "Cancel"
- Action-oriented: "Create source", "Delete entity", "Export data"

**Avoid:**
- Soft questions: "Would you like to save?"
- Noun-led actions: "Submit form" (prefer "Submit")
- Motivational language: "Get started!", "Try it now!"

### Error Messages

**Prefer:**
- Direct, actionable: "File too large. Maximum size 10 MB."
- Specific: "Invalid file format. Supported formats: PDF, PNG, JPG."
- Clear next steps: "Authentication failed. Check your credentials and try again."

**Avoid:**
- Generic: "Oops! Something went wrong. Please try again!"
- Motivational: "Don't worry, we'll fix this!"
- Soft questions: "Would you like to try again?"

### Empty States

**Prefer:**
- Neutral, factual: "No sources yet.", "No entities found.", "No timeline events."
- Brief, informative: "Upload your first document to get started."

**Avoid:**
- Motivational: "Get started! Upload your first file!"
- Conversational: "Looks like you haven't uploaded anything yet!"
- Soft questions: "Want to upload a file?"

### Placeholders

**Prefer:**
- Brief, example-style: "e.g. invoice.pdf", "Enter entity name"
- Clear, concise: "Search sources...", "Filter by type"

**Avoid:**
- Long explanations: "Enter your file name here (e.g. my file)"
- Conversational: "What would you like to search for?"
- Parentheticals: "File name (optional)"

### Tooltips

**Prefer:**
- One clear idea; no filler
- Brief explanations: "Deterministic hash-based ID"
- Actionable when relevant: "Click to view details"

**Avoid:**
- Long explanations or promotional text
- Conversational transitions
- Multiple ideas in one tooltip

### Success Messages

**Prefer:**
- Neutral completion: "Upload complete.", "Entity saved.", "Export started."
- Brief confirmation: "Source processed successfully."

**Avoid:**
- Motivational: "You're all set! Great job!"
- Conversational: "Awesome! Your file is ready!"
- Soft questions: "Want to view it now?"

### Form Labels

**Prefer:**
- Clear, concise: "Entity type", "Source name", "Date range"
- Descriptive: "Upload file", "Select format"

**Avoid:**
- Redundant qualifiers: "Very important field"
- Conversational: "What type of entity is this?"
- Long explanations in labels (use tooltips or help text)

### Navigation Labels

**Prefer:**
- Short, clear: "Sources", "Entities", "Timeline", "Settings"
- Consistent terminology: Use canonical terms from `docs/vocabulary/canonical_terms.md`

**Avoid:**
- Marketing language: "Explore", "Discover"
- Conversational: "Check out your sources"
- Inconsistent terms: Mixing "records" and "sources"

## Application Checklist

When writing or editing UI copy, verify:

- [ ] No em dashes (—) or en dashes (–)
- [ ] No conversational transitions ("Now, let's...", "So, you might...")
- [ ] No soft questions ("Would you like to...?", "Have you considered...?")
- [ ] No motivational language ("Get started!", "Try it now!")
- [ ] No excessive parentheticals
- [ ] No redundant qualifiers ("very", "quite", "rather")
- [ ] Simple, declarative sentences
- [ ] Active voice preferred
- [ ] One idea per sentence
- [ ] Colons used for list descriptions, not dashes
- [ ] Paragraphs are short (3-4 sentences, maximum 5)
- [ ] No immediate repetition of proper nouns in consecutive sentences
- [ ] Lists used for 3+ related items or concepts
- [ ] Formatting techniques applied where appropriate (lists, subheadings)
- [ ] Context-appropriate patterns (button labels imperative, error messages actionable, etc.)

## Integration with Documentation Standards

This style guide complements:
- **`docs/conventions/writing_style_guide.md`**: Full documentation writing rules (punctuation, sentence structure, list formatting, forbidden patterns)
- **`docs/conventions/documentation_standards.md`**: Documentation structure, format, required sections, diagrams
- **`docs/vocabulary/canonical_terms.md`**: Domain vocabulary and terminology

Apply all three when writing UI copy and documentation.

## Agent Instructions

### When to Load This Document

Load this document whenever:
- Writing or reviewing UI copy (labels, buttons, messages, placeholders, tooltips, errors, empty states)
- Creating new UI components with text content
- Editing existing UI components
- Reviewing UI copy for style consistency

### Required Co-Loaded Documents

- `docs/conventions/writing_style_guide.md` (always)
- `docs/conventions/documentation_standards.md` (when creating documentation)
- `docs/vocabulary/canonical_terms.md` (when using domain terminology)
- `docs/ui/design_system.md` (for design system context)

### Constraints Agents Must Enforce

1. No em dashes or en dashes anywhere in UI copy
2. Use commas, periods, or colons instead of dashes
3. No conversational transitions or soft questions
4. No motivational language
5. Simple, declarative sentences with active voice
6. One idea per sentence
7. Keep paragraphs short (3-4 sentences, maximum 5)
8. Avoid immediate repetition of proper nouns in consecutive sentences within the same paragraph
9. Use proper nouns when needed for clarity, emphasis, or at paragraph starts
10. Use formatting techniques (lists, subheadings) for complex topics
11. Convert series of related points into lists when appropriate
12. Apply context-specific guidelines (button labels imperative, error messages actionable, etc.)

### Forbidden Patterns

- Em dashes (—)
- En dashes (–)
- Conversational transitions
- Soft questions
- Motivational language
- Excessive parentheticals
- Redundant qualifiers
- Complex nested sentence structures
- Long paragraphs (over 5 sentences)
- Immediate repetition of proper nouns in consecutive sentences within the same paragraph
- Overusing proper nouns when pronouns or descriptive terms would work better
- Long series of related points in paragraph form (use lists instead)

### Validation Checklist

- [ ] No em dashes found (search for "—")
- [ ] No en dashes found (search for "–")
- [ ] No conversational transitions
- [ ] No soft questions
- [ ] No motivational language
- [ ] Simple, declarative sentences
- [ ] Active voice used
- [ ] Colons used for list descriptions
- [ ] Paragraphs are short (3-4 sentences, maximum 5)
- [ ] No immediate repetition of proper nouns in consecutive sentences within the same paragraph
- [ ] Proper nouns used appropriately (for clarity, emphasis, or at paragraph starts)
- [ ] Pronouns and descriptive terms used to vary sentence structure
- [ ] Lists used for 3+ related items or concepts
- [ ] Formatting techniques applied where appropriate
- [ ] Context-specific guidelines applied (button labels, error messages, empty states, etc.)

## Related Documents

- [`../design_system.md`](../design_system.md) - Design system index
- [`../../conventions/writing_style_guide.md`](../../conventions/writing_style_guide.md) - Full writing style guide
- [`../../conventions/documentation_standards.md`](../../conventions/documentation_standards.md) - Documentation standards
- [`../../vocabulary/canonical_terms.md`](../../vocabulary/canonical_terms.md) - Domain vocabulary
