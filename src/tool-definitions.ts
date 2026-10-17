import type { Tool, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ValidationError } from './errors.js';

const nonEmptyString = (description: string) =>
  z.string().regex(/\S/, 'must be a non-empty string').describe(description);

const ruleString = (description: string) => z.string().nullable().optional().describe(description);

const stringArray = (description: string) => z.array(z.string()).optional().describe(description);

const NO_ARGS = z.object({});

const FIELD_OPTIONS_SHAPE = {
  required: z.boolean().optional().describe('Field must have a value'),
  hidden: z.boolean().optional().describe('Hide from API response'),
  presentable: z.boolean().optional().describe('Show in relation preview labels'),
  system: z.boolean().optional().describe('Prevents renaming/deletion'),
  // Date fields use datetime strings for min/max.
  min: z.union([z.number(), z.string()]).optional().describe('Minimum text length or numeric value'),
  max: z.union([z.number(), z.string()]).optional().describe('Maximum text length or numeric value'),
  pattern: z.string().optional().describe('Regex pattern validation for text fields'),
  autogeneratePattern: z.string().optional().describe('Auto-generate pattern for text fields'),
  onlyInt: z.boolean().optional().describe('Allow only integers for number fields'),
  noDecimal: z.boolean().optional().describe('Disallow decimal places for number fields'),
  exceptDomains: stringArray('Blocked email domains'),
  onlyDomains: stringArray('Allowed email domains'),
  onCreate: z.boolean().optional().describe('Auto-set autodate field on record create'),
  onUpdate: z.boolean().optional().describe('Auto-set autodate field on record update'),
  values: stringArray('Allowed select values'),
  maxSelect: z.number().optional().describe('Maximum selected options, files, or relations'),
  maxSize: z.number().optional().describe('Maximum file size in bytes'),
  mimeTypes: stringArray('Allowed file MIME types'),
  thumbs: stringArray('Generated thumbnail sizes'),
  protected: z.boolean().optional().describe('Require auth to access uploaded files'),
  collectionId: z.string().optional().describe('Target collection ID for relation fields'),
  cascadeDelete: z.boolean().optional().describe('Delete records when related record is deleted'),
};

const COLLECTION_FIELD = z
  .looseObject({
    name: nonEmptyString('Unique field name'),
    type: nonEmptyString('PocketBase field type'),
    ...FIELD_OPTIONS_SHAPE,
  })
  .describe('PocketBase collection field definition object');

const COLLECTION_FIELD_PATCH = z
  .looseObject({
    name: nonEmptyString('Unique field name'),
    type: z.string().optional().describe('PocketBase field type (required for new fields)'),
    newName: nonEmptyString(
      'Rename an existing field (matched by name) to this name. Data is preserved.'
    ).optional(),
    ...FIELD_OPTIONS_SHAPE,
  })
  .describe('PocketBase collection field definition object');

const INDEXES = z.array(z.string().describe('SQL CREATE INDEX statement'));

const RULES_SHAPE = {
  listRule: ruleString('List API rule (null=disallow, ""=allow all)'),
  viewRule: ruleString('View API rule'),
  createRule: ruleString('Create API rule'),
  updateRule: ruleString('Update API rule'),
  deleteRule: ruleString('Delete API rule'),
};

const COLLECTION_UPDATE_SHAPE = {
  fields: z
    .array(COLLECTION_FIELD)
    .optional()
    .describe(
      'Optional shorthand to replace the collection fields (schema) directly. This is the full final fields array.'
    ),
  indexes: INDEXES.optional().describe(
    'Optional indexes definitions. Note that view collections may not support indexes.'
  ),
  ...RULES_SHAPE,
};

const COLLECTION = nonEmptyString('Collection name or ID');
const RECORD_ID = nonEmptyString('Record ID');
const RECORD_DATA = z.record(z.string(), z.unknown());

