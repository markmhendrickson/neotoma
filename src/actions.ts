import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import { z } from 'zod';
import { supabase } from './db.js';
import { config } from './config.js';
import { generateEmbedding, getRecordText } from './embeddings.js';
import fs from 'fs';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Basic redaction helpers for safer debug logs
function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...headers } as Record<string, unknown>;
  if (clone.authorization) clone.authorization = '[REDACTED]';
  if (clone.Authorization) clone.Authorization = '[REDACTED]';
  return clone;
}

function logDebug(event: string, req: express.Request, extra?: Record<string, unknown>): void {
  const safe = {
    method: req.method,
    path: req.path,
    query: req.query,
    headers: redactHeaders(req.headers as Record<string, unknown>),
    body: req.body,
    ...extra,
  };
  // eslint-disable-next-line no-console
  console.debug(`[DEBUG] ${event}`, safe);
}

function logWarn(event: string, req: express.Request, extra?: Record<string, unknown>): void {
  const safe = {
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body,
    ...extra,
  };
  // eslint-disable-next-line no-console
  console.warn(`[WARN] ${event}`, safe);
}

function logError(event: string, req: express.Request, error: unknown, extra?: Record<string, unknown>): void {
  const payload = {
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body,
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
    ...extra,
  };
  // eslint-disable-next-line no-console
  console.error(`[ERROR] ${event}`, payload);
}

// Public health endpoint (no auth)
app.get('/health', (_req, res) => {
  return res.json({ ok: true });
});

// Simple bearer token auth middleware with bypass for openapi, health, and preflight
const AUTH_TOKEN = process.env.ACTIONS_BEARER_TOKEN || '';
app.use((req, res, next) => {
  // Allow OpenAPI spec, health checks, and CORS preflight without auth
  if (req.method === 'OPTIONS' || (req.method === 'GET' && (req.path === '/openapi.yaml' || req.path === '/health'))) {
    return next();
  }
  if (!AUTH_TOKEN) {
    logError('AuthConfigMissing', req, new Error('ACTIONS_BEARER_TOKEN missing'));
    return res.status(500).json({ error: 'Server not configured: ACTIONS_BEARER_TOKEN missing' });
  }
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    logWarn('AuthMissingBearer', req);
    return res.status(401).json({ error: 'Missing Bearer token' });
  }
  const token = auth.slice('Bearer '.length);
  if (token !== AUTH_TOKEN) {
    logWarn('AuthInvalidToken', req);
    return res.status(403).json({ error: 'Invalid token' });
  }
  next();
});

// Schemas
const StoreSchema = z.object({
  type: z.string(),
  properties: z.record(z.unknown()).default({}),
  file_urls: z.array(z.string()).optional(),
  embedding: z.array(z.number()).optional(),
});

const UpdateSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
  file_urls: z.array(z.string()).optional(),
  embedding: z.array(z.number()).optional(),
});

const RetrieveSchema = z.object({
  type: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
  limit: z.number().int().positive().max(500).optional(),
  search: z.array(z.string()).optional(),
  search_mode: z.enum(['semantic', 'keyword', 'both']).optional().default('both'),
    similarity_threshold: z.number().min(0).max(1).optional().default(0.3),
  query_embedding: z.array(z.number()).optional(),
});

const StoreRecordsSchema = z.object({
  records: z.array(StoreSchema).min(1).max(100),
});

const DeleteRecordsSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
});

// Endpoints
app.post('/store_record', async (req, res) => {
  const parsed = StoreSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:store_record', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { type, properties, file_urls, embedding: providedEmbedding } = parsed.data;

  // Generate embedding if not provided and OpenAI is configured
  // Filter out empty arrays - they're invalid for PostgreSQL vector type
  let embedding: number[] | null = null;
  if (providedEmbedding && Array.isArray(providedEmbedding) && providedEmbedding.length > 0) {
    embedding = providedEmbedding;
  } else if (!providedEmbedding && config.openaiApiKey) {
    const recordText = getRecordText(type, properties);
    embedding = await generateEmbedding(recordText);
  }

  const insertData: Record<string, unknown> = {
    type,
    properties,
    file_urls: file_urls || [],
  };
  if (embedding) {
    insertData.embedding = embedding;
  }

  const { data, error } = await supabase
    .from('records')
    .insert(insertData)
    .select()
    .single();
  if (error) {
    logError('SupabaseError:store_record', req, error, { code: (error as any).code, details: (error as any).details, hint: (error as any).hint });
    return res.status(500).json({ error: (error as any).message || 'Database error' });
  }
  logDebug('Success:store_record', req, { id: data?.id });
  return res.json(data);
});

