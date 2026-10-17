import { ValidationError } from '../errors.js';
import type { ToolInput } from '../tool-definitions.js';
import type { CollectionField, CollectionFieldPatch } from '../types.js';
import type { ToolHandlerContext, ToolHandlerMap } from './types.js';

const NESTED_DATA_FALLBACK_KEYS = [
  'fields',
  'indexes',
  'listRule',
  'viewRule',
  'createRule',
  'updateRule',
  'deleteRule',
] as const;

function assertUnique(names: string[], message: (name: string) => string): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      throw new ValidationError(message(name));
    }
    seen.add(name);
  }
}

// Resolves update_collection's two input styles (nested data or top-level properties)
// into the PocketBase payload plus optional MCP-side field patches.
function normalizeUpdateCollectionInput(input: ToolInput<'update_collection'>): {
  collection: string;
  data: Record<string, unknown>;
  fieldUpdates: CollectionFieldPatch[];
  removeFields: string[];
} {
  const { collection, data: nestedData, fieldUpdates = [], removeFields = [], ...topLevel } = input;

  assertUnique(
    fieldUpdates.map((patch) => patch.name),
    (name) => `Duplicate field update for field: ${name}`
  );
  assertUnique(removeFields, (name) => `Duplicate removeFields entry for field: ${name}`);

  let data: Record<string, unknown>;
  if (nestedData === undefined) {
    data = topLevel;
  } else {
    if ('fieldUpdates' in nestedData || 'removeFields' in nestedData) {
      throw new ValidationError('fieldUpdates and removeFields must be top-level parameters, not nested under data');
    }

    data = { ...nestedData };
    for (const key of NESTED_DATA_FALLBACK_KEYS) {
      if (key in topLevel && !(key in data)) {
        data[key] = topLevel[key];
      }
    }
  }

  const hasFieldPatches = fieldUpdates.length > 0 || removeFields.length > 0;

  if (data.fields !== undefined && hasFieldPatches) {
    throw new ValidationError(
      'Cannot combine fields with fieldUpdates/removeFields. Use either a full fields array or partial field patch inputs.'
    );
  }

  if (Object.keys(data).length === 0 && !hasFieldPatches) {
    throw new ValidationError(
      'Missing update payload. Provide update properties under data or at top-level (besides collection). For schema changes, send fields as the full fields array or use fieldUpdates/removeFields for MCP-side field merging.'
    );
  }

  return { collection, data, fieldUpdates, removeFields };
}

function applyFieldPatches(
  currentFields: CollectionField[],
  fieldUpdates: CollectionFieldPatch[],
  removeFields: string[]
): CollectionField[] {
  const fieldsByName = new Map<string, CollectionField>();

  for (const field of currentFields) {
    fieldsByName.set(field.name, { ...field });
  }

  for (const fieldName of removeFields) {
    fieldsByName.delete(fieldName);
  }

  for (const { newName, ...fieldPatch } of fieldUpdates) {
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

  const currentFieldNames = new Set(currentFields.map((field) => field.name));
  const nextFields = currentFields
    .filter((field) => fieldsByName.has(field.name))
    .map((field) => fieldsByName.get(field.name) as CollectionField);

  for (const fieldPatch of fieldUpdates) {
    if (!currentFieldNames.has(fieldPatch.name)) {
      nextFields.push(fieldsByName.get(fieldPatch.name) as CollectionField);
    }
  }

  assertUnique(
    nextFields.map((field) => field.name),
    (name) => `Duplicate field name after update: ${name}`
  );

  return nextFields;
}

export function createCollectionToolHandlers(context: ToolHandlerContext): ToolHandlerMap {
  const { api } = context;

  return {
    list_collections: async (args) => api.listCollections(args),
    view_collection: async (args) => api.viewCollection(args.collection),
    create_collection: async (args) => api.createCollection(args),
    update_collection: async (args) => {
      const { collection, data, fieldUpdates, removeFields } = normalizeUpdateCollectionInput(args);

      if (fieldUpdates.length === 0 && removeFields.length === 0) {
        return api.updateCollection(collection, data);
      }

      const current = await api.viewCollection(collection);
      return api.updateCollection(collection, {
        ...data,
        fields: applyFieldPatches(current.fields || [], fieldUpdates, removeFields),
      });
    },
    delete_collection: async (args) => api.deleteCollection(args.collection),
    update_collection_rules: async (args) => api.updateCollectionRules(args),
  };
}
