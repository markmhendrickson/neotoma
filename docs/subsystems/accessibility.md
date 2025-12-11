# Neotoma Accessibility (A11y)
*(Semantic HTML, Keyboard Navigation, ARIA, and Focus Management)*

---

## Purpose

Defines accessibility requirements for all UI components to ensure Neotoma is usable by everyone.

---

## Core Requirements

1. **Semantic HTML:** Use correct tags (`<button>`, `<nav>`, `<main>`, etc.)
2. **Keyboard navigation:** All interactive elements reachable via Tab
3. **Focus management:** Clear focus indicators, logical focus order
4. **ARIA attributes:** Where semantic HTML insufficient
5. **Contrast:** WCAG AA minimum (4.5:1 for text)

---

## Component-Level Rules

### Buttons
```tsx
// ✅ Good
<button onClick={handleClick}>Submit</button>

// ❌ Bad
<div onClick={handleClick}>Submit</div> // Not keyboard accessible
```

### Forms
```tsx
<label htmlFor="email">Email</label>
<input id="email" type="email" required aria-describedby="email-error" />
<span id="email-error" role="alert">Invalid email</span>
```

### Navigation
```tsx
<nav aria-label="Main navigation">
  <ul>
    <li><a href="/records">Records</a></li>
    <li><a href="/timeline">Timeline</a></li>
  </ul>
</nav>
```

---

## Testing

```typescript
// Automated A11y tests (jest-axe)
test('record list is accessible', async () => {
  const { container } = render(<RecordList />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

---

## Agent Instructions

Load when building UI components, forms, or interactive elements.

Required co-loaded: `docs/ui/dsl_spec.md`, `docs/ui/patterns/*.md`

Constraints:
- MUST use semantic HTML
- MUST support keyboard navigation
- MUST provide ARIA labels where needed
- MUST test with jest-axe













