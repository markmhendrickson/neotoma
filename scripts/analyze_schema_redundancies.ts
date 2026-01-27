/**
 * Schema Redundancy Analysis Script
 *
 * Analyzes all entity schemas for potential duplicates, redundancies, and consolidation opportunities.
 *
 * Run: npx tsx scripts/analyze_schema_redundancies.ts
 */

import { ENTITY_SCHEMAS } from "../src/services/schema_definitions.js";

interface SchemaInfo {
  type: string;
  label: string;
  description: string;
  category: string;
  aliases: string[];
  fieldCount: number;
  fields: string[];
}

console.log("=== Schema Redundancy Analysis ===\n");

const schemas: SchemaInfo[] = Object.values(ENTITY_SCHEMAS).map((schema) => ({
  type: schema.entity_type,
  label: schema.metadata?.label || "No label",
  description: schema.metadata?.description || "No description",
  category: schema.metadata?.category || "unknown",
  aliases: schema.metadata?.aliases || [],
  fieldCount: Object.keys(schema.schema_definition.fields).length,
  fields: Object.keys(schema.schema_definition.fields).filter(
    (f) => f !== "schema_version" && !f.startsWith("import_")
  ),
}));

console.log(`Total schemas: ${schemas.length}\n`);

// 1. Group by category
console.log("=== By Category ===\n");
const byCategory: Record<string, SchemaInfo[]> = {};
for (const schema of schemas) {
  if (!byCategory[schema.category]) {
    byCategory[schema.category] = [];
  }
  byCategory[schema.category].push(schema);
}

for (const [category, types] of Object.entries(byCategory)) {
  console.log(`${category.toUpperCase()} (${types.length} types):`);
  types.forEach((t) => console.log(`  - ${t.type}: ${t.description}`));
  console.log("");
}

// 2. Check for duplicate aliases
console.log("=== Alias Analysis ===\n");
const aliasMap: Record<string, string[]> = {};
for (const schema of schemas) {
  for (const alias of schema.aliases) {
    if (!aliasMap[alias]) {
      aliasMap[alias] = [];
    }
    aliasMap[alias].push(schema.type);
  }
}

const duplicateAliases = Object.entries(aliasMap).filter(
  ([_, types]) => types.length > 1
);
if (duplicateAliases.length > 0) {
  console.log("⚠️  Duplicate aliases (same alias for multiple types):\n");
  duplicateAliases.forEach(([alias, types]) => {
    console.log(`  "${alias}": ${types.join(", ")}`);
  });
  console.log("");
} else {
  console.log("✓ No duplicate aliases\n");
}

// 3. Find similar descriptions
console.log("=== Similar Descriptions ===\n");
const descriptionWords: Record<string, string[]> = {};
for (const schema of schemas) {
  const words = schema.description
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4 && !["tracking", "records"].includes(w));
  for (const word of words) {
    if (!descriptionWords[word]) {
      descriptionWords[word] = [];
    }
    descriptionWords[word].push(schema.type);
  }
}

const commonWords = Object.entries(descriptionWords)
  .filter(([_, types]) => types.length > 2)
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 10);

console.log("Common description words (potential semantic overlap):\n");
for (const [word, types] of commonWords) {
  console.log(`  "${word}" (${types.length}): ${types.join(", ")}`);
}
console.log("");

// 4. Potential redundancies
console.log("=== Potential Redundancies ===\n");

const potentialIssues: Array<{ issue: string; types: string[]; reason: string }> = [];

// Check for overlapping concepts
const taskRelated = schemas.filter((s) => s.type.startsWith("task"));
if (taskRelated.length > 1) {
  potentialIssues.push({
    issue: "Task-related types",
    types: taskRelated.map((s) => s.type),
    reason: "Multiple task-related schemas (task + task_attachment + task_comment + task_dependency + task_story). Consider if all are needed or if some could be consolidated.",
  });
}

