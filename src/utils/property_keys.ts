/**
 * Humanizes property keys by converting snake_case, camelCase, or kebab-case
 * to a human-readable format (e.g., "full_name" -> "Full Name").
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

/**
 * Humanizes all property keys in a record's properties object.
 * Preserves nested objects and arrays, only transforming top-level keys.
 */
export function humanizePropertyKeys(
  properties: Record<string, unknown>
): Record<string, unknown> {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return properties;
  }

  const result: Record<string, unknown> = {};
  const seenHumanized = new Map<string, string>();

  for (const [key, value] of Object.entries(properties)) {
    const humanized = humanizePropertyKey(key);

    // Handle collisions: if humanized key already exists, append original key
    if (result[humanized] !== undefined && seenHumanized.get(humanized) !== key) {
      // Collision detected - keep original key to avoid data loss
      result[key] = value;
    } else {
      result[humanized] = value;
      seenHumanized.set(humanized, key);
    }
  }

  return result;
}

