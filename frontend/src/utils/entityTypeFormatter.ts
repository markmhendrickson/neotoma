/**
 * Entity Type Formatter Utility
 * 
 * Converts entity types to human-readable, plural format (sentence case)
 */

// Convert entity type to plural, human-readable format (sentence case)
export function formatEntityType(entityType: string): string {
  // Handle special cases
  const specialCases: Record<string, string> = {
    crypto_transaction: "Crypto transactions",
    tax_filing: "Tax filings",
    fixed_cost: "Fixed costs",
    daily_triage: "Daily triages",
  };

  if (specialCases[entityType]) {
    return specialCases[entityType];
  }

  // Convert snake_case to sentence case and pluralize
  const words = entityType.split("_");
  const lastWord = words[words.length - 1];
  
  // Simple pluralization rules
  let pluralLastWord = lastWord;
  if (lastWord.endsWith("y")) {
    pluralLastWord = lastWord.slice(0, -1) + "ies";
  } else if (lastWord.endsWith("s") || lastWord.endsWith("x") || lastWord.endsWith("z") || 
             lastWord.endsWith("ch") || lastWord.endsWith("sh")) {
    pluralLastWord = lastWord + "es";
  } else {
    pluralLastWord = lastWord + "s";
  }

  // Sentence case: capitalize first word only, lowercase the rest
  const formattedWords = words.map((word, index) => {
    if (index === words.length - 1) {
      const plural = pluralLastWord;
      if (index === 0) {
        // First and only word - capitalize first letter
        return plural.charAt(0).toUpperCase() + plural.slice(1);
      }
      // Last word in multi-word - lowercase
      return plural.toLowerCase();
    }
    if (index === 0) {
      // First word - capitalize first letter
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
    // Middle words - lowercase
    return word.toLowerCase();
  });

  return formattedWords.join(" ");
}
