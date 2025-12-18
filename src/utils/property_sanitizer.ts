/**
 * Sanitizes record property values to improve readability while preserving removed URLs.
 */

type Primitive = string | number | boolean | null | undefined;

interface SanitizedPrimitiveResult {
  value: Primitive | undefined;
  removedUrls: string[];
}

function sanitizePrimitive(value: Primitive): SanitizedPrimitiveResult {
  if (value === null || value === undefined) {
    return { value, removedUrls: [] };
  }

  if (typeof value !== "string") {
    return { value, removedUrls: [] };
  }

  let cleaned = value.trim();
  const removedUrls: string[] = [];

  cleaned = cleaned.replace(
    /\[([^\]]+)\]\((https?:\/\/(?:www\.)?notion\.so\/[^\s)]+)\)/gi,
    (_, label: string, url: string) => {
      removedUrls.push(url);
      return label;
    },
  );

  cleaned = cleaned.replace(
    /\s*\((https?:\/\/(?:www\.)?notion\.so\/[^\s)]+)\)\s*/gi,
    (_, url: string) => {
      removedUrls.push(url);
      return " ";
    },
  );

  cleaned = cleaned.replace(/\s+/g, " ").trim();

  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  if (!cleaned.length) {
    return { value: undefined, removedUrls };
  }

  return { value: cleaned, removedUrls };
}

export function sanitizePropertyValue(value: Primitive): Primitive {
  return sanitizePrimitive(value).value;
}

function mergeUrlValue(
  target: Record<string, unknown>,
  key: string,
  urls: string[],
  plural: boolean,
): void {
  if (!urls.length) return;
  const needsPlural = plural || urls.length > 1;
  const urlKey = `${key}${needsPlural ? "_urls" : "_url"}`;
  const incoming: unknown = needsPlural ? urls : urls[0];

  if (target[urlKey] === undefined) {
    target[urlKey] = incoming;
    return;
  }

  const ensureArray = (input: unknown): string[] =>
    Array.isArray(input) ? input : [input as string];
  const merged = new Set<string>(ensureArray(target[urlKey]));
  ensureArray(incoming).forEach((url) => merged.add(url));
  target[urlKey] = Array.from(merged);
}

export function sanitizeRecordProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (Array.isArray(value)) {
      const sanitizedItems: unknown[] = [];
      const collectedUrls: string[] = [];

      value.forEach((item) => {
        if (typeof item === "string") {
          const result = sanitizePrimitive(item);
          if (result.value !== undefined) {
            sanitizedItems.push(result.value);
          }
          collectedUrls.push(...result.removedUrls);
        } else if (Array.isArray(item)) {
          sanitizedItems.push(item);
        } else if (
          typeof item === "object" &&
          item !== null &&
          !(item instanceof Date)
        ) {
          sanitizedItems.push(
            sanitizeRecordProperties(item as Record<string, unknown>),
          );
        } else if (item !== undefined) {
          sanitizedItems.push(item);
        }
      });

      sanitized[key] = sanitizedItems;
      mergeUrlValue(sanitized, key, collectedUrls, true);
    } else if (
      typeof value === "object" &&
      value !== null &&
      !(value instanceof Date)
    ) {
      sanitized[key] = sanitizeRecordProperties(
        value as Record<string, unknown>,
      );
    } else {
      const result = sanitizePrimitive(value as Primitive);
      if (result.value !== undefined) {
        sanitized[key] = result.value;
      }
      mergeUrlValue(sanitized, key, result.removedUrls, false);
    }
  }

  return sanitized;
}
