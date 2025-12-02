## Neotoma — Truth Layer for AI Memory

Neotoma is a **deterministic, structured memory substrate** that transforms fragmented personal documents into AI-ready knowledge.

### What It Does

Ingests PDFs and images → Extracts structured fields → Identifies entities → Builds timelines → Exposes to AI via MCP

### Quick Links

- **[MVP Overview](docs/specs/MVP_OVERVIEW.md)** — Product specification
- **[Interactive Prototype](docs/prototypes/)** — Demo all MVP features
- **[Architecture](docs/architecture/architecture.md)** — System design
- **[Getting Started](docs/developer/getting_started.md)** — Development setup

### Interactive Prototype

Complete demonstration of all MVP feature units with static fixtures:

```bash
npm run dev:prototype
```

See [`docs/prototypes/`](docs/prototypes/) for full documentation.

### Development

```bash
# Install dependencies
npm install

# Run development server (main app)
npm run dev:ui

# Run backend server
npm run dev:http

# Run full stack
npm run dev:full

# Run prototype
npm run dev:prototype
```

### Documentation

- **Specifications**: [`docs/specs/`](docs/specs/)
- **Architecture**: [`docs/architecture/`](docs/architecture/)
- **Subsystems**: [`docs/subsystems/`](docs/subsystems/)
- **UI Design**: [`docs/ui/`](docs/ui/)
- **Prototypes**: [`docs/prototypes/`](docs/prototypes/)

### Core Principles

1. **Deterministic** — Same input → same output, always
2. **Schema-first** — Type-driven extraction, not freeform
3. **Explainable** — Every field traces to source
4. **Entity-unified** — Canonical IDs across documents
5. **Timeline-aware** — Automatic chronological ordering
6. **AI-ready** — MCP-exposed structured memory

### License

MIT
