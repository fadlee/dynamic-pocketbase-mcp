import type { CollectionFieldPatch, CreateCollectionArgs, UpdateRulesArgs } from '../types.js';
import { ValidationError } from '../errors.js';
import {
  assertObjectArray,
  assertStringArray,
  optionalNullableString,
  requireObject,
  requireString,
  type UnknownObject,
} from './common.js';

const RULE_KEYS = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'] as const;
type RuleKey = (typeof RULE_KEYS)[number];

function readRuleValues(source: UnknownObject): Partial<Record<RuleKey, string | null>> {
  const rules: Partial<Record<RuleKey, string | null>> = {};

  for (const rule of RULE_KEYS) {
    const value = optionalNullableString(source[rule], rule);
    if (value !== undefined) {
      rules[rule] = value;
    }
  }

  return rules;
}

export function parseCollectionName(args: UnknownObject): string {
  return requireString(args.collection, 'collection');
}

export function parseCreateCollectionArgs(args: UnknownObject): CreateCollectionArgs {
  const name = requireString(args.name, 'name');
  const fields = args.fields;
  assertObjectArray(fields, 'fields');

  const parsed: CreateCollectionArgs = {
    name,
    fields: fields as CreateCollectionArgs['fields'],
    ...readRuleValues(args),
  };

  if (args.type !== undefined) {
    if (args.type !== 'base' && args.type !== 'auth' && args.type !== 'view') {
      throw new ValidationError('Invalid parameter: type must be one of base, auth, or view');
    }

    parsed.type = args.type;
  }

  if (args.indexes !== undefined) {
    assertStringArray(args.indexes, 'indexes');
    parsed.indexes = args.indexes;
  }

  return parsed;
}

export function parseUpdateCollectionArgs(args: UnknownObject): {
  collection: string;
  data: UnknownObject;
  fieldUpdates?: CollectionFieldPatch[];
  removeFields?: string[];
} {
  const collection = parseCollectionName(args);
  let fieldUpdates: CollectionFieldPatch[] | undefined;
  let removeFields: string[] | undefined;

  if (args.fieldUpdates !== undefined) {
    assertObjectArray(args.fieldUpdates, 'fieldUpdates');

    const seenFieldUpdates = new Set<string>();

    fieldUpdates = args.fieldUpdates.map((item, index) => {
      const name = requireString(item.name, `fieldUpdates[${index}].name`);

      if (seenFieldUpdates.has(name)) {
        throw new ValidationError(`Duplicate field update for field: ${name}`);
      }

      seenFieldUpdates.add(name);

      if ('type' in item && item.type !== undefined && typeof item.type !== 'string') {
        throw new ValidationError(`Invalid parameter: fieldUpdates[${index}].type must be a string`);
      }

      return { ...item, name };
    });
  }

  if (args.removeFields !== undefined) {
    assertStringArray(args.removeFields, 'removeFields');

    const seenRemoveFields = new Set<string>();

    removeFields = args.removeFields.map((item, index) => {
      const name = requireString(item, `removeFields[${index}]`);

      if (seenRemoveFields.has(name)) {
        throw new ValidationError(`Duplicate removeFields entry for field: ${name}`);
      }

      seenRemoveFields.add(name);
      return name;
    });
  }

  let data: UnknownObject;

  if (args.data === undefined) {
    data = { ...args };
    delete data.collection;
    delete data.fieldUpdates;
    delete data.removeFields;
  } else {
    const nestedData = requireObject(args.data, 'data');
    data = { ...nestedData };

    if ('fieldUpdates' in data || 'removeFields' in data) {
      throw new ValidationError('fieldUpdates and removeFields must be top-level parameters, not nested under data');
    }

    for (const key of ['fields', 'indexes', ...RULE_KEYS] as const) {
      if (key in args && !(key in data)) {
        data[key] = args[key];
      }
    }
  }

  if (
    'fields' in data &&
    data.fields !== undefined &&
    ((fieldUpdates && fieldUpdates.length > 0) || (removeFields && removeFields.length > 0))
  ) {
    throw new ValidationError(
      'Cannot combine fields with fieldUpdates/removeFields. Use either a full fields array or partial field patch inputs.'
    );
  }

  if (
    Object.keys(data).length === 0 &&
    (!fieldUpdates || fieldUpdates.length === 0) &&
    (!removeFields || removeFields.length === 0)
  ) {
    throw new ValidationError(
      'Missing update payload. Provide update properties under data or at top-level (besides collection). For schema changes, send fields as the full fields array or use fieldUpdates/removeFields for MCP-side field merging.'
    );
  }

  if ('fields' in data && data.fields !== undefined) {
    assertObjectArray(data.fields, 'fields');
  }

  if ('indexes' in data && data.indexes !== undefined) {
    assertStringArray(data.indexes, 'indexes');
  }

  for (const rule of RULE_KEYS) {
    if (rule in data) {
      optionalNullableString(data[rule], rule);
    }
  }

  return { collection, data, fieldUpdates, removeFields };
}

export function parseUpdateRulesArgs(args: UnknownObject): UpdateRulesArgs {
  return {
    collection: parseCollectionName(args),
    ...readRuleValues(args),
  };
}