app.post('/store_records', async (req, res) => {
  const parsed = StoreRecordsSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:store_records', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { records } = parsed.data;

  // Generate embeddings for records that don't have them
  const insertDataPromises = records.map(async ({ type, properties, file_urls, embedding: providedEmbedding }) => {
    // Filter out empty arrays - they're invalid for PostgreSQL vector type
    let embedding: number[] | null = null;
    if (providedEmbedding && Array.isArray(providedEmbedding) && providedEmbedding.length > 0) {
      embedding = providedEmbedding;
    } else if (!providedEmbedding && config.openaiApiKey) {
      const recordText = getRecordText(type, properties);
      embedding = await generateEmbedding(recordText);
    }

    const recordData: Record<string, unknown> = {
      type,
      properties,
      file_urls: file_urls || [],
    };
    if (embedding) {
      recordData.embedding = embedding;
    }
    return recordData;
  });

  const insertData = await Promise.all(insertDataPromises);

  const { data, error } = await supabase
    .from('records')
    .insert(insertData)
    .select('id, type, created_at');

  if (error) {
    logError('SupabaseError:store_records', req, error, { code: (error as any).code, details: (error as any).details, hint: (error as any).hint });
    return res.status(500).json({ error: (error as any).message || 'Database error' });
  }
  
  // Return summary to avoid ResponseTooLargeError with embeddings
  const summary = {
    success: true,
    count: data?.length || 0,
    records: (data || []).map((rec: any) => ({
      id: rec.id,
      type: rec.type,
      created_at: rec.created_at,
    })),
  };
  
  logDebug('Success:store_records', req, { count: summary.count });
  return res.json(summary);
});

app.post('/update_record', async (req, res) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:update_record', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { id, type, properties, file_urls, embedding: providedEmbedding } = parsed.data;

  let updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Fetch existing record to determine if we need to regenerate embedding
  const { data: existing } = await supabase
    .from('records')
    .select('type, properties, embedding')
    .eq('id', id)
    .single();

  if (type !== undefined) {
    updateData.type = type;
  }

  // Generate new embedding if:
  // 1. Embedding is explicitly provided (non-empty array), OR
  // 2. Properties or type changed and no embedding was provided, OR
  // 3. Existing record has no embedding and OpenAI is configured
  if (providedEmbedding !== undefined) {
    // Filter out empty arrays - they're invalid for PostgreSQL vector type
    if (Array.isArray(providedEmbedding) && providedEmbedding.length > 0) {
      updateData.embedding = providedEmbedding;
    } else {
      // Explicitly set to null to clear embedding
      updateData.embedding = null;
    }
  } else if ((properties !== undefined || type !== undefined) && config.openaiApiKey) {
    const newType = type !== undefined ? type : existing?.type || '';
    const newProperties = properties !== undefined ? properties : existing?.properties || {};
    const recordText = getRecordText(newType, newProperties as Record<string, unknown>);
    const generatedEmbedding = await generateEmbedding(recordText);
    if (generatedEmbedding) {
      updateData.embedding = generatedEmbedding;
    }
  }

  if (properties !== undefined) {
    const { data: existing, error: fetchError } = await supabase
      .from('records')
      .select('properties')
      .eq('id', id)
      .single();
    if (fetchError) {
      logError('SupabaseError:update_record:fetch', req, fetchError);
      return res.status(500).json({ error: fetchError.message });
    }
    updateData.properties = { ...(existing?.properties as object), ...properties };
  }

  if (file_urls !== undefined) {
    updateData.file_urls = file_urls;
  }

  const { data, error } = await supabase
    .from('records')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logError('SupabaseError:update_record:update', req, error, { code: (error as any).code });
    return res.status(500).json({ error: error.message });
  }
  if (!data) {
    logWarn('NotFound:update_record', req, { id });
    return res.status(404).json({ error: 'Not found' });
  }
  logDebug('Success:update_record', req, { id: data.id });
  return res.json(data);
});

