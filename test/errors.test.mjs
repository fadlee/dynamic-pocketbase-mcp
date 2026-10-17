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

function makeJwt(expiresInSeconds) {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds })
  ).toString('base64url');
  return `header.${payload}.signature`;
}

function mockFetch(tokens) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const endpoint = new URL(url).pathname;
    calls.push({ endpoint, authorization: options.headers.Authorization });
    if (endpoint === '/api/collections/_superusers/auth-with-password') {
      return new Response(JSON.stringify({ token: tokens.shift() }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  return calls;
}

test('HttpClient logs in lazily with credentials and shares one login across parallel requests', async () => {
  const originalFetch = globalThis.fetch;
  const token = makeJwt(3600);
  const calls = mockFetch([token]);

  try {
    const client = new HttpClient('http://localhost:8090', { identity: 'a@b.c', password: 'secret' });
    await Promise.all([client.request('GET', '/api/collections'), client.request('GET', '/api/settings')]);

    const logins = calls.filter((call) => call.endpoint.endsWith('/auth-with-password'));
    assert.equal(logins.length, 1);
    assert.equal(logins[0].authorization, undefined);
    assert.deepEqual(
      calls.filter((call) => !call.endpoint.endsWith('/auth-with-password')).map((call) => call.authorization),
      [token, token]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('HttpClient re-authenticates when the token is about to expire', async () => {
  const originalFetch = globalThis.fetch;
  const freshToken = makeJwt(3600);
  const calls = mockFetch([freshToken]);

  try {
    const client = new HttpClient('http://localhost:8090', {
      token: makeJwt(10),
      identity: 'a@b.c',
      password: 'secret',
    });
    await client.request('GET', '/api/collections');

    assert.equal(calls[0].endpoint, '/api/collections/_superusers/auth-with-password');
    assert.equal(calls[1].authorization, freshToken);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('HttpClient stops auto-auth after logout or base URL change', async () => {
  const originalFetch = globalThis.fetch;
  const calls = mockFetch([makeJwt(3600)]);

  try {
    const client = new HttpClient('http://localhost:8090', { identity: 'a@b.c', password: 'secret' });
    client.setBaseUrl('https://other.example.com');
    assert.equal(client.hasAutoAuth(), false);

    await client.request('GET', '/api/collections');
    assert.deepEqual(calls, [{ endpoint: '/api/collections', authorization: undefined }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