const READ_ONLY = { readOnlyHint: true } as const;
const IDEMPOTENT_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true } as const;
const ADDITIVE_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;
const DESTRUCTIVE_WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true } as const;

function defineTool<N extends string, S extends z.ZodType<Record<string, unknown>>>(tool: {
  name: N;
  description: string;
  annotations: ToolAnnotations;
  input: S;
}) {
  return tool;
}

export const TOOL_DEFINITIONS = [
  defineTool({
    name: 'health',
    annotations: READ_ONLY,
    description: 'Check PocketBase server health status',
    input: NO_ARGS,
  }),
  defineTool({
    name: 'set_base_url',
    annotations: IDEMPOTENT_WRITE,
    description: 'Set PocketBase server URL for this MCP session and clear auth token',
    input: z.object({
      url: nonEmptyString('PocketBase base URL (http or https)'),
    }),
  }),
  defineTool({
    name: 'auth_admin',
    annotations: IDEMPOTENT_WRITE,
    description: 'Authenticate as PocketBase admin/superuser',
    input: z.object({
      identity: nonEmptyString('Superuser email/identity'),
      password: nonEmptyString('Superuser password'),
    }),
  }),
  defineTool({
    name: 'auth_user',
    annotations: IDEMPOTENT_WRITE,
    description: 'Authenticate as PocketBase auth collection user',
    input: z.object({
      collection: nonEmptyString('Auth collection name or ID'),
      identity: nonEmptyString('User email or username'),
      password: nonEmptyString('User password'),
    }),
  }),
  defineTool({
    name: 'get_auth_status',
    annotations: READ_ONLY,
    description: 'Check current authentication status/token state',
    input: NO_ARGS,
  }),
  defineTool({
    name: 'logout',
    annotations: IDEMPOTENT_WRITE,
    description: 'Clear current authentication session token',
    input: NO_ARGS,
  }),
  defineTool({
    name: 'list_collections',
    annotations: READ_ONLY,
    description: 'List all collections with optional pagination',
    input: z.object({
      page: z.int().optional().describe('Page number (default: 1)'),
      perPage: z.int().optional().describe('Collections per page (default: 30, max: 500)'),
    }),
  }),
  defineTool({
    name: 'view_collection',
    annotations: READ_ONLY,
    description: 'View a collection by name or ID',
    input: z.object({ collection: COLLECTION }),
  }),
  defineTool({
    name: 'get_field_schema_reference',
    annotations: READ_ONLY,
    description:
      'Get PocketBase collection field schema reference, including create examples and update_collection field patch examples. Call this before create_collection or schema updates to see correct field syntax.',
    input: NO_ARGS,
  }),
  defineTool({
    name: 'create_collection',
    annotations: ADDITIVE_WRITE,
    description:
      'Create a new collection. Call get_field_schema_reference first to see correct field syntax. For base/auth collections, created and updated autodate system fields are auto-added unless you provide them.',
    input: z.object({
      name: nonEmptyString('Collection name'),
      type: z.enum(['base', 'auth', 'view']).optional().describe('Collection type: base, auth, or view'),
      fields: z.array(COLLECTION_FIELD).describe('Array of field definitions'),
      ...RULES_SHAPE,
      indexes: INDEXES.optional().describe('SQL index definitions'),
    }),
  }),
  defineTool({
    name: 'update_collection',
    annotations: DESTRUCTIVE_WRITE,
    description:
      'Update an existing collection. Partial updates are allowed for collection properties. You may either send a full fields array, or let the MCP server merge schema patches via fieldUpdates/removeFields before sending the final fields array to PocketBase. Call get_field_schema_reference for concrete patch examples.',
    // Loose: any other top-level property is forwarded to PocketBase as collection data.
    input: z.looseObject({
      collection: COLLECTION,
      data: z
        .looseObject(COLLECTION_UPDATE_SHAPE)
        .optional()
        .describe(
          'Collection data to update. You may send only the properties you want to change. If you also use fieldUpdates/removeFields, MCP will fetch the current collection, merge the field changes, and send the final full fields array to PocketBase.'
        ),
      fieldUpdates: z
        .array(COLLECTION_FIELD_PATCH)
        .optional()
        .describe(
          'Optional MCP-side partial field patches. Existing fields are merged by name; set newName to rename an existing field while keeping its data. New fields must include at least name and type.'
        ),
      removeFields: z
        .array(nonEmptyString('Field name to remove'))
        .optional()
        .describe(
          'Optional field names to remove. MCP removes them from the current schema before sending the final full fields array to PocketBase.'
        ),
      ...COLLECTION_UPDATE_SHAPE,
    }),
  }),
  defineTool({
    name: 'delete_collection',
    annotations: DESTRUCTIVE_WRITE,
    description: 'Delete a collection',
    input: z.object({ collection: COLLECTION }),
  }),
  defineTool({
    name: 'get_rules_reference',
    annotations: READ_ONLY,
    description:
      'Get API rules syntax reference. Call this BEFORE update_collection_rules to understand filter syntax, operators, modifiers, and macros.',
    input: NO_ARGS,
  }),
  defineTool({
    name: 'update_collection_rules',
    annotations: IDEMPOTENT_WRITE,
    description:
      'Update collection API rules (access control). Call get_rules_reference first for syntax. Use null for admin-only, "" for public, or filter expression.',
    input: z.object({
      collection: COLLECTION,
      listRule: ruleString('Rule for listing records. null=admin only, ""=public, or filter expression'),
      viewRule: ruleString('Rule for viewing single record'),
      createRule: ruleString('Rule for creating records'),
      updateRule: ruleString('Rule for updating records'),
      deleteRule: ruleString('Rule for deleting records'),
    }),
  }),
  defineTool({
    name: 'list_records',
    annotations: READ_ONLY,
    description: 'List records from a collection with optional filtering, sorting, and pagination',
    input: z.object({
      collection: COLLECTION,
      page: z.int().optional().describe('Page number (default: 1)'),
      perPage: z.int().optional().describe('Records per page (default: 30, max: 500)'),
      sort: z.string().optional().describe('Sort field(s), prefix with - for DESC (e.g., -created,title)'),
      filter: z
        .string()
        .optional()
        .describe('Filter expression (e.g., title~"test" && created>"2022-01-01")'),
      expand: z
        .string()
        .optional()
        .describe('Relations to expand (e.g., relField1,relField2.subRelField)'),
      fields: z.string().optional().describe('Comma-separated fields to return'),
      skipTotal: z
        .boolean()
        .optional()
        .describe(
          'Skip counting totalItems/totalPages (returned as -1) for a faster query on large collections'
        ),
    }),
  }),
  defineTool({
    name: 'view_record',
    annotations: READ_ONLY,
    description: 'View a single record by ID',
    input: z.object({
      collection: COLLECTION,
      id: RECORD_ID,
      expand: z.string().optional().describe('Relations to expand'),
      fields: z.string().optional().describe('Comma-separated fields to return'),
    }),
  }),
  defineTool({
    name: 'create_record',
    annotations: ADDITIVE_WRITE,
    description: 'Create a new record in a collection',
    input: z.object({
      collection: COLLECTION,
      data: RECORD_DATA.describe('Record data (field values)'),
      expand: z.string().optional().describe('Relations to expand in response'),
    }),
  }),
  defineTool({
    name: 'update_record',
    annotations: DESTRUCTIVE_WRITE,
    description: 'Update an existing record',
    input: z.object({
      collection: COLLECTION,
      id: RECORD_ID,
      data: RECORD_DATA.describe('Record data to update'),
      expand: z.string().optional().describe('Relations to expand in response'),
    }),
  }),
  defineTool({
    name: 'batch_records',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    description:
      'Create, update, upsert, or delete multiple records in one transaction (all succeed or all are rolled back). Requires the Batch API to be enabled in PocketBase settings (Settings > Application > Batch API).',
    input: z.object({
      requests: z
        .array(
          z
            .object({
              action: z
                .enum(['create', 'update', 'upsert', 'delete'])
                .describe('upsert creates the record, or updates it when data.id already exists'),
              collection: COLLECTION,
              id: RECORD_ID.optional().describe('Record ID (required for update and delete)'),
              data: RECORD_DATA.optional().describe(
                'Record data (required for create, update, and upsert)'
              ),
            })
            .superRefine((operation, ctx) => {
              const needsId = operation.action === 'update' || operation.action === 'delete';
              if (needsId && operation.id === undefined) {
                ctx.addIssue({ code: 'custom', path: ['id'], message: 'missing', params: { missing: true } });
              }
              if (operation.action !== 'delete' && operation.data === undefined) {
                ctx.addIssue({ code: 'custom', path: ['data'], message: 'missing', params: { missing: true } });
              }
            })
        )
        .min(1, 'must not be empty')
        .describe('Operations to run in order'),
    }),
  }),
  defineTool({
    name: 'delete_record',
    annotations: DESTRUCTIVE_WRITE,
    description: 'Delete a record',
    input: z.object({ collection: COLLECTION, id: RECORD_ID }),
  }),
] as const;

