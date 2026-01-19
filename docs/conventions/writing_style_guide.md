# Neotoma Documentation Writing Style Guide
This guide defines writing style rules for all Neotoma documentation. Always apply these rules when creating or editing documentation.
## Purpose
This guide ensures consistent, professional technical writing that avoids AI-generated patterns and maintains clarity and precision across all Neotoma documentation.
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
❌ "Neotoma provides persistent structured memory—ensuring agents can access truth layer data—with full provenance tracking."
✅ "Neotoma provides persistent structured memory with full provenance tracking. Agents can access truth layer data via MCP."
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
**Example:**
❌ "Neotoma provides cross-platform memory that works with ChatGPT, Claude, Cursor, and other AI tools. Agents can access and update structured personal data regardless of platform. This dual-path ingestion supports both file uploads and agent interactions. Memory grows incrementally as agent usage scales. The system creates a persistent knowledge graph that survives individual conversations and tool sessions. Unlike provider memory, which is ephemeral and platform-locked, Neotoma's memory persists across all AI interactions. This makes it the foundation for agent-native personal computing."
✅ "Neotoma provides cross-platform memory that works with ChatGPT, Claude, Cursor, and other AI tools. Agents can access and update structured personal data regardless of platform. This dual-path ingestion supports both file uploads and agent interactions. Memory grows incrementally as agent usage scales. The system creates a persistent knowledge graph that survives individual conversations and tool sessions. Unlike provider memory, which is ephemeral and platform-locked, the system's memory persists across all AI interactions. This makes it the foundation for agent-native personal computing."
**Better example with formatting:**
✅ "Neotoma provides cross-platform memory that works with ChatGPT, Claude, Cursor, and other AI tools. The system enables the agentic web through several key capabilities:
- **Cross-platform access**: Agents can access and update structured personal data regardless of platform
- **Dual-path ingestion**: Supports both file uploads and agent interactions
- **Incremental growth**: Memory scales as agent usage increases
- **Persistent knowledge graph**: Survives individual conversations and tool sessions
Unlike provider memory, which is ephemeral and platform-locked, the system's memory persists across all AI interactions. This makes it the foundation for agent-native personal computing."
### Immediate Repetition of Proper Nouns
**NEVER use:**
- Repeating the same proper noun in consecutive sentences
- Starting multiple sentences with the same proper noun
- Overusing proper nouns when pronouns or descriptive terms would work
**Use instead:**
- Use pronouns (it, they, them) after first mention
- Use descriptive terms (the system, the platform, the service)
- Vary sentence structure to avoid repetitive openings
**Example:**
❌ "Neotoma provides cross-platform memory. Neotoma works with ChatGPT, Claude, and Cursor. Neotoma enables agents to access structured data."
✅ "Neotoma provides cross-platform memory. It works with ChatGPT, Claude, and Cursor. The system enables agents to access structured data."
❌ "MCP integration enables cross-platform access. MCP provides a standard protocol. MCP works with multiple AI tools."
✅ "MCP integration enables cross-platform access. The protocol provides a standard interface. It works with multiple AI tools."
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
**Example:**
❌ "The system provides entity resolution, timeline generation, structured extraction, and cross-platform access. These features enable agents to reason across personal data."
✅ "The system provides several key capabilities:
- **Entity resolution**: Deterministic hash-based canonical IDs
- **Timeline generation**: Automatic chronological ordering
- **Structured extraction**: Schema-first field extraction
- **Cross-platform access**: Works with all AI tools via MCP
These features enable agents to reason across personal data."
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
## Application Checklist
When writing or editing documentation, verify:
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
## Integration with Documentation Standards
This style guide complements `docs/conventions/documentation_standards.md`. Apply both:
- **Documentation Standards**: Structure, format, required sections, diagrams
- **Writing Style Guide**: Language patterns, punctuation, tone
Always load both documents when creating or editing documentation.
## Agent Instructions
### When to Load This Document
Load this document whenever:
- Creating new documentation
- Editing existing documentation
- Reviewing documentation for style consistency
### Required Co-Loaded Documents
- `docs/conventions/documentation_standards.md` (always)
- `docs/NEOTOMA_MANIFEST.md` (when creating new docs)
### Constraints Agents Must Enforce
1. No em dashes or en dashes anywhere in documentation
2. Use commas, periods, or colons instead of dashes
3. No conversational transitions or soft questions
4. No motivational language
5. Simple, declarative sentences with active voice
6. One idea per sentence
7. Keep paragraphs short (3-4 sentences, maximum 5)
8. Avoid immediate repetition of proper nouns in consecutive sentences
9. Use formatting techniques (lists, subheadings) for complex topics
10. Convert series of related points into lists when appropriate
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
- Immediate repetition of proper nouns in consecutive sentences
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
- [ ] No immediate repetition of proper nouns in consecutive sentences
