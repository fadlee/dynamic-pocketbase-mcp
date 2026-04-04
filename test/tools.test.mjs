import assert from 'node:assert/strict';
import test from 'node:test';

import { PocketBaseMCPServer } from '../dist/server.js';

function makeCollection(name, extra = {}) {
  return {
    id: `${name}_id`,
    name,
    type: 'base',
    fields: [{ name: 'title', type: 'text' }],
    ...extra,
  };
}

function makeRecord(collection, id, extra = {}) {
  return {
    id,
    collectionId: `${collection}_id`,
    collectionName: collection,
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

function parseCollectionFromPath(endpoint) {
  return decodeURIComponent(endpoint.split('/')[3] || '');
}

function parseRecordIdFromPath(endpoint) {
  return decodeURIComponent(endpoint.split('/')[5] || '');
}

function createServerWithMockRequest() {
  const calls = [];
  const server = new PocketBaseMCPServer('http://localhost:8090');

  server.http.request = async (method, endpoint, data, query) => {
    calls.push({ method, endpoint, data, query });

    if (method === 'GET' && endpoint === '/api/health') {
      return { code: 200, message: 'OK', data: { canBackup: true } };
    }

    if (method === 'GET' && endpoint === '/api/collections') {
      return {
        page: 1,
        perPage: 30,
        totalItems: 1,
        totalPages: 1,
        items: [makeCollection('posts')],
      };
    }

    if (method === 'POST' && endpoint === '/api/collections') {
      return makeCollection(data.name, data);
    }

    if (method === 'POST' && endpoint === '/api/collections/_superusers/auth-with-password') {
      return {
        token: 'admin_auth_token_1234567890',
        record: { id: 'admin_1', email: data.identity },
      };
    }

    if (method === 'POST' && endpoint.endsWith('/auth-with-password')) {
      const collection = parseCollectionFromPath(endpoint);
      return {
        token: 'user_auth_token_1234567890',
        record: { id: 'user_1', collectionName: collection, identity: data.identity },
      };
    }

    if (
      endpoint.startsWith('/api/collections/') &&
      !endpoint.includes('/records') &&
      method === 'GET'
    ) {
      return makeCollection(parseCollectionFromPath(endpoint));
    }

    if (
      endpoint.startsWith('/api/collections/') &&
      !endpoint.includes('/records') &&
      method === 'PATCH'
    ) {
      return makeCollection(parseCollectionFromPath(endpoint), data);
    }

    if (
      endpoint.startsWith('/api/collections/') &&
      !endpoint.includes('/records') &&
      method === 'DELETE'
    ) {
      return {};
    }

    if (method === 'GET' && endpoint.endsWith('/records')) {
      const collection = parseCollectionFromPath(endpoint);
      return {
        page: 1,
        perPage: 30,
        totalItems: 1,
        totalPages: 1,
        items: [makeRecord(collection, 'record_1', { title: 'hello' })],
      };
    }

    if (method === 'GET' && endpoint.includes('/records/')) {
      const collection = parseCollectionFromPath(endpoint);
      const id = parseRecordIdFromPath(endpoint);
      return makeRecord(collection, id, { title: 'hello' });
    }

    if (method === 'POST' && endpoint.endsWith('/records')) {
      const collection = parseCollectionFromPath(endpoint);
      return makeRecord(collection, 'created_record', data);
    }

    if (method === 'PATCH' && endpoint.includes('/records/')) {
      const collection = parseCollectionFromPath(endpoint);
      const id = parseRecordIdFromPath(endpoint);
      return makeRecord(collection, id, data);
    }

    if (method === 'DELETE' && endpoint.includes('/records/')) {
      return {};
    }

    throw new Error(`Unexpected request: ${method} ${endpoint}`);
  };

  return { server, calls };
}

test('supports meta tools happy path', async () => {
  const { server } = createServerWithMockRequest();

  const health = await server.callTool('health', {});
  const updatedBase = await server.callTool('set_base_url', { url: 'https://pb.example.com/' });
  const status = await server.callTool('get_auth_status', {});
  const fieldRef = await server.callTool('get_field_schema_reference', {});
  const rulesRef = await server.callTool('get_rules_reference', {});

  assert.equal(health.code, 200);
  assert.equal(updatedBase.baseUrl, 'https://pb.example.com');
  assert.equal(status.baseUrl, 'https://pb.example.com');
  assert.equal(fieldRef.description, 'PocketBase Collection Field Schema Reference');
  assert.equal(rulesRef.description, 'PocketBase API Rules and Filters Reference');
});

test('validates set_base_url arguments', async () => {
  const { server } = createServerWithMockRequest();

  await assert.rejects(() => server.callTool('set_base_url', {}), /Missing required parameter: url/);
  await assert.rejects(
    () => server.callTool('set_base_url', { url: 'ftp://example.com' }),
    /Invalid parameter: url must use http or https/
  );
});

test('rejects unknown tool names', async () => {
  const { server } = createServerWithMockRequest();

  await assert.rejects(() => server.callTool('not_a_tool', {}), /Unknown tool: not_a_tool/);
});

test('supports authentication tools happy path', async () => {
  const { server } = createServerWithMockRequest();

  const statusBefore = await server.callTool('get_auth_status', {});
  const adminAuth = await server.callTool('auth_admin', {
    identity: 'admin@example.com',
    password: 'secret',
  });
  const statusAfterAdmin = await server.callTool('get_auth_status', {});
  const userAuth = await server.callTool('auth_user', {
    collection: 'users',
    identity: 'fadlee',
    password: 'secret',
  });
  const logout = await server.callTool('logout', {});
  const statusAfterLogout = await server.callTool('get_auth_status', {});

  assert.equal(statusBefore.authenticated, false);
  assert.equal(adminAuth.authenticated, true);
  assert.equal(adminAuth.mode, 'admin');
  assert.equal(statusAfterAdmin.authenticated, true);
  assert.equal(userAuth.authenticated, true);
  assert.equal(userAuth.mode, 'user');
  assert.equal(userAuth.collection, 'users');
  assert.equal(logout.authenticated, false);
  assert.equal(statusAfterLogout.authenticated, false);
});

test('validates authentication tool arguments', async () => {
  const { server } = createServerWithMockRequest();

  await assert.rejects(
    () => server.callTool('auth_admin', { identity: 'admin@example.com' }),
    /Missing required parameter: password/
  );
  await assert.rejects(
    () =>
      server.callTool('auth_user', {
        identity: 'user@example.com',
        password: 'secret',
      }),
    /Missing required parameter: collection/
  );
});

test('supports collection tools happy path', async () => {
  const { server, calls } = createServerWithMockRequest();

  const list = await server.callTool('list_collections', {});
  const view = await server.callTool('view_collection', { collection: 'posts' });
  const created = await server.callTool('create_collection', {
    name: 'posts',
    fields: [{ name: 'title', type: 'text' }],
    listRule: null,
  });
  const updated = await server.callTool('update_collection', {
    collection: 'posts',
    listRule: '',
  });
  const rules = await server.callTool('update_collection_rules', {
    collection: 'posts',
    listRule: '@request.auth.id != ""',
  });
  const removed = await server.callTool('delete_collection', { collection: 'posts' });
  const createCall = calls.find((call) => call.method === 'POST' && call.endpoint === '/api/collections');

  assert.equal(list.items[0].name, 'posts');
  assert.equal(list.items[0].fields, 1);
  assert.equal(view.name, 'posts');
  assert.equal(created.listRule, null);
  assert.equal(updated.listRule, '');
  assert.equal(rules.collection, 'posts');
  assert.equal(removed.message, 'Collection deleted successfully');
  assert.equal(calls.some((call) => call.method === 'PATCH' && call.endpoint === '/api/collections/posts'), true);
  assert.deepEqual(createCall.data.fields, [
    { name: 'title', type: 'text' },
    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false, system: true },
    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true, system: true },
  ]);
});