type ToolDefinition = (typeof TOOL_DEFINITIONS)[number];

export type ToolName = ToolDefinition['name'];

export type ToolInput<N extends ToolName> = z.output<Extract<ToolDefinition, { name: N }>['input']>;

export function findToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((tool) => tool.name === name);
}

function toInputSchema(input: z.ZodType): Tool['inputSchema'] {
  const { $schema: _, ...schema } = z.toJSONSchema(input, {
    io: 'input',
    override: ({ jsonSchema }) => {
      // z.int() adds safe-integer bounds; they are noise for clients.
      if (jsonSchema.minimum === Number.MIN_SAFE_INTEGER) delete jsonSchema.minimum;
      if (jsonSchema.maximum === Number.MAX_SAFE_INTEGER) delete jsonSchema.maximum;
    },
  });
  return schema as Tool['inputSchema'];
}

const MCP_TOOLS: Tool[] = TOOL_DEFINITIONS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  annotations: tool.annotations,
  inputSchema: toInputSchema(tool.input),
}));

export function getToolDefinitions(): Tool[] {
  return MCP_TOOLS;
}

const EXPECTED_LABELS: Record<string, string> = {
  string: 'a string',
  number: 'a number',
  int: 'an integer',
  boolean: 'a boolean',
  object: 'an object',
  record: 'an object',
  array: 'an array',
};

function formatPath(path: PropertyKey[]): string {
  return path
    .map((key, index) => (typeof key === 'number' ? `[${key}]` : index === 0 ? String(key) : `.${String(key)}`))
    .join('');
}

function formatIssue(issue: z.core.$ZodIssue): string {
  const path = formatPath(issue.path);

  if (
    (issue.code === 'invalid_type' && issue.input == null) ||
    (issue.code === 'custom' && issue.params?.missing)
  ) {
    return `Missing required parameter: ${path}`;
  }
  if (issue.code === 'invalid_type') {
    return `Invalid parameter: ${path} must be ${EXPECTED_LABELS[issue.expected] ?? issue.expected}`;
  }
  if (issue.code === 'invalid_value') {
    return `Invalid parameter: ${path} must be one of ${issue.values.join(', ')}`;
  }
  return `Invalid parameter: ${path} ${issue.message}`;
}

export function parseToolInput<S extends z.ZodType>(input: S, args: Record<string, unknown>): z.output<S> {
  const result = input.safeParse(args, { reportInput: true });
  if (!result.success) {
    throw new ValidationError(result.error.issues.map(formatIssue).join('; '));
  }
  return result.data;
}
