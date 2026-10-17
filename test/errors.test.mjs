import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthError, ValidationError, serializeError } from '../dist/errors.js';
import { HttpClient } from '../dist/http-client.js';

test('serializeError keeps structured metadata', () => {
  const error = new ValidationError('Invalid payload', {
    details: { field: 'data' },
  });

  const serialized = serializeError(error);

  assert.deepEqual(serialized, {
    type: 'validation_error',
    message: 'Invalid payload',
    details: { field: 'data' },
  });
});

test('HttpClient maps 401/403 into AuthError', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });

  try {
    const client = new HttpClient('http://localhost:8090', 'token');
    await assert.rejects(
      () => client.request('GET', '/api/collections'),
      (error) => error instanceof AuthError && error.statusCode === 401
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('HttpClient maps fetch failures into api_error payload', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError('network down');
  };

  try {
    const client = new HttpClient('http://localhost:8090', 'token');
    await assert.rejects(
      () => client.request('GET', '/api/collections'),
      (error) => serializeError(error).type === 'api_error'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('HttpClient aborts requests with a timeout signal', async () => {
  const originalFetch = globalThis.fetch;
  let signal;
  globalThis.fetch = async (_url, options) => {
    signal = options.signal;
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  };

  try {
    const client = new HttpClient('http://localhost:8090');
    await assert.rejects(
      () => client.request('GET', '/api/health'),
      (error) => serializeError(error).type === 'api_error' && /timed out after/.test(error.message)
    );
    assert.ok(signal instanceof AbortSignal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
