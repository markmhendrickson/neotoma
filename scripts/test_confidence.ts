import { SchemaRecommendationService } from '../src/services/schema_recommendation.js';

const service = new SchemaRecommendationService();

async function testConfidence() {
  const fields = [
    'created_at',
    'updated_at',
    'task_id',
    'urgency',
    'recurrence',
    'parent_task_id',
    'project_ids',
    'assignee_gid',
  ];

  console.log('Testing confidence scores after null fix:\n');

  for (const field of fields) {
    const result = await service.calculateFieldConfidence({
      fragment_key: field,
      entity_type: 'task',
      user_id: '00000000-0000-0000-0000-000000000000',
    });

    console.log(`${field}:`);
    console.log(`  Confidence: ${result.confidence.toFixed(2)}`);
    console.log(`  Type Consistency: ${result.type_consistency.toFixed(2)}`);
    console.log(`  Format Consistency: ${result.format_consistency.toFixed(2)}`);
    console.log(`  Naming Pattern: ${result.naming_pattern_match}`);
    console.log(`  Inferred Type: ${result.inferred_type}`);
    console.log('');
  }
}

testConfidence().catch(console.error);
