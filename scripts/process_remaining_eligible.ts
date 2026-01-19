import { supabase } from '../src/db.js';
import { schemaRecommendationService } from '../src/services/schema_recommendation.js';
import { schemaRegistry } from '../src/services/schema_registry.js';

async function processRemaining() {
  const eligibleFields = [
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
  ];

  console.log('Processing remaining eligible fields directly...\n');

  for (const field of eligibleFields) {
    try {
      console.log(`Processing ${field}...`);
      
      // Check eligibility
      const eligibility = await schemaRecommendationService.checkAutoEnhancementEligibility({
        entity_type: 'task',
        fragment_key: field,
        user_id: '00000000-0000-0000-0000-000000000000',
      });

      if (!eligibility.eligible) {
        console.log(`  ❌ Not eligible: ${eligibility.reasoning}`);
        continue;
      }

      // Create recommendation
      await schemaRecommendationService.autoEnhanceSchema({
        entity_type: 'task',
        field_name: field,
        field_type: eligibility.inferred_type || 'string',
        user_id: '00000000-0000-0000-0000-000000000000',
      });

      // Update schema
      await schemaRegistry.updateSchemaIncremental({
        entity_type: 'task',
        fields_to_add: [
          {
            field_name: field,
            field_type: eligibility.inferred_type || 'string',
            required: false,
          },
        ],
        user_id: '00000000-0000-0000-0000-000000000000',
        user_specific: false,
        activate: true,
      });

      console.log(`  ✅ Successfully enhanced ${field} (type: ${eligibility.inferred_type || 'string'}, confidence: ${eligibility.confidence.toFixed(2)})`);
    } catch (error: any) {
      console.log(`  ❌ Failed: ${error.message}`);
    }
  }

  console.log('\n✅ Processing complete');
}

processRemaining().catch(console.error);
