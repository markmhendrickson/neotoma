import { SchemaRecommendationService } from '../src/services/schema_recommendation.js';

const service = new SchemaRecommendationService();

async function checkEligible() {
  const fields = [
    'project_ids',
    'project_names', 
    'section_ids',
    'section_names',
    'followers_gids',
    'asana_source_gid',
    'description_html',
    'my_tasks_section_ids',
    'my_tasks_section_names',
    'outcome_names',
    'execution_plan_path',
    'description_html_remote',
  ];

  console.log('Checking eligibility for remaining fields:\n');

  for (const field of fields) {
    const confidence = await service.calculateFieldConfidence({
      fragment_key: field,
      entity_type: 'task',
      user_id: '00000000-0000-0000-0000-000000000000',
    });

    const eligibility = await service.checkAutoEnhancementEligibility({
      entity_type: 'task',
      fragment_key: field,
      user_id: '00000000-0000-0000-0000-000000000000',
    });

    const status = eligibility.eligible ? '✅ ELIGIBLE' : '❌ NOT ELIGIBLE';
    console.log(`${field}: ${status}`);
    console.log(`  Confidence: ${confidence.confidence.toFixed(3)} (threshold: 0.85)`);
    if (!eligibility.eligible) {
      console.log(`  Reason: ${eligibility.reasoning}`);
    }
    console.log('');
  }
}

checkEligible().catch(console.error);
