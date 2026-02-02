/**
 * Schema Icon Service
 * 
 * Automatically generates icons for entity schemas by:
 * 1. Matching entity types to Lucide icons using AI semantic matching
 * 2. Generating custom SVG icons when no good match exists
 * 3. Caching icon mappings to avoid redundant AI calls
 */

import OpenAI from "openai";
import { config } from "../config.js";
import type { IconMetadata, SchemaMetadata } from "./schema_registry.js";
import { 
  ALL_LUCIDE_ICONS, 
  getSuggestedIcon, 
  isValidLucideIcon 
} from "../utils/lucide_icons.js";

const openai = config.openaiApiKey
  ? new OpenAI({ apiKey: config.openaiApiKey })
  : null;

// In-memory cache for icon mappings
const iconCache = new Map<string, IconMetadata>();

/**
 * Generate icon metadata for an entity type
 */
export async function generateIconForEntityType(
  entityType: string,
  metadata?: SchemaMetadata
): Promise<IconMetadata> {
  // Check if icon generation is enabled
  if (!config.iconGeneration.enabled) {
    return getDefaultIcon();
  }
  
  // Check cache first
  const cacheKey = `${entityType}:${metadata?.description || ""}`;
  if (iconCache.has(cacheKey)) {
    return iconCache.get(cacheKey)!;
  }
  
  try {
    // Try pattern-based matching first (fast, no AI)
    const suggestedIcon = getSuggestedIcon(entityType);
    if (suggestedIcon) {
      const iconMetadata: IconMetadata = {
        icon_type: "lucide",
        icon_name: suggestedIcon,
        confidence: 0.95, // High confidence for pattern matches
        generated_at: new Date().toISOString(),
      };
      iconCache.set(cacheKey, iconMetadata);
      return iconMetadata;
    }
    
    // Use AI to match to Lucide icon
    if (openai) {
      const match = await matchLucideIcon(entityType, metadata?.description || "", metadata?.category);
      
      if (match && match.confidence >= config.iconGeneration.confidenceThreshold) {
        const iconMetadata: IconMetadata = {
          icon_type: "lucide",
          icon_name: match.iconName,
          confidence: match.confidence,
          generated_at: new Date().toISOString(),
        };
        iconCache.set(cacheKey, iconMetadata);
        return iconMetadata;
      }
      
      // Generate custom SVG if no good match
      const svg = await generateCustomSVGIcon(entityType, metadata?.description || "");
      const iconMetadata: IconMetadata = {
        icon_type: "svg",
        icon_name: "custom",
        icon_svg: svg,
        confidence: 0.7, // Lower confidence for generated icons
        generated_at: new Date().toISOString(),
      };
      iconCache.set(cacheKey, iconMetadata);
      return iconMetadata;
    }
    
    // Fallback to default icon
    return getDefaultIcon();
  } catch (error) {
    console.error(`[ICON_SERVICE] Failed to generate icon for ${entityType}:`, error);
    return getDefaultIcon();
  }
}

/**
 * Match entity type to a Lucide icon using AI
 */
async function matchLucideIcon(
  entityType: string,
  description: string,
  category?: string
): Promise<{ iconName: string; confidence: number } | null> {
  if (!openai) {
    return null;
  }
  
  const prompt = `You are an icon matching expert. Match the entity type to the most appropriate Lucide icon.

Entity Type: ${entityType}
Description: ${description || "No description"}
Category: ${category || "general"}

Available Lucide Icons:
${ALL_LUCIDE_ICONS.join(", ")}

Instructions:
1. Choose the most semantically relevant icon for this entity type
2. Consider the entity's purpose and typical usage
3. Prefer simple, recognizable icons over complex ones
4. Return confidence score (0-1) based on semantic fit

Respond with ONLY a JSON object in this exact format:
{
  "iconName": "IconName",
  "confidence": 0.95,
  "reasoning": "Brief explanation"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: config.iconGeneration.model,
      temperature: 0.1, // Low temperature for consistent matching
      max_tokens: 150,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are an expert at matching entity types to appropriate icons." },
        { role: "user", content: prompt },
      ],
    });
    
    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return null;
    }
    
    const parsed = JSON.parse(content);
    
    // Validate response
    if (!parsed.iconName || typeof parsed.confidence !== "number") {
      console.error("[ICON_SERVICE] Invalid AI response:", parsed);
      return null;
    }
    
    // Validate icon name exists
    if (!isValidLucideIcon(parsed.iconName)) {
      console.warn(`[ICON_SERVICE] AI suggested invalid icon: ${parsed.iconName}`);
      return null;
    }
    
    return {
      iconName: parsed.iconName,
      confidence: parsed.confidence,
    };
  } catch (error) {
    console.error("[ICON_SERVICE] Failed to match Lucide icon:", error);
    return null;
  }
}

/**
 * Generate custom SVG icon using AI
 */
async function generateCustomSVGIcon(
  entityType: string,
  description: string
): Promise<string> {
  if (!openai) {
    return getDefaultSVG();
  }
  
  const prompt = `Generate a minimal, line-based SVG icon for the following entity type. The icon should match the Lucide icon aesthetic: simple, clean lines with 1.5-2px stroke width.

Entity Type: ${entityType}
Description: ${description || "No description"}

Requirements:
- 24x24 viewBox
- Stroke-based (no fills except for small details)
- Stroke width: 1.5-2px
- Minimal, recognizable design
- Single color (currentColor for stroke)
- No text or labels
- Clean, professional appearance

Respond with ONLY the SVG code, no additional text or explanations. The SVG should be complete and ready to use.`;

  try {
    const response = await openai.chat.completions.create({
      model: config.iconGeneration.model,
      temperature: 0.3,
      max_tokens: 500,
      messages: [
        { role: "system", content: "You are an expert SVG icon designer. Generate clean, minimal SVG icons." },
        { role: "user", content: prompt },
      ],
    });
    
    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return getDefaultSVG();
    }
    
    // Extract SVG from response (in case there's extra text)
    const svgMatch = content.match(/<svg[^>]*>[\s\S]*<\/svg>/i);
    if (!svgMatch) {
      console.warn("[ICON_SERVICE] No SVG found in AI response");
      return getDefaultSVG();
    }
    
    return svgMatch[0];
  } catch (error) {
    console.error("[ICON_SERVICE] Failed to generate custom SVG:", error);
    return getDefaultSVG();
  }
}

/**
 * Get default icon metadata (fallback)
 */
function getDefaultIcon(): IconMetadata {
  return {
    icon_type: "lucide",
    icon_name: "File", // Generic file icon as default
    confidence: 0.5,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Get default SVG (fallback)
 */
function getDefaultSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
  <polyline points="14 2 14 8 20 8"/>
</svg>`;
}

/**
 * Clear icon cache
 */
export function clearIconCache(): void {
  iconCache.clear();
}

/**
 * Check if icon generation is available
 */
export function isIconGenerationAvailable(): boolean {
  return config.iconGeneration.enabled && openai !== null;
}
