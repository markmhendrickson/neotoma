// OpenAPI Parser - Fetches and parses OpenAPI spec, resolves $ref references
class OpenAPIParser {
  constructor(spec) {
    this.spec = spec;
    this.components = spec.components || {};
    this.schemas = this.components.schemas || {};
  }

  // Resolve $ref references (e.g., #/components/schemas/StoreRecordRequest)
  resolveRef(ref) {
    if (!ref || !ref.startsWith('#/')) {
      return null;
    }
    const parts = ref.slice(2).split('/');
    let current = this.spec;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return null;
      }
    }
    // If resolved object has $ref, resolve recursively
    if (current && typeof current === 'object' && '$ref' in current) {
      return this.resolveRef(current.$ref);
    }
    return current;
  }

  // Resolve schema (handles $ref, allOf, oneOf, anyOf)
  resolveSchema(schema) {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    // Handle $ref
    if (schema.$ref) {
      const resolved = this.resolveRef(schema.$ref);
      return resolved ? this.resolveSchema(resolved) : schema;
    }

    // Handle allOf (merge all schemas)
    if (schema.allOf && Array.isArray(schema.allOf)) {
      const merged = { type: 'object', properties: {}, required: [] };
      for (const item of schema.allOf) {
        const resolved = this.resolveSchema(item);
        if (resolved.properties) {
          Object.assign(merged.properties, resolved.properties);
        }
        if (resolved.required) {
          merged.required.push(...resolved.required);
        }
      }
      return merged;
    }

    // Handle oneOf/anyOf (use first for now)
    if ((schema.oneOf || schema.anyOf) && Array.isArray(schema.oneOf || schema.anyOf)) {
      const first = (schema.oneOf || schema.anyOf)[0];
      return this.resolveSchema(first);
    }

    return schema;
  }

  // Extract endpoints from paths
  getEndpoints() {
    const endpoints = [];
    const paths = this.spec.paths || {};

    for (const [path, pathItem] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) {
          const op = operation;
          endpoints.push({
            method: method.toUpperCase(),
            path,
            operationId: op.operationId || `${method}_${path.replace(/\//g, '_')}`,
            summary: op.summary || op.operationId || path,
            description: op.description || '',
            parameters: op.parameters || [],
            requestBody: op.requestBody || null,
            responses: op.responses || {},
          });
        }
      }
    }

    return endpoints.sort((a, b) => {
      if (a.path !== b.path) return a.path.localeCompare(b.path);
      return a.method.localeCompare(b.method);
    });
  }

  // Get request body schema for an endpoint
  getRequestBodySchema(endpoint) {
    if (!endpoint.requestBody) {
      return null;
    }

    const content = endpoint.requestBody.content || {};
    const jsonContent = content['application/json'];
    if (jsonContent && jsonContent.schema) {
      return this.resolveSchema(jsonContent.schema);
    }

    const multipartContent = content['multipart/form-data'];
    if (multipartContent && multipartContent.schema) {
      return this.resolveSchema(multipartContent.schema);
    }

    return null;
  }

  // Get parameter schema
  getParameterSchema(param) {
    if (param.schema) {
      return this.resolveSchema(param.schema);
    }
    return null;
  }
}

// Fetch and parse OpenAPI spec
async function fetchOpenAPISpec(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/openapi.yaml`);
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${response.status}`);
    }
    const yamlText = await response.text();
    // Parse YAML using js-yaml (loaded from CDN)
    const spec = jsyaml.load(yamlText);
    return new OpenAPIParser(spec);
  } catch (error) {
    console.error('Error fetching/parsing OpenAPI spec:', error);
    throw error;
  }
}

