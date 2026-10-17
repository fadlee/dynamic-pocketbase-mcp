import { ValidationError } from '../errors.js';

export type UnknownObject = Record<string, unknown>;

export function isPlainObject(value: unknown): value is UnknownObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requireString(value: unknown, parameter: string): string {
  if (value === undefined || value === null) {
    throw new ValidationError(`Missing required parameter: ${parameter}`);
  }

  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`Invalid parameter: ${parameter} must be a non-empty string`);
  }

  return value;
}

export function optionalString(value: unknown, parameter: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ValidationError(`Invalid parameter: ${parameter} must be a string`);
  }

  return value;
}

export function optionalNullableString(
  value: unknown,
  parameter: string
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new ValidationError(`Invalid parameter: ${parameter} must be a string or null`);
  }

  return value;
}

export function optionalInteger(value: unknown, parameter: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ValidationError(`Invalid parameter: ${parameter} must be an integer`);
  }

  return value;
}

export function optionalBoolean(value: unknown, parameter: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new ValidationError(`Invalid parameter: ${parameter} must be a boolean`);
  }

  return value;
}

export function requireObject(value: unknown, parameter: string): UnknownObject {
  if (value === undefined || value === null) {
    throw new ValidationError(`Missing required parameter: ${parameter}`);
  }

  if (!isPlainObject(value)) {
    throw new ValidationError(`Invalid parameter: ${parameter} must be an object`);
  }

  return value;
}

export function assertObjectArray(
  value: unknown,
  parameter: string
): asserts value is UnknownObject[] {
  if (!Array.isArray(value) || value.some((item) => !isPlainObject(item))) {
    throw new ValidationError(`Invalid parameter: ${parameter} must be an array of objects`);
  }
}

export function assertStringArray(value: unknown, parameter: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ValidationError(`Invalid parameter: ${parameter} must be an array of strings`);
  }
}
