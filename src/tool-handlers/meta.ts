import { getFieldSchemaReference } from '../references/field-schema.js';
import { getRulesReference } from '../references/rules.js';
import type { ToolHandlerContext, ToolHandlerMap } from './types.js';

export function createMetaToolHandlers(context: ToolHandlerContext): ToolHandlerMap {
  const { api } = context;

  return {
    health: async () => api.health(),
    set_base_url: async (args) => api.setBaseUrl(args.url),
    get_field_schema_reference: async () => getFieldSchemaReference(),
    get_rules_reference: async () => getRulesReference(),
  };
}
