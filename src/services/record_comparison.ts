import OpenAI from 'openai';
import { config } from '../config.js';

const openai = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

interface RecordComparisonRecord {
  id: string;
  type: string;
  summary?: string | null;
  properties?: Record<string, unknown>;
  metrics?: {
    amount?: number;
    currency?: string;
    repetitions?: number;
    load?: number;
    duration_minutes?: number;
    date?: string;
    recipient?: string;
    merchant?: string;
    category?: string;
    location?: string;
    label?: string;
  };
}

interface RecordComparisonPayload {
  new_record: RecordComparisonRecord;
  similar_records: RecordComparisonRecord[];
}

/**
 * Generate a qualitative comparison analysis between a new record and similar records
 */
export async function generateRecordComparisonInsight(
  payload: RecordComparisonPayload
): Promise<string> {
  if (!openai) {
    throw new Error('OpenAI API key is not configured');
  }

  const { new_record, similar_records } = payload;

  const systemPrompt = [
    'You analyze records and compare a new record against similar historical records.',
    'Return ONLY a concise, qualitative analysis (no JSON, no code blocks, just plain text).',
    'Focus on meaningful differences and patterns:',
    '- For financial records: compare amounts, trends, frequency, recipients',
    '- For fitness records: compare load, reps, sets, duration, progress',
    '- For any record: highlight what makes this record notable or different',
    'Be specific and actionable. Keep it under 300 characters if possible.',
    'If the records are very similar, note that briefly.',
  ].join('\n');

  const newRecordInfo = [
    `New Record:`,
    `  Type: ${new_record.type}`,
    new_record.summary ? `  Summary: ${new_record.summary}` : undefined,
    new_record.metrics ? `  Metrics: ${JSON.stringify(new_record.metrics, null, 2)}` : undefined,
    new_record.properties
      ? `  Properties: ${JSON.stringify(new_record.properties, null, 2)}`
      : undefined,
  ]
    .filter(Boolean)
    .join('\n');

  const similarRecordsInfo = similar_records
    .map((record, idx) => {
      return [
        `Similar Record ${idx + 1}:`,
        `  Type: ${record.type}`,
        record.summary ? `  Summary: ${record.summary}` : undefined,
        record.metrics ? `  Metrics: ${JSON.stringify(record.metrics, null, 2)}` : undefined,
        record.properties
          ? `  Properties: ${JSON.stringify(record.properties, null, 2)}`
          : undefined,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  const userPrompt = [newRecordInfo, '\nSimilar Records:', similarRecordsInfo].join('\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 400,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const analysis = response.choices?.[0]?.message?.content?.trim();
    if (!analysis) {
      throw new Error('No analysis returned from OpenAI');
    }

    // Clean up any code fences or JSON wrapping
    return analysis.replace(/^```[\w]*\n?/g, '').replace(/\n?```$/g, '').trim();
  } catch (error) {
    console.warn(
      'Record comparison generation failed:',
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}











