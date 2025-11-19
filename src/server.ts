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
import { generateRecordSummary } from './services/summary.js';
import { config } from './config.js';
import { normalizeRecordType } from './config/record_types.js';
import { createRecordFromUploadedFile } from './services/file_analysis.js';
import { randomUUID } from 'node:crypto';
import { buildPlaidItemContext, createLinkToken, exchangePublicToken, isPlaidConfigured } from './integrations/plaid/client.js';
import {
  getPlaidItemById,
  getPlaidItemByItemId,
  listPlaidItems as listPlaidItemsFromStore,
  redactPlaidItem,
  syncPlaidItem,
  upsertPlaidItem as persistPlaidItem,
  type PlaidItemRow,
  type SanitizedPlaidItem,
  type PlaidSyncSummary,
} from './services/plaid_sync.js';
import type { AccountBase } from 'plaid';
import { providerCatalog, getProviderDefinition } from './integrations/providers/index.js';
import { runConnectorSync, runAllConnectorSyncs } from './services/importers.js';
import { recordMatchesKeywordSearch } from './actions.js';

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
          description: 'Upload a file and either attach it to an existing record or create a new analyzed record.',
          inputSchema: {
            type: 'object',
            properties: {
              record_id: { type: 'string', description: 'Existing record ID to attach file to (optional).' },
              file_path: { type: 'string', description: 'Local file path to upload.' },
              bucket: { type: 'string', description: 'Storage bucket name (optional, defaults to "files").' },
              properties: {
                type: 'string',
                description: 'Optional JSON object of properties to apply when creating a new record (skips automatic analysis).',
              },
            },
            required: ['file_path'],
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
        {
          name: 'plaid_create_link_token',
          description: 'Create a Plaid Link token for connecting a financial institution.',
          inputSchema: {
            type: 'object',
            properties: {
              user_id: { type: 'string', description: 'Unique identifier for the requesting user (optional; defaults from env if omitted)' },
              client_name: { type: 'string', description: 'Display name for Plaid Link (optional)' },
              access_token: { type: 'string', description: 'Existing Plaid access token for update mode (optional)' },
              products: {
                type: 'array',
                items: { type: 'string' },
                description: 'Override default Plaid products (optional)',
              },
              redirect_uri: { type: 'string', description: 'Redirect URI configured with Plaid (optional)' },
            },
            required: [],
          },
        },
        {
          name: 'plaid_exchange_public_token',
          description: 'Exchange a Plaid public token for permanent access and store the Plaid item.',
          inputSchema: {
            type: 'object',
            properties: {
              public_token: { type: 'string', description: 'Public token generated by Plaid Link' },
              trigger_initial_sync: {
                type: 'boolean',
                description: 'Run an immediate full sync after storing the item',
                default: false,
              },
            },
            required: ['public_token'],
          },
        },
        {
          name: 'plaid_sync',
          description: 'Run a Plaid transactions sync for one or more stored Plaid items.',
          inputSchema: {
            type: 'object',
            properties: {
              plaid_item_id: { type: 'string', description: 'Internal Plaid item UUID to sync' },
              item_id: { type: 'string', description: 'Plaid item_id to sync (alternative identifier)' },
              sync_all: { type: 'boolean', description: 'Sync all stored Plaid items', default: false },
              force_full_sync: {
                type: 'boolean',
                description: 'Ignore stored cursor and fetch entire history',
                default: false,
              },
            },
          },
        },
        {
          name: 'plaid_list_items',
          description: 'List stored Plaid items and their metadata (excluding access tokens).',
          inputSchema: {
            type: 'object',
            properties: {
              plaid_item_id: { type: 'string', description: 'Filter by internal Plaid item UUID' },
              item_id: { type: 'string', description: 'Filter by Plaid item_id' },
            },
          },
        },
        {
          name: 'list_provider_catalog',
          description: 'List external provider metadata (capabilities, scopes, popularity).',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'sync_provider_imports',
          description: 'Trigger an import sync for a provider (optionally a specific connector).',
          inputSchema: {
            type: 'object',
            properties: {
              provider: { type: 'string', description: 'Provider identifier (e.g., x, instagram, gmail)' },
              connector_id: { type: 'string', description: 'Specific connector UUID' },
              sync_type: { type: 'string', enum: ['initial', 'incremental'], description: 'Sync strategy override' },
              limit: { type: 'number', description: 'Max records per fetch page' },
              max_pages: { type: 'number', description: 'Maximum pages per sync run' },
            },
            required: ['provider'],
          },
        },
      ],
    }));

    // Handle encrypted requests (from WebSocket bridge)
    this.server.setRequestHandler(
      { method: 'encrypted_request' } as any,
      async (request: any) => {
        // MCP server acts as blind router - just pass through encrypted payload
        // The actual decryption/encryption happens in browser/ChatGPT client
        const { encryptedPayload } = request.params || {};
        
        if (!encryptedPayload) {
          throw new McpError(ErrorCode.InvalidParams, 'Missing encryptedPayload');
        }

        // Return encrypted payload as-is (blind routing)
        // In practice, this would be forwarded to the actual tool handler
        // but for now we maintain the encrypted envelope structure
        return {
          encryptedPayload,
          // Note: Actual tool execution would happen in browser via local datastore
          // This is just a routing layer
        };
      }
    );

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        // Check if this is an encrypted request wrapper
        if (name === 'encrypted_request' && (args as any)?.encryptedPayload) {
          // Blind routing - return encrypted payload as-is
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                encryptedPayload: (args as any).encryptedPayload,
              }),
            }],
          };
        }

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
          case 'plaid_create_link_token':
            return await this.plaidCreateLinkToken(args);
          case 'plaid_exchange_public_token':
            return await this.plaidExchangePublicToken(args);
          case 'plaid_sync':
            return await this.plaidSync(args);
          case 'plaid_list_items':
            return await this.plaidListItems(args);
          case 'list_provider_catalog':
            return await this.listProviderCatalog();
          case 'sync_provider_imports':
            return await this.syncProviderImports(args);
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
    const normalizedType = normalizeRecordType(type).type;

    // Generate embedding if not provided and OpenAI is configured
    // Filter out empty arrays - they're invalid for PostgreSQL vector type
    let embedding: number[] | null = null;
    if (providedEmbedding && Array.isArray(providedEmbedding) && providedEmbedding.length > 0) {
      embedding = providedEmbedding;
    } else if (!providedEmbedding && config.openaiApiKey) {
      const recordText = getRecordText(normalizedType, properties);
      embedding = await generateEmbedding(recordText);
    }

    // Generate summary
    const summary = await generateRecordSummary(normalizedType, properties, file_urls || []);

    const insertData: Record<string, unknown> = {
      type: normalizedType,
      properties,
      file_urls: file_urls || [],
    };
    if (embedding) {
      insertData.embedding = embedding;
    }
    if (summary) {
      insertData.summary = summary;
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

    // Fetch existing record to determine if we need to regenerate embedding and summary
    const { data: existing } = await supabase
      .from('records')
      .select('type, properties, embedding, file_urls')
      .eq('id', parsed.id)
      .single();

    const updateData: Partial<NeotomaRecord> = {
      updated_at: new Date().toISOString(),
    };

    let normalizedUpdateType: string | undefined;
    if (parsed.type !== undefined) {
      normalizedUpdateType = normalizeRecordType(parsed.type).type;
      updateData.type = normalizedUpdateType;
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
      const newType = parsed.type !== undefined ? (normalizedUpdateType || normalizeRecordType(parsed.type).type) : existing?.type || '';
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

    // Regenerate summary when type, properties, or file_urls change (similar to embedding logic)
    if ((parsed.type !== undefined || parsed.properties !== undefined || parsed.file_urls !== undefined) && config.openaiApiKey) {
      const newType = parsed.type !== undefined ? (normalizedUpdateType || normalizeRecordType(parsed.type).type) : existing?.type || '';
      // Use merged properties if properties were updated, otherwise use existing
      const newProperties = parsed.properties !== undefined 
        ? (updateData.properties as Record<string, unknown> || (existing?.properties as Record<string, unknown> || {}))
        : (existing?.properties as Record<string, unknown> || {});
      const newFileUrls = parsed.file_urls !== undefined ? parsed.file_urls : (existing?.file_urls as string[] || []);
      const generatedSummary = await generateRecordSummary(newType, newProperties, newFileUrls);
      if (generatedSummary) {
        updateData.summary = generatedSummary;
      }
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
    const normalizedType = type ? normalizeRecordType(type).type : undefined;

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
        
        if (normalizedType) {
          embeddingQuery = embeddingQuery.eq('type', normalizedType);
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
      
      if (normalizedType) {
        keywordQuery = keywordQuery.eq('type', normalizedType);
      }

      const { data: keywordCandidates, error: keywordError } = await keywordQuery.limit(finalLimit * 2);
      
      if (keywordError) {
        throw keywordError;
      }

      if (keywordCandidates) {
        const searchTerms = search.map(term => term.toLowerCase());
        const keywordMatches = keywordCandidates.filter((rec: NeotomaRecord) => 
          recordMatchesKeywordSearch(rec, searchTerms)
        ).slice(0, finalLimit);

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

      if (normalizedType) {
        query = query.eq('type', normalizedType);
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
      record_id: z.string().uuid().optional(),
      file_path: z.string(),
      bucket: z.string().optional(),
      properties: z.union([z.string(), z.record(z.unknown())]).optional(),
    });

    const { record_id, file_path, bucket, properties } = schema.parse(args);

    let overrideProperties: Record<string, unknown> | undefined;
    if (typeof properties === 'string') {
      const trimmed = properties.trim();
      if (trimmed) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(trimmed);
        } catch (error) {
          throw new McpError(ErrorCode.InvalidParams, `properties must be valid JSON: ${error instanceof Error ? error.message : 'parse error'}`);
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new McpError(ErrorCode.InvalidParams, 'properties must be a JSON object');
        }
        overrideProperties = parsed as Record<string, unknown>;
      }
    } else if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
      overrideProperties = properties as Record<string, unknown>;
    }

    let existingFileUrls: string[] = [];

    const fs = await import('fs/promises');
    const path = await import('path');

    const fileBuffer = await fs.readFile(file_path);
    const stats = await fs.stat(file_path);

    const originalName = path.basename(file_path) || 'upload.bin';
    const bucketName = bucket || 'files';
    const recordId = record_id ?? randomUUID();

    if (record_id) {
      const { data: existing, error: fetchError } = await supabase
        .from('records')
        .select('file_urls')
        .eq('id', record_id)
        .single();

      if (fetchError || !existing) {
        throw new McpError(ErrorCode.InvalidParams, `Record ${record_id} not found`);
      }

      existingFileUrls = Array.isArray(existing.file_urls) ? (existing.file_urls as string[]) : [];
    }

    const safeBase = originalName.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100) || 'file';
    const ext = path.extname(safeBase) || '.bin';
    const baseName = safeBase.endsWith(ext) ? safeBase.slice(0, safeBase.length - ext.length) : safeBase;
    const fileName = `${recordId}/${Date.now()}-${baseName.replace(/\.+/g, '-')}${ext}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileBuffer, {
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const fileUrl = uploadData.path;

    if (record_id) {
      const updatedFileUrls = [...existingFileUrls, fileUrl];

      const { data: updatedData, error: updateError } = await supabase
        .from('records')
        .update({ file_urls: updatedFileUrls })
        .eq('id', record_id)
        .select()
        .single();

      if (updateError) throw updateError;

      return this.buildTextResponse(updatedData);
    }

    const created = await createRecordFromUploadedFile({
      recordId,
      buffer: fileBuffer,
      fileName: originalName,
      mimeType: 'application/octet-stream',
      fileSize: stats.size,
      fileUrl,
      overrideProperties,
    });

    return this.buildTextResponse(created);
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

  private ensurePlaidConfigured(): void {
    if (!isPlaidConfigured()) {
      throw new McpError(
        ErrorCode.InternalError,
        'Plaid integration is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET.'
      );
    }
  }

  private buildTextResponse(data: unknown): { content: Array<{ type: string; text: string }> } {
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }

  private sanitizePlaidItem(item: PlaidItemRow): SanitizedPlaidItem {
    return redactPlaidItem(item);
  }

  private summarizePlaidAccount(account: AccountBase) {
    const balances = account.balances || {};
    return {
      account_id: account.account_id,
      name: account.name,
      official_name: account.official_name,
      mask: account.mask,
      type: account.type,
      subtype: account.subtype,
      balances: {
        available: balances.available ?? null,
        current: balances.current ?? null,
        iso_currency_code: balances.iso_currency_code ?? null,
        unofficial_currency_code: balances.unofficial_currency_code ?? null,
      },
    };
  }

  private requirePlaidItem(
    item: PlaidItemRow | null,
    identifier: string | undefined
  ): PlaidItemRow {
    if (!item) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Plaid item ${identifier ?? '(unknown)'} not found`
      );
    }
    return item;
  }

  private async plaidCreateLinkToken(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    this.ensurePlaidConfigured();
    const schema = z.object({
      user_id: z.string().min(1).optional(),
      client_name: z.string().min(1).optional(),
      access_token: z.string().optional(),
      products: z.array(z.string()).min(1).optional(),
      redirect_uri: z.string().url().optional(),
    });

    const parsed = schema.parse(args ?? {});
    const response = await createLinkToken({
      userId: parsed.user_id || config.plaid.linkDefaults?.userId || '',
      clientName: parsed.client_name || config.plaid.linkDefaults?.clientName,
      accessToken: parsed.access_token,
      products: parsed.products,
      redirectUri: parsed.redirect_uri,
    });

    return this.buildTextResponse(response);
  }

  private async plaidExchangePublicToken(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    this.ensurePlaidConfigured();
    const schema = z.object({
      public_token: z.string().min(1),
      trigger_initial_sync: z.boolean().optional(),
    });

    const parsed = schema.parse(args ?? {});
    const exchangeResult = await exchangePublicToken(parsed.public_token);
    const context = await buildPlaidItemContext(exchangeResult.accessToken);

    const storedItem = await persistPlaidItem({
      itemId: exchangeResult.itemId,
      accessToken: exchangeResult.accessToken,
      environment: config.plaid.environment,
      products: config.plaid.products,
      countryCodes: config.plaid.countryCodes,
      institutionId: context.item.institution_id ?? null,
      institutionName: context.institution?.name ?? null,
      webhookStatus: context.item.webhook ?? null,
    });

    let syncSummary: PlaidSyncSummary | null = null;
    if (parsed.trigger_initial_sync) {
      syncSummary = await syncPlaidItem({
        plaidItemId: storedItem.id,
        forceFullSync: true,
      });
    }

    const response = {
      item: this.sanitizePlaidItem(storedItem),
      institution: context.institution
        ? {
            id: context.institution.institution_id,
            name: context.institution.name,
            url: context.institution.url,
            primary_color: context.institution.primary_color,
          }
        : context.item.institution_id
        ? {
            id: context.item.institution_id,
            name: storedItem.institution_name,
          }
        : null,
      accounts: context.accounts.map((account) => this.summarizePlaidAccount(account)),
      request_id: exchangeResult.requestId,
      initial_sync: syncSummary,
    };

    return this.buildTextResponse(response);
  }

  private async plaidSync(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    this.ensurePlaidConfigured();
    const schema = z.object({
      plaid_item_id: z.string().uuid().optional(),
      item_id: z.string().optional(),
      sync_all: z.boolean().optional().default(false),
      force_full_sync: z.boolean().optional().default(false),
    });

    const parsed = schema.parse(args ?? {});

    if (parsed.sync_all && (parsed.plaid_item_id || parsed.item_id)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'sync_all cannot be combined with plaid_item_id or item_id.'
      );
    }

    const targets: PlaidItemRow[] = [];

    if (parsed.sync_all) {
      const items = await listPlaidItemsFromStore();
      if (items.length === 0) {
        throw new McpError(ErrorCode.InvalidRequest, 'No Plaid items available to sync.');
      }
      targets.push(...items);
    } else if (parsed.plaid_item_id) {
      const item = this.requirePlaidItem(
        await getPlaidItemById(parsed.plaid_item_id),
        parsed.plaid_item_id
      );
      targets.push(item);
    } else if (parsed.item_id) {
      const item = this.requirePlaidItem(
        await getPlaidItemByItemId(parsed.item_id),
        parsed.item_id
      );
      targets.push(item);
    } else {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Provide plaid_item_id, item_id, or set sync_all to true.'
      );
    }

    const summaries: Array<{
      item: SanitizedPlaidItem;
      summary: PlaidSyncSummary;
    }> = [];

    for (const item of targets) {
      const summary = await syncPlaidItem({
        plaidItemId: item.id,
        forceFullSync: parsed.force_full_sync,
      });
      const refreshed = (await getPlaidItemById(item.id)) ?? item;
      summaries.push({
        item: this.sanitizePlaidItem(refreshed),
        summary,
      });
    }

    return this.buildTextResponse(summaries);
  }

  private async plaidListItems(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    this.ensurePlaidConfigured();
    const schema = z.object({
      plaid_item_id: z.string().uuid().optional(),
      item_id: z.string().optional(),
    });

    const parsed = schema.parse(args ?? {});
    let items: PlaidItemRow[] = [];

    if (parsed.plaid_item_id) {
      const item = this.requirePlaidItem(
        await getPlaidItemById(parsed.plaid_item_id),
        parsed.plaid_item_id
      );
      items = [item];
    } else if (parsed.item_id) {
      const item = this.requirePlaidItem(
        await getPlaidItemByItemId(parsed.item_id),
        parsed.item_id
      );
      items = [item];
    } else {
      items = await listPlaidItemsFromStore();
    }

    const sanitized = items.map((item) => this.sanitizePlaidItem(item));
    return this.buildTextResponse(sanitized);
  }

  private async listProviderCatalog(): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.buildTextResponse(providerCatalog);
  }

  private async syncProviderImports(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      provider: z.string(),
      connector_id: z.string().uuid().optional(),
      sync_type: z.enum(['initial', 'incremental']).optional(),
      limit: z.number().int().positive().optional(),
      max_pages: z.number().int().positive().optional(),
    });
    const parsed = schema.parse(args ?? {});
    const definition = getProviderDefinition(parsed.provider);
    if (!definition) {
      throw new McpError(ErrorCode.InvalidParams, `Unknown provider: ${parsed.provider}`);
    }

    if (parsed.connector_id) {
      const result = await runConnectorSync({
        connectorId: parsed.connector_id,
        syncType: parsed.sync_type,
        limit: parsed.limit,
        maxPages: parsed.max_pages,
      });
      return this.buildTextResponse({ provider: definition, results: [result] });
    }

    const results = await runAllConnectorSyncs({
      provider: parsed.provider,
      limitPerConnector: parsed.limit,
      maxPages: parsed.max_pages,
    });
    return this.buildTextResponse({ provider: definition, results });
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