app.post('/retrieve_records', async (req, res) => {
  const parsed = RetrieveSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:retrieve_records', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { type, properties, limit, search, search_mode, similarity_threshold, query_embedding: providedQueryEmbedding } = parsed.data;

  let results: any[] = [];
  const finalLimit = limit ?? 100;

  // Semantic search (vector similarity)
  if (search && (search_mode === 'semantic' || search_mode === 'both')) {
    // Generate query_embedding from search terms if not provided
    let query_embedding: number[] | undefined = providedQueryEmbedding;
    if (!query_embedding && config.openaiApiKey) {
      const searchText = search.join(' ');
      const generated = await generateEmbedding(searchText);
      query_embedding = generated || undefined;
      if (!query_embedding) {
        logWarn('EmbeddingGeneration:retrieve_records', req, { message: 'Failed to generate query embedding' });
        // Fall back to keyword search only
        if (search_mode === 'semantic') {
          // Switch to keyword mode if semantic was required
          const keywordQuery = supabase.from('records').select('*');
          if (type) keywordQuery.eq('type', type);
          const { data: keywordCandidates } = await keywordQuery.limit(finalLimit * 2);
          const searchTextLower = search.join(' ').toLowerCase();
          const keywordMatches = (keywordCandidates || []).filter((rec: any) => {
            const typeMatch = rec.type?.toLowerCase().includes(searchTextLower);
            const propsText = JSON.stringify(rec.properties || {}).toLowerCase();
            return typeMatch || propsText.includes(searchTextLower);
          }).slice(0, finalLimit);
          logDebug('Success:retrieve_records', req, { count: keywordMatches.length, search_mode: 'keyword (fallback)' });
          return res.json(keywordMatches);
        }
      }
    }

    if (!query_embedding) {
      if (search_mode === 'semantic') {
        logWarn('ValidationError:retrieve_records:no_embedding', req, { message: 'query_embedding required for semantic search or OPENAI_API_KEY must be configured' });
        return res.status(400).json({ error: 'query_embedding required for semantic search, or configure OPENAI_API_KEY for automatic generation' });
      }
      // If both mode, just skip semantic and do keyword only
    } else if (query_embedding.length !== 1536) {
      logWarn('ValidationError:retrieve_records:embedding_dim', req, { received: query_embedding.length });
      return res.status(400).json({ error: 'query_embedding must be 1536-dimensional (OpenAI text-embedding-3-small)' });
    }

    if (query_embedding) {
      // Fetch records with embeddings for similarity calculation
      // Note: For better performance at scale, create a PostgreSQL function using pgvector operators
      let embeddingQuery = supabase.from('records').select('*').not('embedding', 'is', null);
      
      if (type) {
        embeddingQuery = embeddingQuery.eq('type', type);
      }

      // Fetch more candidates than limit to filter by similarity
      const { data: candidates, error: fetchError } = await embeddingQuery.limit(finalLimit * 10);

      if (fetchError) {
        logError('SupabaseError:retrieve_records:semantic:fetch', req, fetchError);
      } else if (candidates) {
        // Debug: Check embedding format of first candidate
        const sampleEmbedding = candidates[0]?.embedding;
        const embeddingInfo = sampleEmbedding ? {
          type: typeof sampleEmbedding,
          isArray: Array.isArray(sampleEmbedding),
          length: Array.isArray(sampleEmbedding) ? sampleEmbedding.length : 'N/A',
          preview: typeof sampleEmbedding === 'string' ? sampleEmbedding.substring(0, 50) : 
                  Array.isArray(sampleEmbedding) ? `[${sampleEmbedding.slice(0, 3).join(', ')}, ...]` : 
                  JSON.stringify(sampleEmbedding).substring(0, 50)
        } : null;
        
        logDebug('SemanticSearch:retrieve_records', req, { 
          candidates_count: candidates.length, 
          similarity_threshold,
          type_filter: type || 'all',
          sample_embedding: embeddingInfo
        });
        
        // Calculate cosine similarity for each record
        const queryNorm = Math.sqrt(query_embedding.reduce((sum, val) => sum + val * val, 0));
        
        const scoredCandidates = candidates
          .map((rec: any) => {
            let recEmbedding = rec.embedding;
            
            // Handle Supabase vector format - it might be stored as string or array
            if (!recEmbedding) {
              return null;
            }
            
            // Convert string to array if needed (Supabase might return JSON string)
            if (typeof recEmbedding === 'string') {
              try {
                recEmbedding = JSON.parse(recEmbedding);
              } catch (e) {
                logWarn('SemanticSearch:embedding_parse_error', req, { rec_id: rec.id?.substring(0, 8), error: e });
                return null;
              }
            }
            
            // Ensure it's an array with correct dimensions
            if (!Array.isArray(recEmbedding) || recEmbedding.length !== 1536) {
              logWarn('SemanticSearch:embedding_format_error', req, { 
                rec_id: rec.id?.substring(0, 8),
                embedding_type: typeof recEmbedding,
                embedding_length: Array.isArray(recEmbedding) ? recEmbedding.length : 'not-array'
              });
              return null;
            }
            
            const dotProduct = query_embedding.reduce((sum, val, i) => sum + val * recEmbedding[i], 0);
            const recNorm = Math.sqrt(recEmbedding.reduce((sum: number, val: number) => sum + val * val, 0));
            const similarity = dotProduct / (queryNorm * recNorm);
            
            return { ...rec, similarity };
          })
          .filter((rec: any) => rec !== null)
          .sort((a: any, b: any) => b.similarity - a.similarity);
        
        // Log top 5 similarity scores for debugging
        const topScores = scoredCandidates.slice(0, 5).map((rec: any) => ({
          id: rec.id?.substring(0, 8),
          type: rec.type,
          similarity: rec.similarity?.toFixed(4)
        }));
        
        logDebug('SemanticSearch:similarity_scores', req, { 
          top_5_scores: topScores,
          threshold: similarity_threshold,
          candidates_scored: scoredCandidates.length
        });
        
        const semanticMatches = scoredCandidates
          .filter((rec: any) => rec.similarity >= similarity_threshold)
          .slice(0, finalLimit);
        
        logDebug('SemanticSearch:results', req, { 
          matches_count: semanticMatches.length,
          top_similarity: scoredCandidates[0]?.similarity?.toFixed(4) || 'N/A',
          threshold: similarity_threshold
        });

        if (search_mode === 'semantic') {
          results = semanticMatches;
        } else {
          // Will merge with keyword results below
          results = semanticMatches;
        }
      }
    }
  }

  // Keyword search (ILIKE pattern matching)
  if (search && (search_mode === 'keyword' || search_mode === 'both')) {
    let keywordQuery = supabase.from('records').select('*');
    
    if (type) {
      keywordQuery = keywordQuery.eq('type', type);
    }

    // Fetch candidates and filter by keyword match
    const { data: keywordCandidates, error: keywordError } = await keywordQuery.limit(finalLimit * 2);
    
    if (keywordError) {
      logError('SupabaseError:retrieve_records:keyword', req, keywordError);
    } else if (keywordCandidates) {
      const searchText = search.join(' ').toLowerCase();
      const keywordMatches = keywordCandidates.filter((rec: any) => {
        const typeMatch = rec.type?.toLowerCase().includes(searchText);
        const propsText = JSON.stringify(rec.properties || {}).toLowerCase();
        const propsMatch = propsText.includes(searchText);
        return typeMatch || propsMatch;
      }).slice(0, finalLimit);

      if (search_mode === 'keyword') {
        results = keywordMatches;
      } else {
        // Merge semantic and keyword results, deduplicate by ID
        const resultMap = new Map();
        results.forEach((r: any) => resultMap.set(r.id, r));
        keywordMatches.forEach((r: any) => {
          if (!resultMap.has(r.id)) {
            resultMap.set(r.id, r);
          }
        });
        results = Array.from(resultMap.values()).slice(0, finalLimit);
      }
    }
  }

  // No search mode: use existing logic
  if (!search) {
    let query = supabase.from('records').select('*');
    if (type) query = query.eq('type', type);
    query = query.order('created_at', { ascending: false }).limit(finalLimit);

    const { data, error } = await query;
    if (error) {
      logError('SupabaseError:retrieve_records', req, error, { code: (error as any).code });
      return res.status(500).json({ error: error.message });
    }
    results = data || [];
  }

  // Filter by exact property matches (if specified)
  if (properties) {
    results = results.filter((rec: any) => {
      return Object.entries(properties).every(([key, value]) => {
        const recValue = (rec.properties as Record<string, unknown>)?.[key];
        return recValue === value;
      });
    });
  }

  // Remove embeddings from response to reduce size (ChatGPT Actions has response size limits)
  const resultsWithoutEmbeddings = results.map((rec: any) => {
    const { embedding, ...rest } = rec;
    return rest;
  });
  
  logDebug('Success:retrieve_records', req, { count: resultsWithoutEmbeddings.length, search_mode, has_search: !!search });
  return res.json(resultsWithoutEmbeddings);
});

