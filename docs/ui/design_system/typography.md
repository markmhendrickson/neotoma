# Typography

## Font Families

**Primary (UI):**

```yaml
sans_serif: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
```

- **Rationale:** Inter is widely used in professional tools (Linear, Notion, GitHub); excellent readability; neutral aesthetic

**Monospace (Data/Code):**

```yaml
monospace: "'JetBrains Mono', 'Fira Code', 'Roboto Mono', 'Courier New', monospace"
```

- **Rationale:** JetBrains Mono preferred by developers; Fira Code for ligatures; fallbacks for system fonts

## Type Scale

**Headings:**

```yaml
h1:
  font_size: "2rem" # 32px
  font_weight: "700"
  line_height: "1.2"
  letter_spacing: "-0.02em"
h2:
  font_size: "1.5rem" # 24px
  font_weight: "600"
  line_height: "1.3"
  letter_spacing: "-0.01em"
h3:
  font_size: "1.25rem" # 20px
  font_weight: "600"
  line_height: "1.4"
h4:
  font_size: "1rem" # 16px
  font_weight: "600"
  line_height: "1.5"
```

**Body:**

```yaml
body:
  font_size: "0.9375rem" # 15px (slightly smaller for density)
  font_weight: "400"
  line_height: "1.6"
body_large:
  font_size: "1rem" # 16px
  font_weight: "400"
  line_height: "1.6"
small:
  font_size: "0.8125rem" # 13px
  font_weight: "400"
  line_height: "1.5"
```

**Monospace (Data Display):**

```yaml
mono:
  font_size: "0.875rem" # 14px
  font_weight: "400"
  line_height: "1.5"
  letter_spacing: "0"
```

## Typography Usage

- **Headings:** Use sparingly; only for major sections
- **Body:** Default for all UI text; comfortable reading size
- **Small:** Metadata, timestamps, labels, secondary information
- **Monospace:** Source IDs, entity IDs, observation IDs, timestamps, code snippets, extracted field values

## UI Copy Style

UI copy (labels, buttons, messages, placeholders, tooltips, errors) MUST follow consistent, professional text style. See [Style Guide](./style_guide.md) for complete UI copy rules.

## Related Documents

- [`../design_system.md`](../design_system.md) - Design system index
- [`./style_guide.md`](./style_guide.md) - UI copy style guide
- [`../../conventions/writing_style_guide.md`](../../conventions/writing_style_guide.md) - Full documentation writing style guide