test('does not duplicate caller-provided created or updated fields', async () => {
  const { server, calls } = createServerWithMockRequest();

  await server.callTool('create_collection', {
    name: 'posts',
    fields: [
      { name: 'title', type: 'text' },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: false, onUpdate: true, hidden: true },
    ],
  });

  const createCall = calls.find((call) => call.method === 'POST' && call.endpoint === '/api/collections');

  assert.deepEqual(createCall.data.fields, [
    { name: 'title', type: 'text' },
    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    { name: 'updated', type: 'autodate', onCreate: false, onUpdate: true, hidden: true },
  ]);
});

test('does not inject created or updated fields into view collections', async () => {
  const { server, calls } = createServerWithMockRequest();

  await server.callTool('create_collection', {
    name: 'recent_posts',
    type: 'view',
    fields: [{ name: 'title', type: 'text' }],
  });

  const createCall = calls.find((call) => call.method === 'POST' && call.endpoint === '/api/collections');

  assert.deepEqual(createCall.data.fields, [{ name: 'title', type: 'text' }]);
  assert.equal(createCall.data.type, 'view');
});

test('validates collection tool arguments', async () => {
  const { server } = createServerWithMockRequest();

  await assert.rejects(
    () => server.callTool('view_collection', {}),
    /Missing required parameter: collection/
  );
  await assert.rejects(
    () => server.callTool('create_collection', { name: 'posts', fields: 'invalid' }),
    /Invalid parameter: fields must be an array of objects/
  );
  await assert.rejects(
    () => server.callTool('update_collection', { collection: 'posts' }),
    /Missing update payload/
  );
  await assert.rejects(
    () => server.callTool('delete_collection', { collection: '' }),
    /Invalid parameter: collection must be a non-empty string/
  );
});

