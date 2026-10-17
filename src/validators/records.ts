import type {
  BatchRecordOperation,
  CreateRecordArgs,
  DeleteRecordArgs,
  ListRecordsArgs,
  UpdateRecordArgs,
  ViewRecordArgs,
} from '../types.js';
import { ValidationError } from '../errors.js';
import {
  assertObjectArray,
  optionalBoolean,
  optionalInteger,
  optionalString,
  requireObject,
  requireString,
  type UnknownObject,
} from './common.js';

export function parseListRecordsArgs(args: UnknownObject): ListRecordsArgs {
  const parsed: ListRecordsArgs = {
    collection: requireString(args.collection, 'collection'),
  };

  const page = optionalInteger(args.page, 'page');
  if (page !== undefined) {
    parsed.page = page;
  }

  const perPage = optionalInteger(args.perPage, 'perPage');
  if (perPage !== undefined) {
    parsed.perPage = perPage;
  }

  for (const key of ['sort', 'filter', 'expand', 'fields'] as const) {
    const value = optionalString(args[key], key);
    if (value !== undefined) {
      parsed[key] = value;
    }
  }

  const skipTotal = optionalBoolean(args.skipTotal, 'skipTotal');
  if (skipTotal !== undefined) {
    parsed.skipTotal = skipTotal;
  }

  return parsed;
}

export function parseViewRecordArgs(args: UnknownObject): ViewRecordArgs {
  const parsed: ViewRecordArgs = {
    collection: requireString(args.collection, 'collection'),
    id: requireString(args.id, 'id'),
  };

  for (const key of ['expand', 'fields'] as const) {
    const value = optionalString(args[key], key);
    if (value !== undefined) {
      parsed[key] = value;
    }
  }

  return parsed;
}

export function parseCreateRecordArgs(args: UnknownObject): CreateRecordArgs {
  return {
    collection: requireString(args.collection, 'collection'),
    data: requireObject(args.data, 'data'),
    expand: optionalString(args.expand, 'expand'),
  };
}

export function parseUpdateRecordArgs(args: UnknownObject): UpdateRecordArgs {
  return {
    collection: requireString(args.collection, 'collection'),
    id: requireString(args.id, 'id'),
    data: requireObject(args.data, 'data'),
    expand: optionalString(args.expand, 'expand'),
  };
}

export function parseDeleteRecordArgs(args: UnknownObject): DeleteRecordArgs {
  return {
    collection: requireString(args.collection, 'collection'),
    id: requireString(args.id, 'id'),
  };
}

const BATCH_ACTIONS = ['create', 'update', 'upsert', 'delete'] as const;

export function parseBatchRecordsArgs(args: UnknownObject): BatchRecordOperation[] {
  assertObjectArray(args.requests, 'requests');

  if (args.requests.length === 0) {
    throw new ValidationError('Invalid parameter: requests must not be empty');
  }

  return args.requests.map((item, index) => {
    const prefix = `requests[${index}]`;
    const action = item.action;

    if (!BATCH_ACTIONS.includes(action as BatchRecordOperation['action'])) {
      throw new ValidationError(
        `Invalid parameter: ${prefix}.action must be one of ${BATCH_ACTIONS.join(', ')}`
      );
    }

    const operation: BatchRecordOperation = {
      action: action as BatchRecordOperation['action'],
      collection: requireString(item.collection, `${prefix}.collection`),
    };

    if (operation.action === 'update' || operation.action === 'delete') {
      operation.id = requireString(item.id, `${prefix}.id`);
    }

    if (operation.action !== 'delete') {
      operation.data = requireObject(item.data, `${prefix}.data`);
    }

    return operation;
  });
}
