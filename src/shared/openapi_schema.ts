import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { MCP_TOOL_TO_OPERATION_ID, OPENAPI_OPERATION_MAPPINGS } from "./contract_mappings.js";

type OpenApiSchema = Record<string, unknown>;

type OpenApiOperation = {
  operationId?: string;
  parameters?: Array<{
    name: string;
    in: "query" | "path" | "header" | "cookie";
    required?: boolean;
    schema?: OpenApiSchema;
  }>;
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: OpenApiSchema }>;
  };
};

type OpenApiSpec = {
  paths?: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
};

let cachedSpec: OpenApiSpec | null = null;
let cachedOperations: Map<string, OpenApiOperation> | null = null;

function loadOpenApiSpec(): OpenApiSpec {
  if (cachedSpec) {
    return cachedSpec;
  }
  const openApiPath = join(process.cwd(), "openapi.yaml");
  const raw = readFileSync(openApiPath, "utf-8");
  cachedSpec = yaml.load(raw) as OpenApiSpec;
  return cachedSpec;
}

function getOperationIndex(): Map<string, OpenApiOperation> {
  if (cachedOperations) {
    return cachedOperations;
  }
  const spec = loadOpenApiSpec();
  const operations = new Map<string, OpenApiOperation>();
  const paths = spec.paths ?? {};
  for (const methods of Object.values(paths)) {
    for (const operation of Object.values(methods)) {
      if (operation?.operationId) {
        operations.set(operation.operationId, operation);
      }
    }
  }
  cachedOperations = operations;
  return operations;
}

function resolveSchema(schema: OpenApiSchema, spec: OpenApiSpec): OpenApiSchema {
  const ref = schema.$ref;
  if (typeof ref === "string" && ref.startsWith("#/components/schemas/")) {
    const schemaName = ref.replace("#/components/schemas/", "");
    const resolved = spec.components?.schemas?.[schemaName];
    if (!resolved) {
      throw new Error(`OpenAPI schema not found: ${schemaName}`);
    }
    return resolveSchema(resolved, spec);
  }

  if (Array.isArray(schema.allOf)) {
    const merged: OpenApiSchema = { type: "object", properties: {}, required: [] };
    for (const entry of schema.allOf) {
      const resolved = resolveSchema(entry as OpenApiSchema, spec);
      if (resolved.type === "object") {
        const properties = (resolved.properties ?? {}) as Record<string, unknown>;
        const required = (resolved.required ?? []) as string[];
        merged.properties = { ...(merged.properties as object), ...properties };
        merged.required = Array.from(
          new Set([...(merged.required as string[]), ...required])
        );
      }
    }
    return merged;
  }

  if (schema.type === "array" && schema.items) {
    return { ...schema, items: resolveSchema(schema.items as OpenApiSchema, spec) };
  }

  if (schema.type === "object" && schema.properties) {
    const resolvedProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      resolvedProps[key] = resolveSchema(value as OpenApiSchema, spec);
    }
    return { ...schema, properties: resolvedProps };
  }

  return schema;
}

function buildParametersSchema(
  parameters: OpenApiOperation["parameters"],
  spec: OpenApiSpec
): OpenApiSchema {
  const schema: OpenApiSchema = { type: "object", properties: {}, required: [] };
  if (!parameters) {
    return schema;
  }
  for (const param of parameters) {
    if (!param?.name || !param.schema) {
      continue;
    }
    const properties = schema.properties as Record<string, unknown>;
    properties[param.name] = resolveSchema(param.schema, spec);
    if (param.required) {
      (schema.required as string[]).push(param.name);
    }
  }
  return schema;
}

function mergeSchemas(base: OpenApiSchema, extra: OpenApiSchema): OpenApiSchema {
  const baseProps = (base.properties ?? {}) as Record<string, unknown>;
  const extraProps = (extra.properties ?? {}) as Record<string, unknown>;
  const baseRequired = (base.required ?? []) as string[];
  const extraRequired = (extra.required ?? []) as string[];
  return {
    type: "object",
    properties: { ...baseProps, ...extraProps },
    required: Array.from(new Set([...baseRequired, ...extraRequired])),
  };
}

export function getOpenApiInputSchemaForOperationId(operationId: string): OpenApiSchema {
  const spec = loadOpenApiSpec();
  const operation = getOperationIndex().get(operationId);
  if (!operation) {
    throw new Error(`OpenAPI operation not found: ${operationId}`);
  }

  const parametersSchema = buildParametersSchema(operation.parameters, spec);
  const jsonSchema = operation.requestBody?.content?.["application/json"]?.schema;
  if (jsonSchema) {
    const resolvedBody = resolveSchema(jsonSchema, spec);
    if (resolvedBody.type === "object") {
      return mergeSchemas(parametersSchema, resolvedBody);
    }
    return resolvedBody;
  }

  return parametersSchema;
}

export function getOpenApiInputSchemaForTool(toolName: string): OpenApiSchema | null {
  const operationId = MCP_TOOL_TO_OPERATION_ID[toolName];
  if (!operationId) {
    return null;
  }
  return getOpenApiInputSchemaForOperationId(operationId);
}

export function getOpenApiInputSchemaOrThrow(toolName: string): OpenApiSchema {
  const schema = getOpenApiInputSchemaForTool(toolName);
  if (!schema) {
    throw new Error(`OpenAPI schema not mapped for MCP tool: ${toolName}`);
  }
  return schema;
}

export function listOpenApiMappedMcpTools(): string[] {
  return OPENAPI_OPERATION_MAPPINGS.flatMap((mapping) =>
    mapping.mcpTool ? [mapping.mcpTool] : []
  );
}
