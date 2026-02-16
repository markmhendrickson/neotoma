#!/usr/bin/env tsx
// List all entities from Neotoma database
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// Load production environment
dotenv.config({ path: join(projectRoot, ".env.production") });
dotenv.config({ path: join(projectRoot, ".env") });

const supabaseUrl = process.env.SUPABASE_URL || `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co`;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function listEntities() {
  // Query entities table
  const { data, error } = await supabase
    .from("entities")
    .select("id, entity_type, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Error fetching entities:", error);
    process.exit(1);
  }

  console.log(`\nFound ${data?.length || 0} entities:\n`);

  // Group by entity_type
  const grouped = (data || []).reduce((acc, entity) => {
    if (!acc[entity.entity_type]) {
      acc[entity.entity_type] = [];
    }
    acc[entity.entity_type].push(entity);
    return acc;
  }, {} as Record<string, any[]>);

  // Print summary
  Object.entries(grouped).forEach(([type, entities]) => {
    console.log(`${type}: ${entities.length}`);
  });

  console.log(`\n${"=".repeat(80)}\n`);

  // Print details
  (data || []).forEach((entity) => {
    console.log(`ID: ${entity.id}`);
    console.log(`Type: ${entity.entity_type}`);
    console.log(`Created: ${entity.created_at}`);
    console.log(`Updated: ${entity.updated_at}`);
    console.log("-".repeat(80));
  });
}

listEntities().catch(console.error);