app.post('/delete_record', async (req, res) => {
  const schema = z.object({ id: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:delete_record', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { id } = parsed.data;

  const { error } = await supabase.from('records').delete().eq('id', id);
  if (error) {
    logError('SupabaseError:delete_record', req, error, { code: (error as any).code });
    return res.status(500).json({ error: error.message });
  }
  logDebug('Success:delete_record', req, { id });
  return res.json({ success: true, deleted_id: id });
});

app.post('/delete_records', async (req, res) => {
  const parsed = DeleteRecordsSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:delete_records', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { ids } = parsed.data;
  const { error } = await supabase.from('records').delete().in('id', ids);

  if (error) {
    logError('SupabaseError:delete_records', req, error, { code: (error as any).code });
    return res.status(500).json({ error: error.message });
  }

  logDebug('Success:delete_records', req, { count: ids.length });
  return res.json({ success: true, deleted_ids: ids, count: ids.length });
});

// File endpoints
const upload = multer({ dest: '/tmp' });
app.post('/upload_file', upload.single('file'), async (req, res) => {
  const schema = z.object({ record_id: z.string(), bucket: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn('ValidationError:upload_file', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { record_id, bucket } = parsed.data;

  const { data: recordData, error: fetchError } = await supabase
    .from('records')
    .select('type, file_urls')
    .eq('id', record_id)
    .single();
  if (fetchError || !recordData) {
    logWarn('NotFound:upload_file', req, { record_id, fetchError });
    return res.status(404).json({ error: 'Record not found' });
  }

  const bucketName = bucket || 'files';
  const tmpPath = req.file?.path;
  if (!tmpPath) {
    logWarn('ValidationError:upload_file:missing_file', req);
    return res.status(400).json({ error: 'Missing file' });
  }
  const fileExt = (req.file?.originalname || 'bin').split('.').pop();
  const fileName = `${record_id}/${Date.now()}.${fileExt}`;

  const fileBuffer = fs.readFileSync(tmpPath);
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(fileName, fileBuffer, { upsert: false });
  fs.unlinkSync(tmpPath);

  if (uploadError) {
    logError('SupabaseStorageError:upload_file', req, uploadError, { bucket: bucketName, fileName });
    return res.status(500).json({ error: uploadError.message });
  }

  const filePath = uploadData.path;
  const updatedFileUrls = [...(recordData.file_urls || []), filePath];

  const { data: updated, error: updateError } = await supabase
    .from('records')
    .update({ file_urls: updatedFileUrls })
    .eq('id', record_id)
    .select()
    .single();
  if (updateError) {
    logError('SupabaseError:upload_file:update_row', req, updateError);
    return res.status(500).json({ error: updateError.message });
  }

  logDebug('Success:upload_file', req, { record_id, filePath });
  return res.json(updated);
});

app.get('/get_file_url', async (req, res) => {
  const schema = z.object({ file_path: z.string(), expires_in: z.coerce.number().optional() });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    logWarn('ValidationError:get_file_url', req, { issues: parsed.error.issues });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { file_path, expires_in } = parsed.data;

  const parts = file_path.split('/');
  const bucket = parts[0];
  const path = parts.slice(1).join('/');

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expires_in || 3600);
  if (error) {
    logError('SupabaseStorageError:get_file_url', req, error, { bucket, path });
    return res.status(500).json({ error: error.message });
  }

  logDebug('Success:get_file_url', req, { path: file_path });
  return res.json({ url: data.signedUrl });
});

app.get('/openapi.yaml', (req, res) => {
  res.type('text/yaml');
  res.sendFile(process.cwd() + '/openapi.yaml');
});

const httpPort = process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT, 10) : (config.port || 3000);
app.listen(httpPort, () => {
  // eslint-disable-next-line no-console
  console.log(`HTTP Actions listening on :${httpPort}`);
});
