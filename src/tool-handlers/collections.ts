import { parseCollectionName, parseCreateCollectionArgs, parseUpdateCollectionArgs, parseUpdateRulesArgs } from '../validators/collections.js';
import type { ToolHandlerContext, ToolHandlerMap } from './types.js';

export function createCollectionToolHandlers(context: ToolHandlerContext): ToolHandlerMap {
  const { api } = context;

  return {
    list_collections: async (args) => api.listCollections(args),
    view_collection: async (args) => api.viewCollection(parseCollectionName(args)),
    create_collection: async (args) => api.createCollection(parseCreateCollectionArgs(args)),
    update_collection: async (args) => {
      const parsed = parseUpdateCollectionArgs(args);
      return api.updateCollection(parsed.collection, parsed.data);
    },
    delete_collection: async (args) => api.deleteCollection(parseCollectionName(args)),
    update_collection_rules: async (args) => api.updateCollectionRules(parseUpdateRulesArgs(args)),
  };
}
