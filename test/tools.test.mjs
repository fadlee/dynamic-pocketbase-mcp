import assert from 'node:assert/strict';
import test from 'node:test';

import { PocketBaseMCPServer } from '../dist/server.js';
import { getToolDefinitions } from '../dist/tool-definitions.js';

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
  assert.deepEqual(Object.keys(fieldRef.update_examples), [
    'update_existing_field',
    'add_new_field',
    'rename_field',
    'remove_field',
    'update_select_options',
    'update_relation_field',
  ]);
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

test('collection schema tools expose concrete field object parameters', () => {
  const tools = getToolDefinitions();
  const createCollection = tools.find((tool) => tool.name === 'create_collection');
  const updateCollection = tools.find((tool) => tool.name === 'update_collection');

  assert.ok(createCollection);
  assert.ok(updateCollection);
  assert.deepEqual(Object.keys(createCollection.inputSchema.properties.fields.items.properties), [
    'name',
    'type',
    'required',
    'hidden',
    'presentable',
    'system',
    'min',
    'max',
    'pattern',
    'autogeneratePattern',
    'onlyInt',
    'noDecimal',
    'exceptDomains',
    'onlyDomains',
    'onCreate',
    'onUpdate',
    'values',
    'maxSelect',
    'maxSize',
    'mimeTypes',
    'thumbs',
    'protected',
    'collectionId',
    'cascadeDelete',
  ]);
  assert.deepEqual(updateCollection.inputSchema.properties.fields.items.properties, createCollection.inputSchema.properties.fields.items.properties);
  assert.deepEqual(updateCollection.inputSchema.properties.data.additionalProperties, {});
});

test('update_collection schema documents MCP field patch support', () => {
  const tools = getToolDefinitions();
  const updateCollection = tools.find((tool) => tool.name === 'update_collection');

  assert.ok(updateCollection);
  assert.match(updateCollection.description, /fieldUpdates\/removeFields/);
  assert.match(
    updateCollection.inputSchema.properties.data.description,
    /MCP will fetch the current collection, merge the field changes/
  );
  assert.match(updateCollection.inputSchema.properties.fields.description, /full final fields array/);
  assert.equal(updateCollection.inputSchema.properties.fieldUpdates.items.required[0], 'name');
});