const habitRelated = schemas.filter((s) => s.type.startsWith("habit"));
if (habitRelated.length > 1) {
  potentialIssues.push({
    issue: "Habit-related types",
    types: habitRelated.map((s) => s.type),
    reason: "Multiple habit-related schemas. Consider if habit_completion and habit_objective should be separate types or properties on habit.",
  });
}

// Check for similar field structures
const accountRelated = schemas.filter(
  (s) =>
    s.fields.includes("account_id") ||
    s.fields.includes("origin_account") ||
    s.fields.includes("destination_account")
);
if (accountRelated.length > 3) {
  potentialIssues.push({
    issue: "Account-referencing types",
    types: accountRelated.map((s) => s.type),
    reason: `${accountRelated.length} types reference accounts. Verify these represent truly distinct concepts.`,
  });
}

// Check for contact/person/company overlap
const contactTypes = schemas.filter((s) =>
  ["contact", "person", "company", "address", "location"].includes(s.type)
);
if (contactTypes.length > 0) {
  potentialIssues.push({
    issue: "Contact/Identity types",
    types: contactTypes.map((s) => s.type),
    reason: "Multiple identity-related types. Verify: contact vs person vs company distinctions are clear. Address and location may overlap.",
  });
}

// Check for purchase/transaction/order overlap
const purchaseTypes = schemas.filter((s) =>
  ["purchase", "transaction", "order", "receipt"].includes(s.type)
);
if (purchaseTypes.length > 0) {
  potentialIssues.push({
    issue: "Purchase/Transaction types",
    types: purchaseTypes.map((s) => s.type),
    reason: "Multiple purchase-related types. Verify clear distinctions: transaction (bank feed), purchase (planned buy), order (trading), receipt (proof of purchase).",
  });
}

// Check for message/email/note overlap
const messageTypes = schemas.filter((s) =>
  ["message", "email", "note", "document"].includes(s.type)
);
if (messageTypes.length > 0) {
  potentialIssues.push({
    issue: "Message/Communication types",
    types: messageTypes.map((s) => s.type),
    reason: "Multiple communication types. Verify: email vs message distinction, note vs document distinction.",
  });
}

// Check for exercise/workout overlap
const exerciseTypes = schemas.filter((s) =>
  ["exercise", "workout"].includes(s.type)
);
if (exerciseTypes.length > 1) {
  potentialIssues.push({
    issue: "Exercise/Workout types",
    types: exerciseTypes.map((s) => s.type),
    reason: "Both exercise and workout exist. Consider: exercise = single activity, workout = combination? Clarify distinction.",
  });
}

// Check for strategy/process overlap
const strategyTypes = schemas.filter((s) =>
  ["strategy", "process", "goal", "outcome"].includes(s.type)
);
if (strategyTypes.length > 0) {
  potentialIssues.push({
    issue: "Strategy/Planning types",
    types: strategyTypes.map((s) => s.type),
    reason: "Multiple planning types. Verify distinctions: strategy (high-level), process (operational), goal (target), outcome (result).",
  });
}

if (potentialIssues.length > 0) {
  for (const issue of potentialIssues) {
    console.log(`⚠️  ${issue.issue}:`);
    console.log(`   Types: ${issue.types.join(", ")}`);
    console.log(`   Reason: ${issue.reason}`);
    console.log("");
  }
} else {
  console.log("✓ No obvious redundancies detected\n");
}

// 5. Summary statistics
console.log("=== Summary Statistics ===\n");
console.log(`Total schemas: ${schemas.length}`);
console.log(`Categories: ${Object.keys(byCategory).length}`);
console.log(`Average fields per schema: ${Math.round(schemas.reduce((sum, s) => sum + s.fieldCount, 0) / schemas.length)}`);
console.log(`Total aliases: ${schemas.reduce((sum, s) => sum + s.aliases.length, 0)}`);
console.log(`Duplicate aliases: ${duplicateAliases.length}`);
console.log("");

// 6. Category distribution
console.log("Category distribution:");
for (const [cat, types] of Object.entries(byCategory)) {
  console.log(`  ${cat}: ${types.length} types (${Math.round((types.length / schemas.length) * 100)}%)`);
}
