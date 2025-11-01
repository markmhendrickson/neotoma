import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { supabase, type NeotomaRecord } from './db.js';
import { z } from 'zod';
import { generateEmbedding, getRecordText } from './embeddings.js';
import { config } from './config.js';

const PropertyFilterSchema = z.record(z.unknown());
type PropertyFilter = z.infer<typeof PropertyFilterSchema>;

export class NeotomaServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'neotoma',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandler();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'store_record',
          description: 'Store a new data record with extensible properties and optional file uploads. Optionally include an embedding vector for semantic search.',
          inputSchema: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'Record type identifier (e.g., transaction, exercise, note)' },
              properties: { type: 'object', description: 'Flexible properties as key-value pairs' },
              file_urls: { 
                type: 'array', 
                items: { type: 'string' },
                description: 'URLs to files associated with this record' 
              },
              embedding: {
                type: 'array',
                items: { type: 'number' },
                description: 'Optional 1536-dimensional embedding vector for semantic search (e.g., OpenAI text-embedding-3-small)',
              },
            },
            required: ['type', 'properties'],
          },
        },
        {
          name: 'update_record',
          description: 'Update an existing record\'s properties, file URLs, or embedding',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Record ID to update' },
              type: { type: 'string', description: 'Record type (optional)' },
              properties: { type: 'object', description: 'Properties to update (merges with existing)' },
              file_urls: { type: 'array', items: { type: 'string' } },
              embedding: {
                type: 'array',
                items: { type: 'number' },
                description: 'Optional 1536-dimensional embedding vector',
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'retrieve_records',
          description: 'Query records by type and property filters. Supports semantic search using embeddings for fuzzy matching.',
          inputSchema: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'Filter by record type' },
              properties: { type: 'object', description: 'Filter by property values (supports nested keys)' },
              limit: { type: 'number', description: 'Maximum number of results' },
              search: { type: 'array', items: { type: 'string' }, description: 'Search terms for fuzzy/semantic matching' },
              search_mode: { type: 'string', enum: ['semantic', 'keyword', 'both'], description: 'Search mode: semantic (vector), keyword (text), or both', default: 'both' },
              similarity_threshold: { type: 'number', description: 'Minimum similarity score for semantic search (0-1)', default: 0.7 },
              query_embedding: { type: 'array', items: { type: 'number' }, description: '1536-dimensional embedding vector for semantic search query' },
            },
          },
        },
        {
          name: 'delete_record',
          description: 'Delete a record and its associated files',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Record ID to delete' },
            },
            required: ['id'],
          },
        },
        {
          name: 'upload_file',
          description: 'Upload a file and associate it with a record',
          inputSchema: {
            type: 'object',
            properties: {
              record_id: { type: 'string', description: 'Record ID to associate file with' },
              file_path: { type: 'string', description: 'Local file path to upload' },
              bucket: { type: 'string', description: 'Storage bucket name (optional)' },
            },
            required: ['record_id', 'file_path'],
          },
        },
        {
          name: 'get_file_url',
          description: 'Get a signed URL for accessing a file',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Path to file in storage' },
              expires_in: { type: 'number', description: 'URL expiration in seconds' },
            },
            required: ['file_path'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case 'store_record':
            return await this.storeRecord(args);
          case 'update_record':
            return await this.updateRecord(args);
          case 'retrieve_records':
            return await this.retrieveRecords(args);
          case 'delete_record':
            return await this.deleteRecord(args);
          case 'upload_file':
            return await this.uploadFile(args);
          case 'get_file_url':
            return await this.getFileUrl(args);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    });
  }

  private async storeRecord(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      type: z.string(),
      properties: z.record(z.unknown()),
      file_urls: z.array(z.string()).optional(),
      embedding: z.array(z.number()).optional(),
    });

    const { type, properties, file_urls, embedding: providedEmbedding } = schema.parse(args);

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

    if (error) throw error;

    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }

  private async updateRecord(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      id: z.string(),
      type: z.string().optional(),
      properties: z.record(z.unknown()).optional(),
      file_urls: z.array(z.string()).optional(),
      embedding: z.array(z.number()).optional(),
    });

    const parsed = schema.parse(args);

    // Fetch existing record to determine if we need to regenerate embedding
    const { data: existing } = await supabase
      .from('records')
      .select('type, properties, embedding')
      .eq('id', parsed.id)
      .single();

    const updateData: Partial<NeotomaRecord> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.type !== undefined) {
      updateData.type = parsed.type;
    }

    // Generate new embedding if:
    // 1. Embedding is explicitly provided (non-empty array), OR
    // 2. Properties or type changed and no embedding was provided, OR
    // 3. Existing record has no embedding and OpenAI is configured
    if (parsed.embedding !== undefined) {
      // Filter out empty arrays - they're invalid for PostgreSQL vector type
      if (Array.isArray(parsed.embedding) && parsed.embedding.length > 0) {
        updateData.embedding = parsed.embedding;
      } else {
        // Explicitly set to null to clear embedding
        updateData.embedding = null;
      }
    } else if ((parsed.properties !== undefined || parsed.type !== undefined) && config.openaiApiKey) {
      const newType = parsed.type !== undefined ? parsed.type : existing?.type || '';
      const newProperties = parsed.properties !== undefined ? parsed.properties : (existing?.properties as Record<string, unknown>) || {};
      const recordText = getRecordText(newType, newProperties);
      const generatedEmbedding = await generateEmbedding(recordText);
      if (generatedEmbedding) {
        updateData.embedding = generatedEmbedding;
      }
    }

    if (parsed.properties !== undefined) {
      if (existing) {
        updateData.properties = { ...(existing.properties as object), ...parsed.properties };
      } else {
        updateData.properties = parsed.properties;
      }
    }

    if (parsed.file_urls !== undefined) {
      updateData.file_urls = parsed.file_urls;
    }

    const { data, error } = await supabase
      .from('records')
      .update(updateData)
      .eq('id', parsed.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error('Record not found');

    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }

  private async retrieveRecords(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      type: z.string().optional(),
      properties: z.record(z.unknown()).optional(),
      limit: z.number().optional(),
      search: z.array(z.string()).optional(),
      search_mode: z.enum(['semantic', 'keyword', 'both']).optional().default('both'),
      similarity_threshold: z.number().min(0).max(1).optional().default(0.7),
      query_embedding: z.array(z.number()).optional(),
    });

    const { type, properties, limit, search, search_mode, similarity_threshold, query_embedding: providedQueryEmbedding } = schema.parse(args);

    let results: NeotomaRecord[] = [];
    const finalLimit = limit || 100;

    // Semantic search (vector similarity)
    if (search && (search_mode === 'semantic' || search_mode === 'both')) {
      // Generate query_embedding from search terms if not provided
      let query_embedding: number[] | undefined = providedQueryEmbedding;
      if (!query_embedding && config.openaiApiKey) {
        const searchText = search.join(' ');
        const generated = await generateEmbedding(searchText);
        query_embedding = generated || undefined;
        if (!query_embedding && search_mode === 'semantic') {
          throw new Error('Failed to generate query embedding. Ensure OPENAI_API_KEY is configured or provide query_embedding.');
        }
      }

      if (!query_embedding) {
        if (search_mode === 'semantic') {
          throw new Error('query_embedding required for semantic search, or configure OPENAI_API_KEY for automatic generation');
        }
        // If both mode, just skip semantic and do keyword only
      } else if (query_embedding.length !== 1536) {
        throw new Error('query_embedding must be 1536-dimensional (OpenAI text-embedding-3-small)');
      }

      if (query_embedding) {
        let embeddingQuery = supabase.from('records').select('*').not('embedding', 'is', null);
        
        if (type) {
          embeddingQuery = embeddingQuery.eq('type', type);
        }

        const { data: candidates, error: fetchError } = await embeddingQuery.limit(finalLimit * 10);

        if (fetchError) {
          throw fetchError;
        }

        if (candidates) {
          const queryNorm = Math.sqrt(query_embedding.reduce((sum, val) => sum + val * val, 0));
          
          const semanticMatches = candidates
            .map((rec: any) => {
              const recEmbedding = rec.embedding;
              if (!recEmbedding || !Array.isArray(recEmbedding) || recEmbedding.length !== 1536) {
                return null;
              }
              
              const dotProduct = query_embedding.reduce((sum, val, i) => sum + val * recEmbedding[i], 0);
              const recNorm = Math.sqrt(recEmbedding.reduce((sum: number, val: number) => sum + val * val, 0));
              const similarity = dotProduct / (queryNorm * recNorm);
              
              return { ...rec, similarity };
            })
            .filter((rec: any) => rec && rec.similarity >= similarity_threshold)
            .sort((a: any, b: any) => b.similarity - a.similarity)
            .slice(0, finalLimit);

          if (search_mode === 'semantic') {
            results = semanticMatches;
          } else {
            results = semanticMatches;
          }
        }
      }
    }

    // Keyword search (text matching)
    if (search && search_mode !== 'semantic') {
      let keywordQuery = supabase.from('records').select('*');
      
      if (type) {
        keywordQuery = keywordQuery.eq('type', type);
      }

      const { data: keywordCandidates, error: keywordError } = await keywordQuery.limit(finalLimit * 2);
      
      if (keywordError) {
        throw keywordError;
      }

      if (keywordCandidates) {
        const searchText = search.join(' ').toLowerCase();
        const keywordMatches = keywordCandidates.filter((rec: NeotomaRecord) => {
          const typeMatch = rec.type?.toLowerCase().includes(searchText);
          const propsText = JSON.stringify(rec.properties || {}).toLowerCase();
          const propsMatch = propsText.includes(searchText);
          return typeMatch || propsMatch;
        }).slice(0, finalLimit);

        if (results.length === 0) {
          results = keywordMatches;
        } else {
          // Merge keyword results with semantic results (both mode)
          const resultMap = new Map();
          results.forEach((r) => resultMap.set(r.id, r));
          keywordMatches.forEach((r) => {
            if (!resultMap.has(r.id)) {
              resultMap.set(r.id, r);
            }
          });
          results = Array.from(resultMap.values()).slice(0, finalLimit);
        }
      }
    }

    // No search: use existing logic
    if (!search) {
      let query = supabase.from('records').select('*');

      if (type) {
        query = query.eq('type', type);
      }

      if (limit) {
        query = query.limit(limit);
      } else {
        query = query.limit(100);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      results = data || [];
    }

    // Filter by exact property matches
    if (properties) {
      results = results.filter((rec: NeotomaRecord) => {
        return Object.entries(properties).every(([key, value]) => {
          const recValue = (rec.properties as Record<string, unknown>)[key];
          return recValue === value;
        });
      });
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  }

  private async deleteRecord(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({ id: z.string() });
    const { id } = schema.parse(args);

    const { error } = await supabase.from('records').delete().eq('id', id);

    if (error) throw error;

    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, deleted_id: id }) }],
    };
  }

  private async uploadFile(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      record_id: z.string(),
      file_path: z.string(),
      bucket: z.string().optional(),
    });

    const { record_id, file_path, bucket } = schema.parse(args);

    const { data: recordData, error: fetchError } = await supabase
      .from('records')
      .select('type, file_urls')
      .eq('id', record_id)
      .single();

    if (fetchError || !recordData) {
      throw new Error('Record not found');
    }

    const bucketName = bucket || 'files';
    const fileExt = file_path.split('.').pop();
    const fileName = `${record_id}/${Date.now()}.${fileExt}`;

    const fs = await import('fs/promises');
    const fileContent = await fs.readFile(file_path);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileContent, {
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const fileUrl = uploadData.path;

    const updatedFileUrls = [...(recordData.file_urls || []), fileUrl];

    const { data: updatedData, error: updateError } = await supabase
      .from('records')
      .update({ file_urls: updatedFileUrls })
      .eq('id', record_id)
      .select()
      .single();

    if (updateError) throw updateError;

    return {
      content: [{ type: 'text', text: JSON.stringify(updatedData, null, 2) }],
    };
  }

  private async getFileUrl(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      file_path: z.string(),
      expires_in: z.number().optional(),
    });

    const { file_path, expires_in } = schema.parse(args);

    const pathParts = file_path.split('/');
    const bucket = pathParts[0];
    const path = pathParts.slice(1).join('/');

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expires_in || 3600);

    if (error) throw error;

    return {
      content: [{ type: 'text', text: JSON.stringify({ url: data.signedUrl }) }],
    };
  }

  private setupErrorHandler(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Server running on stdio');
  }
}

