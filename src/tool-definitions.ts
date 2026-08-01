import type { Tool } from '@modelcontextprotocol/sdk/types.js';

const COLLECTION_FIELD_SCHEMA = {
  type: 'object',
  description: 'PocketBase collection field definition object',
  properties: {
    name: { type: 'string', description: 'Unique field name' },
    type: { type: 'string', description: 'PocketBase field type' },
    required: { type: 'boolean', description: 'Field must have a value' },
    hidden: { type: 'boolean', description: 'Hide from API response' },
    presentable: { type: 'boolean', description: 'Show in relation preview labels' },
    system: { type: 'boolean', description: 'Prevents renaming/deletion' },
    min: { type: 'number', description: 'Minimum text length or numeric value' },
    max: { type: 'number', description: 'Maximum text length or numeric value' },
    pattern: { type: 'string', description: 'Regex pattern validation for text fields' },
    autogeneratePattern: { type: 'string', description: 'Auto-generate pattern for text fields' },
    onlyInt: { type: 'boolean', description: 'Allow only integers for number fields' },
    noDecimal: { type: 'boolean', description: 'Disallow decimal places for number fields' },
    exceptDomains: {
      description: 'Blocked email domains',
      items: { type: 'string' },
    },
    onlyDomains: {
      type: 'array',
      description: 'Allowed email domains',
      items: { type: 'string' },
    },
    onCreate: { type: 'boolean', description: 'Auto-set autodate field on record create' },
    onUpdate: { type: 'boolean', description: 'Auto-set autodate field on record update' },
    values: {
      type: 'array',
      description: 'Allowed select values',
      items: { type: 'string' },
    },
    maxSelect: { type: 'number', description: 'Maximum selected options, files, or relations' },
    maxSize: { type: 'number', description: 'Maximum file size in bytes' },
    mimeTypes: {
      type: 'array',
      description: 'Allowed file MIME types',
      items: { type: 'string' },
    },
    thumbs: {
      type: 'array',
      description: 'Generated thumbnail sizes',
      items: { type: 'string' },
    },
    protected: { type: 'boolean', description: 'Require auth to access uploaded files' },
    collectionId: { type: 'string', description: 'Target collection ID for relation fields' },
    cascadeDelete: { type: 'boolean', description: 'Delete records when related record is deleted' },
  },
  required: ['name', 'type'],
  additionalProperties: true,
} as const;