test('field schema reference includes update_collection patch examples', () => {
  const tools = getToolDefinitions();
  const fieldReferenceTool = tools.find((tool) => tool.name === 'get_field_schema_reference');
  const updateCollection = tools.find((tool) => tool.name === 'update_collection');

  assert.ok(fieldReferenceTool);
  assert.ok(updateCollection);
  assert.match(fieldReferenceTool.description, /update_collection field patch examples/);
  assert.match(updateCollection.description, /Call get_field_schema_reference for concrete patch examples/);
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

test('merges partial field updates before calling PocketBase', async () => {
  const { server, calls } = createServerWithMockRequest();

  await server.callTool('update_collection', {
    collection: 'posts',
    fieldUpdates: [
      { name: 'title', required: true },
      { name: 'status', type: 'select', values: ['draft'] },
    ],
    removeFields: ['obsolete'],
    listRule: '',
  });

  const patchCall = calls.find((call) => call.method === 'PATCH' && call.endpoint === '/api/collections/posts');

  assert.deepEqual(patchCall.data, {
    listRule: '',
    fields: [
      { name: 'title', type: 'text', required: true },
      { name: 'status', type: 'select', values: ['draft'] },
    ],
  });
});

test('renames existing fields with newName and rejects name collisions', async () => {
  const { server, calls } = createServerWithMockRequest();

  await server.callTool('update_collection', {
    collection: 'posts',
    fieldUpdates: [{ name: 'title', newName: 'headline', required: true }],
  });

  const patchCall = calls.find((call) => call.method === 'PATCH' && call.endpoint === '/api/collections/posts');
  assert.deepEqual(patchCall.data, {
    fields: [{ name: 'headline', type: 'text', required: true }],
  });

  await assert.rejects(
    () =>
      server.callTool('update_collection', {
        collection: 'posts',
        fieldUpdates: [{ name: 'missing', newName: 'other', type: 'text' }],
      }),
    /newName can only rename an existing field: missing/
  );
  await assert.rejects(
    () =>
      server.callTool('update_collection', {
        collection: 'posts',
        fieldUpdates: [
          { name: 'title', newName: 'summary' },
          { name: 'summary', type: 'text' },
        ],
      }),
    /Duplicate field name after update: summary/
  );
});

test('requires type when adding a new field via fieldUpdates', async () => {
  const { server } = createServerWithMockRequest();

  await assert.rejects(
    () => server.callTool('update_collection', { collection: 'posts', fieldUpdates: [{ name: 'status' }] }),
    /Missing type for new field: status/
  );
});

test('validates field patch inputs', async () => {
  const { server } = createServerWithMockRequest();

  await assert.rejects(
    () =>
      server.callTool('update_collection', {
        collection: 'posts',
        fields: [{ name: 'title', type: 'text' }],
        fieldUpdates: [{ name: 'title', required: true }],
      }),
    /Cannot combine fields with fieldUpdates\/removeFields/
  );
  await assert.rejects(
    () =>
      server.callTool('update_collection', {
        collection: 'posts',
        fieldUpdates: [{ name: 'title' }, { name: 'title' }],
      }),
    /Duplicate field update for field: title/
  );
  await assert.rejects(
    () => server.callTool('update_collection', { collection: 'posts', removeFields: ['title', 'title'] }),
    /Duplicate removeFields entry for field: title/
  );
});

test('validates collection tool arguments', async () => {
  const { server } = createServerWithMockRequest();

  await assert.rejects(
    () => server.callTool('view_collection', {}),
    /Missing required parameter: collection/
  );
  await assert.rejects(
    () => server.callTool('create_collection', { name: 'posts', fields: 'invalid' }),
    /Invalid parameter: fields must be an array/
  );
  await assert.rejects(
    () => server.callTool('update_collection', { collection: 'posts' }),
    /Missing update payload/
  );
  await assert.rejects(
    () => server.callTool('delete_collection', { collection: '' }),
    /Invalid parameter: collection must be a non-empty string/
  );
  await assert.rejects(
    () => server.callTool('list_collections', { page: '2' }),
    /Invalid parameter: page must be a number/
  );
  await assert.rejects(
    () => server.callTool('list_collections', { page: 1.5 }),
    /Invalid parameter: page must be an integer/
  );
});

test('every tool declares annotations and destructive tools are flagged', () => {
  const tools = getToolDefinitions();
  for (const tool of tools) {
    assert.ok(tool.annotations, `${tool.name} is missing annotations`);
  }

  const destructive = tools.filter((tool) => tool.annotations.destructiveHint).map((tool) => tool.name);
  assert.deepEqual(destructive.sort(), [
    'batch_records',
    'delete_collection',
    'delete_record',
    'update_collection',
    'update_record',
  ]);
  assert.equal(tools.find((tool) => tool.name === 'list_records').annotations.readOnlyHint, true);
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
    () => server.callTool('list_records', { collection: 'posts', page: 1.5 }),
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
  assert.equal(JSON.parse(content.text).name, 'posts');
});

test('validates resource URI format', async () => {
  const { server } = createServerWithMockRequest();

  await assert.rejects(() => server.readResource('invalid://uri'), /Invalid resource URI/);
});

test('lists resources across all collection pages with encoded URIs', async () => {
  const server = new PocketBaseMCPServer('http://localhost:8090');
  const pages = {
    1: [makeCollection('posts')],
    2: [makeCollection('my notes')],
  };
  server.http.request = async (method, endpoint, data, query) => {
    if (method === 'GET' && endpoint === '/api/collections') {
      return { page: query.page, perPage: query.perPage, totalItems: 2, totalPages: 2, items: pages[query.page] };
    }
    if (method === 'GET' && endpoint.startsWith('/api/collections/')) {
      return makeCollection(parseCollectionFromPath(endpoint));
    }
    throw new Error(`Unexpected request: ${method} ${endpoint}`);
  };

  const resources = await server.listResources();
  assert.deepEqual(
    resources.map((resource) => resource.uri),
    ['pocketbase://collection/posts', 'pocketbase://collection/my%20notes']
  );

  const content = await server.readResource(resources[1].uri);
  assert.equal(JSON.parse(content.text).name, 'my notes');
});

test('list_records forwards skipTotal as a query flag', async () => {
  const { server, calls } = createServerWithMockRequest();

  await server.callTool('list_records', { collection: 'posts', skipTotal: true });
  assert.equal(calls.at(-1).query.skipTotal, 1);

  await assert.rejects(
    () => server.callTool('list_records', { collection: 'posts', skipTotal: 'yes' }),
    /Invalid parameter: skipTotal must be a boolean/
  );
});

test('batch_records maps operations to PocketBase batch requests', async () => {
  const server = new PocketBaseMCPServer('http://localhost:8090');
  let sent;
  server.http.request = async (method, endpoint, data) => {
    assert.equal(method, 'POST');
    assert.equal(endpoint, '/api/batch');
    sent = data;
    return data.requests.map(() => ({ status: 200, body: { id: 'r1' } }));
  };

  const result = await server.callTool('batch_records', {
    requests: [
      { action: 'create', collection: 'posts', data: { title: 'a' } },
      { action: 'update', collection: 'posts', id: 'r1', data: { title: 'b' } },
      { action: 'upsert', collection: 'posts', data: { id: 'r2', title: 'c' } },
      { action: 'delete', collection: 'my posts', id: 'r/3' },
    ],
  });

  assert.deepEqual(sent.requests, [
    { method: 'POST', url: '/api/collections/posts/records', body: { title: 'a' } },
    { method: 'PATCH', url: '/api/collections/posts/records/r1', body: { title: 'b' } },
    { method: 'PUT', url: '/api/collections/posts/records', body: { id: 'r2', title: 'c' } },
    { method: 'DELETE', url: '/api/collections/my%20posts/records/r%2F3' },
  ]);
  assert.deepEqual(result.results[3], { action: 'delete', collection: 'my posts', status: 200, body: { id: 'r1' } });
});

test('validates batch_records arguments', async () => {
  const { server } = createServerWithMockRequest();

  await assert.rejects(() => server.callTool('batch_records', { requests: [] }), /requests must not be empty/);
  await assert.rejects(
    () => server.callTool('batch_records', { requests: [{ action: 'drop', collection: 'posts' }] }),
    /requests\[0\]\.action must be one of create, update, upsert, delete/
  );
  await assert.rejects(
    () => server.callTool('batch_records', { requests: [{ action: 'update', collection: 'posts', data: {} }] }),
    /Missing required parameter: requests\[0\]\.id/
  );
  await assert.rejects(
    () => server.callTool('batch_records', { requests: [{ action: 'create', collection: 'posts' }] }),
    /Missing required parameter: requests\[0\]\.data/
  );
});

test('advertised input schemas are plain JSON Schema objects', () => {
  for (const tool of getToolDefinitions()) {
    assert.equal(tool.inputSchema.type, 'object', tool.name);
    assert.equal('$schema' in tool.inputSchema, false, tool.name);
  }

  const listRecords = getToolDefinitions().find((tool) => tool.name === 'list_records');
  assert.deepEqual(listRecords.inputSchema.properties.page, { type: 'integer', description: 'Page number (default: 1)' });
  assert.deepEqual(listRecords.inputSchema.required, ['collection']);
});

test('reports every invalid parameter with its nested path', async () => {
  const { server } = createServerWithMockRequest();

  await assert.rejects(
    () => server.callTool('create_collection', { name: 'x', type: 'zz', fields: [{ name: 'a' }] }),
    /Invalid parameter: type must be one of base, auth, view; Missing required parameter: fields\[0\]\.type/
  );
});

test('accepts datetime strings for date field min/max', async () => {
  const { server, calls } = createServerWithMockRequest();

  await server.callTool('create_collection', {
    name: 'events',
    fields: [{ name: 'startsAt', type: 'date', min: '2026-01-01 00:00:00.000Z' }],
  });
  assert.equal(calls.at(-1).data.fields[0].min, '2026-01-01 00:00:00.000Z');
});
