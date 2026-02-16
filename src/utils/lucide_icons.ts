/**
 * Lucide Icons Utility
 * 
 * Provides list of available Lucide icons and validation utilities.
 * Used by SchemaIconService for icon matching.
 */

/**
 * Common Lucide icon names relevant for entity schemas
 * Organized by category for easier semantic matching
 */
export const LUCIDE_ICONS = {
  // Financial
  financial: [
    "DollarSign",
    "CreditCard",
    "Wallet",
    "Receipt",
    "FileText", // invoice
    "TrendingUp",
    "TrendingDown",
    "PiggyBank",
    "Coins",
    "Banknote",
    "Calculator",
    "ChartLine",
    "ChartBar",
    "BarChart",
  ],
  
  // Productivity
  productivity: [
    "CheckSquare", // task
    "Calendar",
    "Clock",
    "ListTodo",
    "ClipboardCheck",
    "Briefcase",
    "FileCheck",
    "Target",
    "Flag",
    "Star",
  ],
  
  // People & Organizations
  people: [
    "User",
    "Users",
    "Building",
    "Building2",
    "Home",
    "MapPin",
    "Mail",
    "Phone",
    "Contact",
  ],
  
  // Documents & Files
  documents: [
    "File",
    "FileText",
    "FileImage",
    "FileClock",
    "FileSearch",
    "FileSpreadsheet",
    "FileType",
    "Paperclip",
    "Folder",
  ],
  
  // Health & Wellness
  health: [
    "Heart",
    "Activity",
    "Pill",
    "Stethoscope",
    "HeartPulse",
    "Dumbbell",
    "Apple",
  ],
  
  // Media & Content
  media: [
    "Image",
    "Video",
    "Music",
    "Film",
    "Camera",
    "Mic",
    "Book",
    "Newspaper",
  ],
  
  // Travel & Location
  travel: [
    "Plane",
    "Car",
    "Train",
    "Ship",
    "MapPin",
    "Map",
    "Globe",
    "Compass",
  ],
  
  // Shopping & E-commerce
  shopping: [
    "ShoppingCart",
    "ShoppingBag",
    "Package",
    "Box",
    "Tag",
    "Store",
  ],
  
  // Communication
  communication: [
    "MessageSquare",
    "Mail",
    "Phone",
    "Send",
    "MessageCircle",
    "Bell",
  ],
  
  // Data & Tech
  data: [
    "Database",
    "Server",
    "HardDrive",
    "Cloud",
    "Link",
    "Code",
    "Terminal",
  ],
} as const;

/**
 * Flattened list of all available icon names
 */
export const ALL_LUCIDE_ICONS = Object.values(LUCIDE_ICONS).flat();

/**
 * Check if an icon name is valid
 */
export function isValidLucideIcon(iconName: string): boolean {
  return ALL_LUCIDE_ICONS.includes(iconName as any);
}

/**
 * Get icon names for a specific category
 */
export function getIconsByCategory(
  category: "finance" | "productivity" | "knowledge" | "health" | "media"
): readonly string[] {
  switch (category) {
    case "finance":
      return LUCIDE_ICONS.financial;
    case "productivity":
      return LUCIDE_ICONS.productivity;
    case "health":
      return LUCIDE_ICONS.health;
    case "media":
      return LUCIDE_ICONS.media;
    case "knowledge":
      return [...LUCIDE_ICONS.documents, ...LUCIDE_ICONS.data];
    default:
      return [];
  }
}

/**
 * Get common entity type to icon mappings
 * These are high-confidence matches that don't require AI
 */
export const ENTITY_TYPE_ICON_MAP: Record<string, string> = {
  // Financial
  invoice: "FileText",
  receipt: "Receipt",
  transaction: "DollarSign",
  payment: "CreditCard",
  expense: "Wallet",
  income: "TrendingUp",
  holding: "PiggyBank",
  account: "Banknote",
  budget: "Calculator",
  contract: "FileCheck",
  
  // Productivity
  task: "CheckSquare",
  project: "Briefcase",
  event: "Calendar",
  meeting: "Users",
  goal: "Target",
  milestone: "Flag",
  
  // People & Organizations
  person: "User",
  contact: "Contact",
  company: "Building2",
  organization: "Building",
  team: "Users",
  location: "MapPin",
  
  // Documents
  document: "File",
  note: "FileText",
  file: "File",
  attachment: "Paperclip",
  
  // Health
  workout: "Dumbbell",
  meal: "Apple",
  health_record: "HeartPulse",
  
  // Media
  photo: "Image",
  video: "Video",
  music: "Music",
  book: "Book",
  
  // Travel
  flight: "Plane",
  trip: "MapPin",
  hotel: "Building",
  
  // Shopping
  order: "ShoppingCart",
  product: "Package",
  purchase: "ShoppingBag",
  
  // Communication
  message: "MessageSquare",
  email: "Mail",
  call: "Phone",
};

/**
 * Get a suggested icon for an entity type based on common patterns
 * Returns null if no high-confidence match
 */
export function getSuggestedIcon(entityType: string): string | null {
  // Direct match
  if (ENTITY_TYPE_ICON_MAP[entityType]) {
    return ENTITY_TYPE_ICON_MAP[entityType];
  }
  
  // Pattern matching (people before document so "user_profile" matches User not File)
  const type = entityType.toLowerCase();

  // Financial patterns
  if (type.includes("payment") || type.includes("transaction")) {
    return "DollarSign";
  }
  if (type.includes("invoice") || type.includes("bill")) {
    return "FileText";
  }
  if (type.includes("receipt")) {
    return "Receipt";
  }

  // People patterns (before document so user_profile, contact_info match User)
  if (type.includes("person") || type.includes("user") || type.includes("contact")) {
    return "User";
  }
  if (type.includes("company") || type.includes("organization")) {
    return "Building2";
  }

  // Document patterns (after people so "profile" in user_profile does not match file)
  if (type.includes("document") || type === "file" || /\bfile\b/.test(type)) {
    return "File";
  }
  if (type.includes("note")) {
    return "FileText";
  }

  return null;
}