test('supports record tools happy path', async () => {
  const { server, calls } = createServerWithMockRequest();

  const list = await server.callTool('list_records', {
    collection: 'posts',
    page: 1,
    perPage: 10,
    filter: 'title ~ "hello"',
  });
  const view = await server.callTool('view_record', { collection: 'posts', id: 'record_1' });
  const created = await server.callTool('create_record', {
    collection: 'posts',
    data: { title: 'new' },
  });
  const updated = await server.callTool('update_record', {
    collection: 'posts',
    id: 'record_1',
    data: { title: 'updated' },
  });
  const removed = await server.callTool('delete_record', {
    collection: 'posts',
    id: 'record_1',
  });

  assert.equal(list.items.length, 1);
  assert.equal(view.id, 'record_1');
  assert.equal(created.id, 'created_record');
  assert.equal(updated.title, 'updated');
  assert.equal(removed.message, 'Record deleted successfully');
  assert.equal(
    calls.some((call) => call.method === 'GET' && call.endpoint === '/api/collections/posts/records'),
    true
  );
});

test('validates record tool arguments', async () => {
  const { server } = createServerWithMockRequest();

  await assert.rejects(
    () => server.callTool('list_records', { collection: 'posts', page: '1' }),
    /Invalid parameter: page must be an integer/
  );
  await assert.rejects(
    () => server.callTool('view_record', { collection: 'posts' }),
    /Missing required parameter: id/
  );
  await assert.rejects(
    () => server.callTool('create_record', { collection: 'posts', data: 'invalid' }),
    /Invalid parameter: data must be an object/
  );
  await assert.rejects(
    () => server.callTool('update_record', { collection: 'posts', id: 'x' }),
    /Missing required parameter: data/
  );
  await assert.rejects(
    () => server.callTool('delete_record', { collection: 'posts' }),
    /Missing required parameter: id/
  );
});

test('supports MCP resources via server helpers', async () => {
  const { server } = createServerWithMockRequest();

  const resources = await server.listResources();
  const content = await server.readResource('pocketbase://collection/posts');

  assert.equal(resources[0].uri, 'pocketbase://collection/posts');
  assert.equal(content.mimeType, 'application/json');
  assert.match(content.text, /"name": "posts"/);
});

test('validates resource URI format', async () => {
  const { server } = createServerWithMockRequest();

  await assert.rejects(() => server.readResource('invalid://uri'), /Invalid resource URI/);
});
