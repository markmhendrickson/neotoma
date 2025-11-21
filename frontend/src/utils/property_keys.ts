/**
 * Humanizes property keys by converting snake_case, camelCase, or kebab-case
 * to a human-readable format (e.g., "full_name" -> "Full Name").
 * This matches the backend implementation for consistency.
 */
export function humanizePropertyKey(key: string): string {
  if (!key || typeof key !== 'string') {
    return key;
  }

  // Handle already humanized keys (contains spaces and capital letters)
  if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(key)) {
    return key;
  }

  // Split on underscores, hyphens, or camelCase boundaries
  const parts = key
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase -> camel Case
    .replace(/[_-]+/g, ' ') // underscores/hyphens -> spaces
    .split(/\s+/)
    .filter(Boolean);

  // Capitalize first letter of each word
  return parts
    .map((part) => {
      if (!part) return '';
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

