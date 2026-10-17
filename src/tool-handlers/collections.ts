import { ValidationError } from '../errors.js';
import type { CollectionField } from '../types.js';
import { parseCollectionName, parseCreateCollectionArgs, parseListCollectionsArgs, parseUpdateCollectionArgs, parseUpdateRulesArgs } from '../validators/collections.js';
import type { ToolHandlerContext, ToolHandlerMap } from './types.js';

export function createCollectionToolHandlers(context: ToolHandlerContext): ToolHandlerMap {
  const { api } = context;

  return {
    list_collections: async (args) => api.listCollections(parseListCollectionsArgs(args)),
    view_collection: async (args) => api.viewCollection(parseCollectionName(args)),
    create_collection: async (args) => api.createCollection(parseCreateCollectionArgs(args)),
    update_collection: async (args) => {
      const parsed = parseUpdateCollectionArgs(args);
      const hasFieldPatches =
        (parsed.fieldUpdates !== undefined && parsed.fieldUpdates.length > 0) ||
        (parsed.removeFields !== undefined && parsed.removeFields.length > 0);

      if (!hasFieldPatches) {
        return api.updateCollection(parsed.collection, parsed.data);
      }

      const current = await api.viewCollection(parsed.collection);
      const fieldsByName = new Map<string, CollectionField>();

      for (const field of current.fields || []) {
        fieldsByName.set(field.name, { ...field });
      }

      for (const fieldName of parsed.removeFields || []) {
        fieldsByName.delete(fieldName);
      }

      for (const { newName, ...fieldPatch } of parsed.fieldUpdates || []) {
        const existing = fieldsByName.get(fieldPatch.name);

        if (existing) {
          // Keeping the existing field id makes PocketBase rename the column instead of recreating it.
          fieldsByName.set(fieldPatch.name, { ...existing, ...fieldPatch, name: newName ?? existing.name });
          continue;
        }

        if (newName !== undefined) {
          throw new ValidationError(`newName can only rename an existing field: ${fieldPatch.name}`);
        }

        if (fieldPatch.type === undefined) {
          throw new ValidationError(`Missing type for new field: ${fieldPatch.name}`);
        }

        fieldsByName.set(fieldPatch.name, fieldPatch as CollectionField);
      }

      const currentFieldNames = new Set((current.fields || []).map((field) => field.name));
      const nextFields = (current.fields || [])
        .filter((field) => fieldsByName.has(field.name))
        .map((field) => fieldsByName.get(field.name) as CollectionField);

      for (const fieldPatch of parsed.fieldUpdates || []) {
        if (!currentFieldNames.has(fieldPatch.name)) {
          nextFields.push(fieldsByName.get(fieldPatch.name) as CollectionField);
        }
      }

      const seenNames = new Set<string>();
      for (const field of nextFields) {
        if (seenNames.has(field.name)) {
          throw new ValidationError(`Duplicate field name after update: ${field.name}`);
        }
        seenNames.add(field.name);
      }

      return api.updateCollection(parsed.collection, {
        ...parsed.data,
        fields: nextFields,
      });
    },
    delete_collection: async (args) => api.deleteCollection(parseCollectionName(args)),
    update_collection_rules: async (args) => api.updateCollectionRules(parseUpdateRulesArgs(args)),
  };
}
