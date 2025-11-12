// Dynamic Form Generator - Converts OpenAPI schemas to HTML form fields
class FormGenerator {
  constructor(container) {
    this.container = container;
  }

  // Generate form field based on schema
  generateField(name, schema, required = false, path = '') {
    const fieldPath = path ? `${path}.${name}` : name;
    const fieldId = `field_${fieldPath.replace(/\./g, '_')}`;

    if (!schema || typeof schema !== 'object') {
      return this.createTextInput(fieldId, name, '', required, schema);
    }

    // Handle arrays
    if (schema.type === 'array') {
      return this.createArrayField(fieldId, name, schema, required, fieldPath);
    }

    // Handle objects
    if (schema.type === 'object' || schema.properties) {
      return this.createObjectField(fieldId, name, schema, required, fieldPath);
    }

    // Handle enums
    if (schema.enum && Array.isArray(schema.enum)) {
      return this.createSelect(fieldId, name, schema, required);
    }

    // Handle boolean
    if (schema.type === 'boolean') {
      return this.createCheckbox(fieldId, name, schema, required);
    }

    // Handle number/integer
    if (schema.type === 'number' || schema.type === 'integer') {
      return this.createNumberInput(fieldId, name, schema, required);
    }

    // Handle string (default) - check for example if no default
    const defaultValue = schema.default !== undefined ? schema.default : (schema.example !== undefined ? schema.example : '');
    return this.createTextInput(fieldId, name, defaultValue, required, schema);
  }

  createTextInput(id, name, defaultValue, required, schema) {
    const div = document.createElement('div');
    div.className = 'form-field';
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = name + (required ? ' *' : '');
    if (schema && schema.description) {
      label.title = schema.description;
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.id = id;
    input.name = name;
    input.value = defaultValue;
    input.required = required;
    if (schema && schema.format === 'date-time') {
      input.type = 'datetime-local';
    } else if (schema && schema.format === 'date') {
      input.type = 'date';
    } else if (schema && schema.format === 'email') {
      input.type = 'email';
    }
    if (schema && schema.pattern) {
      input.pattern = schema.pattern;
    }
    div.appendChild(label);
    div.appendChild(input);
    return div;
  }

  createNumberInput(id, name, schema, required) {
    const div = document.createElement('div');
    div.className = 'form-field';
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = name + (required ? ' *' : '');
    if (schema && schema.description) {
      label.title = schema.description;
    }
    const input = document.createElement('input');
    input.type = 'number';
    input.id = id;
    input.name = name;
    if (schema && schema.default !== undefined) {
      input.value = schema.default;
    }
    if (schema && schema.minimum !== undefined) {
      input.min = schema.minimum;
    }
    if (schema && schema.maximum !== undefined) {
      input.max = schema.maximum;
    }
    input.required = required;
    div.appendChild(label);
    div.appendChild(input);
    return div;
  }

  createCheckbox(id, name, schema, required) {
    const div = document.createElement('div');
    div.className = 'form-field';
    const label = document.createElement('label');
    label.htmlFor = id;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = id;
    checkbox.name = name;
    checkbox.checked = schema && schema.default === true;
    checkbox.required = required;
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(' ' + name + (required ? ' *' : '')));
    if (schema && schema.description) {
      label.title = schema.description;
    }
    div.appendChild(label);
    return div;
  }