export const TOOL_DEFINITIONS = [
    {
      name: 'health',
      description: 'Check PocketBase server health status',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: 'set_base_url',
      description: 'Set PocketBase server URL for this MCP session and clear auth token',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'PocketBase base URL (http or https)',
          },
        },
        required: ['url'],
      },
    },
    {
      name: 'auth_admin',
      description: 'Authenticate as PocketBase admin/superuser',
      inputSchema: {
        type: 'object',
        properties: {
          identity: {
            type: 'string',
            description: 'Superuser email/identity',
          },
          password: {
            type: 'string',
            description: 'Superuser password',
          },
        },
        required: ['identity', 'password'],
      },
    },
    {
      name: 'auth_user',
      description: 'Authenticate as PocketBase auth collection user',
      inputSchema: {
        type: 'object',
        properties: {
          collection: {
            type: 'string',
            description: 'Auth collection name or ID',
          },
          identity: {
            type: 'string',
            description: 'User email or username',
          },
          password: {
            type: 'string',
            description: 'User password',
          },
        },
        required: ['collection', 'identity', 'password'],
      },
    },
    {
      name: 'get_auth_status',
      description: 'Check current authentication status/token state',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: 'logout',
      description: 'Clear current authentication session token',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: 'list_collections',
      description: 'List all collections with optional pagination',
      inputSchema: {
        type: 'object',
        properties: {
          page: {
            type: 'integer',
            description: 'Page number (default: 1)',
          },
          perPage: {
            type: 'integer',
            description: 'Collections per page (default: 30, max: 500)',
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'view_collection',
      description: 'View a collection by name or ID',
      inputSchema: {
        type: 'object',
        properties: {
          collection: {
            type: 'string',
            description: 'Collection name or ID',
          },
        },
        required: ['collection'],
      },
    },
    {
      name: 'get_field_schema_reference',
      description:
        'Get PocketBase collection field schema reference, including create examples and update_collection field patch examples. Call this before create_collection or schema updates to see correct field syntax.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: 'create_collection',
      description:
        'Create a new collection. Call get_field_schema_reference first to see correct field syntax. For base/auth collections, created and updated autodate system fields are auto-added unless you provide them.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Collection name',
          },
          type: {
            type: 'string',
            description: 'Collection type: base, auth, or view',
            enum: ['base', 'auth', 'view'],
          },
          fields: {
            type: 'array',
            description: 'Array of field definitions',
            items: COLLECTION_FIELD_SCHEMA,
          },
          listRule: {
            type: ['string', 'null'],
            description: 'List API rule (null=disallow, ""=allow all)',
          },
          viewRule: {
            type: ['string', 'null'],
            description: 'View API rule',
          },
          createRule: {
            type: ['string', 'null'],
            description: 'Create API rule',
          },
          updateRule: {
            type: ['string', 'null'],
            description: 'Update API rule',
          },
          deleteRule: {
            type: ['string', 'null'],
            description: 'Delete API rule',
          },
          indexes: {
            type: 'array',
            description: 'SQL index definitions',
            items: {
              type: 'string',
              description: 'SQL CREATE INDEX statement',
            },
          },
        },
        required: ['name', 'fields'],
      },
    },
    {
      name: 'update_collection',
      description:
        'Update an existing collection. Partial updates are allowed for collection properties. You may either send a full fields array, or let the MCP server merge schema patches via fieldUpdates/removeFields before sending the final fields array to PocketBase. Call get_field_schema_reference for concrete patch examples.',
      inputSchema: {
        type: 'object',
        properties: {
          collection: {
            type: 'string',
            description: 'Collection name or ID',
          },
          data: {
            type: 'object',
            description:
              'Collection data to update. You may send only the properties you want to change. If you also use fieldUpdates/removeFields, MCP will fetch the current collection, merge the field changes, and send the final full fields array to PocketBase.',
            additionalProperties: true,
          },
          fields: {
            type: 'array',
            description:
              'Optional shorthand to replace the collection fields (schema) directly. This is the full final fields array.',
            items: COLLECTION_FIELD_SCHEMA,
          },
          fieldUpdates: {
            type: 'array',
            description:
              'Optional MCP-side partial field patches. Existing fields are merged by name. New fields must include at least name and type.',
            items: {
              ...COLLECTION_FIELD_SCHEMA,
              required: ['name'],
            },
          },
          removeFields: {
            type: 'array',
            description:
              'Optional field names to remove. MCP removes them from the current schema before sending the final full fields array to PocketBase.',
            items: {
              type: 'string',
              description: 'Field name to remove',
            },
          },
          indexes: {
            type: 'array',
            description:
              'Optional indexes definitions. Note that view collections may not support indexes.',
            items: {
              type: 'string',
              description: 'SQL CREATE INDEX statement',
            },
          },
          listRule: {
            type: ['string', 'null'],
            description: 'List API rule (null=disallow, ""=allow all)',
          },
          viewRule: {
            type: ['string', 'null'],
            description: 'View API rule',
          },
          createRule: {
            type: ['string', 'null'],
            description: 'Create API rule',
          },
          updateRule: {
            type: ['string', 'null'],
            description: 'Update API rule',
          },
          deleteRule: {
            type: ['string', 'null'],
            description: 'Delete API rule',
          },
        },
        required: ['collection'],
      },
    },
    {
      name: 'delete_collection',
      description: 'Delete a collection',
      inputSchema: {
        type: 'object',
        properties: {
          collection: {
            type: 'string',
            description: 'Collection name or ID',
          },
        },
        required: ['collection'],
      },
    },
    {
      name: 'get_rules_reference',
      description:
        'Get API rules syntax reference. Call this BEFORE update_collection_rules to understand filter syntax, operators, modifiers, and macros.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: 'update_collection_rules',
      description:
        'Update collection API rules (access control). Call get_rules_reference first for syntax. Use null for admin-only, "" for public, or filter expression.',
      inputSchema: {
        type: 'object',
        properties: {
          collection: {
            type: 'string',
            description: 'Collection name or ID',
          },
          listRule: {
            type: ['string', 'null'],
            description:
              'Rule for listing records. null=admin only, ""=public, or filter expression',
          },
          viewRule: {
            type: ['string', 'null'],
            description: 'Rule for viewing single record',
          },
          createRule: {
            type: ['string', 'null'],
            description: 'Rule for creating records',
          },
          updateRule: {
            type: ['string', 'null'],
            description: 'Rule for updating records',
          },
          deleteRule: {
            type: ['string', 'null'],
            description: 'Rule for deleting records',
          },
        },
        required: ['collection'],
      },
    },
    {
      name: 'list_records',
      description:
        'List records from a collection with optional filtering, sorting, and pagination',
      inputSchema: {
        type: 'object',
        properties: {
          collection: {
            type: 'string',
            description: 'Collection name or ID',
          },
          page: {
            type: 'integer',
            description: 'Page number (default: 1)',
          },
          perPage: {
            type: 'integer',
            description: 'Records per page (default: 30, max: 500)',
          },
          sort: {
            type: 'string',
            description: 'Sort field(s), prefix with - for DESC (e.g., -created,title)',
          },
          filter: {
            type: 'string',
            description: 'Filter expression (e.g., title~"test" && created>"2022-01-01")',
          },
          expand: {
            type: 'string',
            description: 'Relations to expand (e.g., relField1,relField2.subRelField)',
          },
          fields: {
            type: 'string',
            description: 'Comma-separated fields to return',
          },
        },
        required: ['collection'],
      },
    },
    {
      name: 'view_record',
      description: 'View a single record by ID',
      inputSchema: {
        type: 'object',
        properties: {
          collection: {
            type: 'string',
            description: 'Collection name or ID',
          },
          id: {
            type: 'string',
            description: 'Record ID',
          },
          expand: {
            type: 'string',
            description: 'Relations to expand',
          },
          fields: {
            type: 'string',
            description: 'Comma-separated fields to return',
          },
        },
        required: ['collection', 'id'],
      },
    },
    {
      name: 'create_record',
      description: 'Create a new record in a collection',
      inputSchema: {
        type: 'object',
        properties: {
          collection: {
            type: 'string',
            description: 'Collection name or ID',
          },
          data: {
            type: 'object',
            description: 'Record data (field values)',
          },
          expand: {
            type: 'string',
            description: 'Relations to expand in response',
          },
        },
        required: ['collection', 'data'],
      },
    },
    {
      name: 'update_record',
      description: 'Update an existing record',
      inputSchema: {
        type: 'object',
        properties: {
          collection: {
            type: 'string',
            description: 'Collection name or ID',
          },
          id: {
            type: 'string',
            description: 'Record ID',
          },
          data: {
            type: 'object',
            description: 'Record data to update',
          },
          expand: {
            type: 'string',
            description: 'Relations to expand in response',
          },
        },
        required: ['collection', 'id', 'data'],
      },
    },
    {
      name: 'delete_record',
      description: 'Delete a record',
      inputSchema: {
        type: 'object',
        properties: {
          collection: {
            type: 'string',
            description: 'Collection name or ID',
          },
          id: {
            type: 'string',
            description: 'Record ID',
          },
        },
        required: ['collection', 'id'],
      },
    },
  ] as const satisfies readonly Tool[];

export type ToolName = (typeof TOOL_DEFINITIONS)[number]['name'];

export function getToolDefinitions(): Tool[] {
  return [...TOOL_DEFINITIONS];
}
