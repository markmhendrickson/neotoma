import { db } from '../src/db.js';
import { SchemaRecommendationService } from '../src/services/schema_recommendation.js';

const service = new SchemaRecommendationService();

async function analyzeField(fieldName: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`FIELD: ${fieldName}`);
  console.log('='.repeat(80));

  // Get actual sample values from raw_fragments
  const { data: fragments } = await db
    .from('raw_fragments')
    .select('fragment_value, frequency_count')
    .eq('entity_type', 'task')
    .eq('fragment_key', fieldName)
    .or('user_id.is.null,user_id.eq.00000000-0000-0000-0000-000000000000')
    .limit(50);

  if (!fragments || fragments.length === 0) {
    console.log('No fragments found');
    return;
  }

  // Calculate confidence
  const confidence = await service.calculateFieldConfidence({
    fragment_key: fieldName,
    entity_type: 'task',
    user_id: '00000000-0000-0000-0000-000000000000',
  });

  console.log(`\n📊 CONFIDENCE BREAKDOWN:`);
  console.log(`  Overall Confidence: ${confidence.confidence.toFixed(3)} (threshold: 0.85)`);
  console.log(`  Type Consistency: ${confidence.type_consistency.toFixed(3)} (50% weight)`);
  console.log(`  Format Consistency: ${confidence.format_consistency.toFixed(3)} (25% weight)`);
  console.log(`  Naming Pattern: ${confidence.naming_pattern_match} (15% weight)`);
  console.log(`  Inferred Type: ${confidence.inferred_type}`);

  // Analyze sample values
  const samples = fragments.map(f => f.fragment_value);
  const totalFrequency = fragments.reduce((sum, f) => sum + (f.frequency_count || 1), 0);
  
  console.log(`\n📈 SAMPLE STATISTICS:`);
  console.log(`  Total Samples: ${fragments.length}`);
  console.log(`  Total Frequency: ${totalFrequency}`);

  // Type distribution
  const typeCounts = new Map<string, number>();
  const nullCount = samples.filter(s => s === null || s === undefined).length;
  const nonNullSamples = samples.filter(s => s !== null && s !== undefined);
  
  console.log(`\n🔍 TYPE DISTRIBUTION:`);
  console.log(`  Null values: ${nullCount} (${((nullCount / samples.length) * 100).toFixed(1)}%)`);
  console.log(`  Non-null values: ${nonNullSamples.length} (${((nonNullSamples.length / samples.length) * 100).toFixed(1)}%)`);

  for (const sample of nonNullSamples) {
    const type = typeof sample;
    const isArray = Array.isArray(sample);
    const actualType = isArray ? 'array' : type;
    typeCounts.set(actualType, (typeCounts.get(actualType) || 0) + 1);
  }

  for (const [type, count] of Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / nonNullSamples.length) * 100).toFixed(1);
    console.log(`  ${type}: ${count} (${pct}%)`);
  }

  // Show sample values
  console.log(`\n📝 SAMPLE VALUES (first 10 non-null):`);
  const uniqueSamples = Array.from(new Set(nonNullSamples.map(s => {
    if (typeof s === 'string' && s.length > 50) {
      return s.substring(0, 50) + '...';
    }
    if (Array.isArray(s)) {
      return JSON.stringify(s).substring(0, 50) + '...';
    }
    return String(s);
  }))).slice(0, 10);
  
  uniqueSamples.forEach((sample, i) => {
    console.log(`  ${i + 1}. ${sample}`);
  });

  // Format analysis for specific types
  if (confidence.inferred_type === 'date') {
    console.log(`\n📅 DATE FORMAT ANALYSIS:`);
    const dateSamples = nonNullSamples.filter(s => typeof s === 'string' || s instanceof Date);
    const formats = new Map<string, number>();
    
    for (const sample of dateSamples) {
      const str = typeof sample === 'string' ? sample : sample.toISOString();
      let format = 'unknown';
      
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str)) {
        format = 'ISO 8601 with time';
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        format = 'ISO 8601 date only';
      } else if (/^\d+$/.test(str)) {
        format = 'timestamp (numeric)';
      } else if (str.includes('/')) {
        format = 'slash-separated';
      } else {
        format = 'other';
      }
      
      formats.set(format, (formats.get(format) || 0) + 1);
    }
    
    for (const [format, count] of Array.from(formats.entries()).sort((a, b) => b[1] - a[1])) {
      const pct = ((count / dateSamples.length) * 100).toFixed(1);
      console.log(`  ${format}: ${count} (${pct}%)`);
    }
  }

  if (confidence.inferred_type === 'string') {
    console.log(`\n📝 STRING FORMAT ANALYSIS:`);
    const stringSamples = nonNullSamples.filter(s => typeof s === 'string');
    
    // Check for numeric strings
    const numericStrings = stringSamples.filter(s => /^\d+$/.test(s));
    if (numericStrings.length > 0) {
      console.log(`  Numeric strings: ${numericStrings.length} (${((numericStrings.length / stringSamples.length) * 100).toFixed(1)}%)`);
      console.log(`  Sample numeric strings: ${numericStrings.slice(0, 3).join(', ')}`);
    }
    
    // Check for empty strings
    const emptyStrings = stringSamples.filter(s => s.trim() === '');
    if (emptyStrings.length > 0) {
      console.log(`  Empty strings: ${emptyStrings.length} (${((emptyStrings.length / stringSamples.length) * 100).toFixed(1)}%)`);
    }
    
    // Check length distribution
    const lengths = stringSamples.map(s => s.length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const minLength = Math.min(...lengths);
    const maxLength = Math.max(...lengths);
    console.log(`  Length: avg=${avgLength.toFixed(1)}, min=${minLength}, max=${maxLength}`);
  }

  if (confidence.inferred_type === 'array') {
    console.log(`\n📦 ARRAY FORMAT ANALYSIS:`);
    const arraySamples = nonNullSamples.filter(s => Array.isArray(s));
    
    const lengths = arraySamples.map(a => a.length);
    const emptyArrays = arraySamples.filter(a => a.length === 0).length;
    const singleItem = arraySamples.filter(a => a.length === 1).length;
    const multiItem = arraySamples.filter(a => a.length > 1).length;
    
    console.log(`  Empty arrays: ${emptyArrays} (${((emptyArrays / arraySamples.length) * 100).toFixed(1)}%)`);
    console.log(`  Single item: ${singleItem} (${((singleItem / arraySamples.length) * 100).toFixed(1)}%)`);
    console.log(`  Multiple items: ${multiItem} (${((multiItem / arraySamples.length) * 100).toFixed(1)}%)`);
    console.log(`  Length: avg=${(lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(1)}, min=${Math.min(...lengths)}, max=${Math.max(...lengths)}`);
    
    // Check element types
    const elementTypes = new Map<string, number>();
    for (const arr of arraySamples) {
      for (const item of arr) {
        const type = typeof item;
        elementTypes.set(type, (elementTypes.get(type) || 0) + 1);
      }
    }
    if (elementTypes.size > 0) {
      console.log(`  Element types:`);
      for (const [type, count] of Array.from(elementTypes.entries()).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${type}: ${count}`);
      }
    }
  }

  // Calculate what confidence would be needed
  console.log(`\n🎯 CONFIDENCE GAP ANALYSIS:`);
  const gap = 0.85 - confidence.confidence;
  console.log(`  Gap to threshold: ${gap.toFixed(3)}`);
  
  // Show what each component contributes
  const typeContrib = confidence.type_consistency * 0.5;
  const formatContrib = confidence.format_consistency * 0.25;
  const namingContrib = (confidence.naming_pattern_match ? 1.0 : 0.5) * 0.15;
  const sampleContrib = Math.min(samples.length / 10, 1.0) * 0.1;
  
  console.log(`  Component contributions:`);
  console.log(`    Type consistency: ${typeContrib.toFixed(3)} (${confidence.type_consistency.toFixed(3)} × 0.5)`);
  console.log(`    Format consistency: ${formatContrib.toFixed(3)} (${confidence.format_consistency.toFixed(3)} × 0.25)`);
  console.log(`    Naming pattern: ${namingContrib.toFixed(3)} (${confidence.naming_pattern_match ? '1.0' : '0.5'} × 0.15)`);
  console.log(`    Sample count: ${sampleContrib.toFixed(3)} (${Math.min(samples.length / 10, 1.0).toFixed(3)} × 0.1)`);
  
  // Suggest what would need to improve
  if (gap > 0) {
    console.log(`\n💡 TO REACH 0.85 THRESHOLD:`);
    const neededTypeConsistency = (0.85 - formatContrib - namingContrib - sampleContrib) / 0.5;
    const neededFormatConsistency = (0.85 - typeContrib - namingContrib - sampleContrib) / 0.25;
    
    if (confidence.type_consistency < 1.0 && neededTypeConsistency <= 1.0) {
      console.log(`  Type consistency needs: ${neededTypeConsistency.toFixed(3)} (currently ${confidence.type_consistency.toFixed(3)})`);
    }
    if (confidence.format_consistency < 1.0 && neededFormatConsistency <= 1.0) {
      console.log(`  Format consistency needs: ${neededFormatConsistency.toFixed(3)} (currently ${confidence.format_consistency.toFixed(3)})`);
    }
    if (!confidence.naming_pattern_match) {
      console.log(`  Naming pattern match would add: +0.075 (if field name matched pattern)`);
    }
  }
}

async function analyzeAll() {
  const fields = [
    'created_at',
    'updated_at',
    'task_id',
    'urgency',
    'recurrence',
    'project_ids',
    'assignee_gid',
    'follower_names',
    'asana_workspace',
    'outcome_ids',
    'section_ids',
    'section_names',
    'project_names',
    'followers_gids',
    'asana_source_gid',
    'description_html',
    'description_html_remote',
    'my_tasks_section_ids',
    'my_tasks_section_names',
    'outcome_names',
    'execution_plan_path',
  ];

  for (const field of fields) {
    await analyzeField(field);
  }
}

analyzeAll().catch(console.error);