  createSelect(id, name, schema, required) {
    const div = document.createElement('div');
    div.className = 'form-field';
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = name + (required ? ' *' : '');
    if (schema && schema.description) {
      label.title = schema.description;
    }
    const select = document.createElement('select');
    select.id = id;
    select.name = name;
    select.required = required;
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '-- Select --';
    select.appendChild(emptyOption);
    for (const value of schema.enum) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      if (schema.default === value) {
        option.selected = true;
      }
      select.appendChild(option);
    }
    div.appendChild(label);
    div.appendChild(select);
    return div;
  }

  createArrayField(id, name, schema, required, path) {
    const div = document.createElement('div');
    div.className = 'form-field form-field-array';
    const label = document.createElement('label');
    label.textContent = name + (required ? ' *' : '');
    if (schema && schema.description) {
      label.title = schema.description;
    }
    const textarea = document.createElement('textarea');
    textarea.id = id;
    textarea.name = name;
    textarea.placeholder = 'JSON array, e.g., ["item1", "item2"]';
    textarea.rows = 3;
    textarea.required = required;
    div.appendChild(label);
    div.appendChild(textarea);
    return div;
  }

  createObjectField(id, name, schema, required, path) {
    const div = document.createElement('div');
    div.className = 'form-field form-field-object';
    const label = document.createElement('label');
    label.textContent = name + (required ? ' *' : '');
    if (schema && schema.description) {
      label.title = schema.description;
    }
    const textarea = document.createElement('textarea');
    textarea.id = id;
    textarea.name = name;
    textarea.placeholder = 'JSON object, e.g., {"key": "value"}';
    textarea.rows = 6;
    textarea.required = required;
    if (schema && schema.example) {
      textarea.value = JSON.stringify(schema.example, null, 2);
    }
    div.appendChild(label);
    div.appendChild(textarea);
    return div;
  }

  // Generate form for endpoint
  generateForm(endpoint, parser) {
    this.container.innerHTML = '';

    // Add endpoint info
    const infoDiv = document.createElement('div');
    infoDiv.className = 'endpoint-info';
    const methodSpan = document.createElement('span');
    methodSpan.className = `method method-${endpoint.method.toLowerCase()}`;
    methodSpan.textContent = endpoint.method;
    const pathSpan = document.createElement('span');
    pathSpan.className = 'path';
    pathSpan.textContent = endpoint.path;
    infoDiv.appendChild(methodSpan);
    infoDiv.appendChild(pathSpan);
    if (endpoint.summary) {
      const summaryP = document.createElement('p');
      summaryP.className = 'summary';
      summaryP.textContent = endpoint.summary;
      infoDiv.appendChild(summaryP);
    }
    this.container.appendChild(infoDiv);

    // Parameters section
    if (endpoint.parameters && endpoint.parameters.length > 0) {
      const paramsSection = document.createElement('div');
      paramsSection.className = 'form-section';
      const paramsTitle = document.createElement('h3');
      paramsTitle.textContent = 'Parameters';
      paramsSection.appendChild(paramsTitle);

      for (const param of endpoint.parameters) {
        const paramSchema = parser.getParameterSchema(param);
        const field = this.generateField(
          param.name,
          paramSchema || { type: param.schema?.type || 'string' },
          param.required || false
        );
        paramsSection.appendChild(field);
      }

      this.container.appendChild(paramsSection);
    }

    // Request body section
    const bodySchema = parser.getRequestBodySchema(endpoint);
    if (bodySchema) {
      const bodySection = document.createElement('div');
      bodySection.className = 'form-section';
      const bodyTitle = document.createElement('h3');
      bodyTitle.textContent = 'Request Body';
      bodySection.appendChild(bodyTitle);

      // Get example from request body if available
      let bodyExample = null;
      const requestBody = endpoint.requestBody;
      if (requestBody && requestBody.content) {
        const jsonContent = requestBody.content['application/json'];
        if (jsonContent && jsonContent.example) {
          bodyExample = jsonContent.example;
        }
      }

      if (bodySchema.type === 'object' && bodySchema.properties) {
        const required = bodySchema.required || [];
        for (const [propName, propSchema] of Object.entries(bodySchema.properties)) {
          const resolved = parser.resolveSchema(propSchema);
          // Use example value if available
          if (bodyExample && bodyExample[propName] !== undefined) {
            resolved.example = bodyExample[propName];
          }
          const field = this.generateField(propName, resolved, required.includes(propName));
          bodySection.appendChild(field);
        }
      } else {
        // Single field for non-object body
        if (bodyExample) {
          bodySchema.example = bodyExample;
        }
        const field = this.generateField('body', bodySchema, endpoint.requestBody?.required || false);
        bodySection.appendChild(field);
      }

      this.container.appendChild(bodySection);
    }

    // Check for multipart/form-data
    const requestBody = endpoint.requestBody;
    if (requestBody && requestBody.content && requestBody.content['multipart/form-data']) {
      const multipartSection = document.createElement('div');
      multipartSection.className = 'form-section';
      const multipartTitle = document.createElement('h3');
      multipartTitle.textContent = 'File Upload';
      multipartSection.appendChild(multipartTitle);

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.id = 'file_upload';
      fileInput.name = 'file';
      const fileLabel = document.createElement('label');
      fileLabel.htmlFor = 'file_upload';
      fileLabel.textContent = 'File *';
      const fileDiv = document.createElement('div');
      fileDiv.className = 'form-field';
      fileDiv.appendChild(fileLabel);
      fileDiv.appendChild(fileInput);
      multipartSection.appendChild(fileDiv);

      // Add other multipart fields if schema exists
      const multipartSchema = parser.resolveSchema(requestBody.content['multipart/form-data'].schema);
      if (multipartSchema && multipartSchema.properties) {
        const required = multipartSchema.required || [];
        for (const [propName, propSchema] of Object.entries(multipartSchema.properties)) {
          if (propName !== 'file') {
            const resolved = parser.resolveSchema(propSchema);
            const field = this.generateField(propName, resolved, required.includes(propName));
            multipartSection.appendChild(field);
          }
        }
      }

      this.container.appendChild(multipartSection);
    }
  }

  // Collect form values
  collectFormValues(endpoint, parser) {
    const values = {};
    const form = this.container;
    const fileInput = form.querySelector('#file_upload');

    // Collect parameters
    if (endpoint.parameters) {
      for (const param of endpoint.parameters) {
        const input = form.querySelector(`#field_${param.name.replace(/\./g, '_')}`);
        if (input) {
          let value = input.value;
          if (input.type === 'checkbox') {
            value = input.checked;
          } else if (input.type === 'number') {
            value = value ? parseFloat(value) : undefined;
          } else if (input.tagName === 'SELECT') {
            value = value || undefined;
          }
          if (value !== undefined && value !== '') {
            // Store both query and path parameters
            values[param.name] = value;
          } else if (param.required) {
            throw new Error(`Required parameter ${param.name} is missing`);
          }
        } else if (param.required) {
          throw new Error(`Required parameter ${param.name} is missing`);
        }
      }
    }

    // Collect request body
    const bodySchema = parser.getRequestBodySchema(endpoint);
    if (bodySchema) {
      if (bodySchema.type === 'object' && bodySchema.properties) {
        const bodyObj = {};
        const required = bodySchema.required || [];
        for (const [propName, propSchema] of Object.entries(bodySchema.properties)) {
          if (propName === 'file') {
            if (fileInput && fileInput.files && fileInput.files.length > 0) {
              continue;
            }
            if (required.includes(propName)) {
              throw new Error(`Required field ${propName} is missing`);
            }
            continue;
          }
          const input = form.querySelector(`#field_${propName.replace(/\./g, '_')}`);
          if (input) {
            let value = input.value;
            if (input.type === 'checkbox') {
              value = input.checked;
            } else if (input.type === 'number') {
              value = value ? parseFloat(value) : undefined;
            } else if (input.tagName === 'SELECT') {
              value = value || undefined;
            } else if (input.tagName === 'TEXTAREA' && (propSchema.type === 'array' || propSchema.type === 'object')) {
              try {
                value = value ? JSON.parse(value) : undefined;
              } catch (e) {
                throw new Error(`Invalid JSON for ${propName}: ${e.message}`);
              }
            }
            if (value !== undefined && value !== '') {
              bodyObj[propName] = value;
            } else if (required.includes(propName)) {
              throw new Error(`Required field ${propName} is missing`);
            }
          } else if (required.includes(propName)) {
            throw new Error(`Required field ${propName} is missing`);
          }
        }
        if (Object.keys(bodyObj).length > 0) {
          values.body = bodyObj;
        }
      } else {
        const input = form.querySelector('#field_body');
        if (input) {
          let value = input.value;
          if (input.tagName === 'TEXTAREA') {
            try {
              value = value ? JSON.parse(value) : undefined;
            } catch (e) {
              throw new Error(`Invalid JSON for body: ${e.message}`);
            }
          }
          if (value !== undefined && value !== '') {
            values.body = value;
          }
        }
      }
    }

    // Handle multipart
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      values.file = fileInput.files[0];
      // Collect other multipart fields
      const requestBody = endpoint.requestBody;
      if (requestBody && requestBody.content && requestBody.content['multipart/form-data']) {
        const multipartSchema = parser.resolveSchema(requestBody.content['multipart/form-data'].schema);
        if (multipartSchema && multipartSchema.properties) {
          const multipartObj = {};
          for (const [propName, propSchema] of Object.entries(multipartSchema.properties)) {
            if (propName !== 'file') {
              const input = form.querySelector(`#field_${propName.replace(/\./g, '_')}`);
              if (input) {
                let value = input.value;
                if (input.type === 'checkbox') {
                  value = input.checked;
                } else if (input.type === 'number') {
                  value = value ? parseFloat(value) : undefined;
                }
                if (value !== undefined && value !== '') {
                  multipartObj[propName] = value;
                }
              }
            }
          }
          if (Object.keys(multipartObj).length > 0) {
            values.multipart = multipartObj;
          }
        }
      }
    }

    return values;
  }
}

