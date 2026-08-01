import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { PocketBaseMCPServer } from '../dist/server.js';

const RUN_LIVE = process.env.POCKETBASE_LIVE_TEST === '1';
const ADMIN_EMAIL = process.env.POCKETBASE_LIVE_ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.POCKETBASE_LIVE_ADMIN_PASSWORD || 'supersecret123';
const TEST_COLLECTION_PREFIX = 'mcp_live_notes';
const AUTH_COLLECTION_PREFIX = 'mcp_live_users';
const REL_COLLECTION_PREFIX = 'mcp_live_comments';
const RECORD_TITLE = 'live note';
const VERBOSE = process.env.POCKETBASE_LIVE_VERBOSE === '1';

function logStep(message) {
  if (VERBOSE) {
    console.log(`[live] ${message}`);
  }
}

async function getFreePort() {
  const server = createServer();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));

  if (!port) {
    throw new Error('Failed to allocate a free port for PocketBase live test');
  }

  return port;
}

async function waitForHealth(url, processRef, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (processRef.exitCode !== null) {
      throw new Error(`PocketBase process exited before health check succeeded with code ${processRef.exitCode}`);
    }

    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`PocketBase health check timed out for ${url}`);
}

test('live PocketBase flow exercises real server', { skip: !RUN_LIVE, timeout: 120000 }, async () => {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = mkdtempSync(path.join(tmpdir(), 'pb-live-'));
  const migrationsDir = path.join(dataDir, 'pb_migrations');
  mkdirSync(migrationsDir, { recursive: true });
  const suffix = Date.now().toString(36);
  const testCollection = `${TEST_COLLECTION_PREFIX}_${suffix}`;
  const authCollection = `${AUTH_COLLECTION_PREFIX}_${suffix}`;
  const relationCollection = `${REL_COLLECTION_PREFIX}_${suffix}`;
  const wrapperArgs = ['-y', '@fadlee/pocketbase-bin'];
  logStep(`temp dir: ${dataDir}`);
  logStep(`collections: ${testCollection}, ${relationCollection}, ${authCollection}`);

  execFileSync('npx', [...wrapperArgs, '--help'], {
    cwd: dataDir,
    stdio: 'ignore',
  });

  const binaryPath = existsSync(path.join(dataDir, 'pocketbase'))
    ? path.join(dataDir, 'pocketbase')
    : path.join(dataDir, 'pocketbase.exe');

  if (!existsSync(binaryPath)) {
    throw new Error('PocketBase binary was not provisioned in the live test directory');
  }

  execFileSync(binaryPath, ['superuser', 'create', ADMIN_EMAIL, ADMIN_PASSWORD, '--dir', dataDir, '--migrationsDir', migrationsDir], {
    cwd: dataDir,
    stdio: 'ignore',
  });

  const pocketbaseProcess = spawn(binaryPath, ['serve', `--http=127.0.0.1:${port}`, '--dir', dataDir, '--migrationsDir', migrationsDir], {
    cwd: dataDir,
    stdio: 'ignore',
  });

  try {
    await waitForHealth(baseUrl, pocketbaseProcess);
    logStep(`PocketBase ready at ${baseUrl}`);

    const server = new PocketBaseMCPServer(baseUrl);

    const health = await server.callTool('health', {});
    assert.equal(health.code, 200);

    const auth = await server.callTool('auth_admin', {
      identity: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    logStep('authenticated as superuser');
    assert.equal(auth.authenticated, true);

    await server.callTool('create_collection', {
      name: testCollection,
      fields: [{ name: 'title', type: 'text', required: true }],
      listRule: null,
    });

    logStep('created base collection');
    const viewedCollection = await server.callTool('view_collection', { collection: testCollection });
    assert.equal(viewedCollection.name, testCollection);

    const updatedCollection = await server.callTool('update_collection', {
      collection: testCollection,
      fieldUpdates: [
        { name: 'title', max: 200 },
        { name: 'status', type: 'select', values: ['draft', 'published'], maxSelect: 1 },
      ],
    });
    assert.equal(updatedCollection.name, testCollection);
    assert.equal(updatedCollection.fields.some((field) => field.name === 'status'), true);
    logStep('patched base collection schema');

    const createdRecord = await server.callTool('create_record', {
      collection: testCollection,
      data: { title: RECORD_TITLE, status: 'draft' },
    });
    assert.equal(createdRecord.title, RECORD_TITLE);
    logStep(`created base record ${createdRecord.id}`);

    const viewedRecord = await server.callTool('view_record', {
      collection: testCollection,
      id: createdRecord.id,
    });
    assert.equal(viewedRecord.id, createdRecord.id);

    const updatedRecord = await server.callTool('update_record', {
      collection: testCollection,
      id: createdRecord.id,
      data: { status: 'published' },
    });
    assert.equal(updatedRecord.status, 'published');

    const records = await server.callTool('list_records', {
      collection: testCollection,
      filter: 'status = "published"',
    });
    assert.equal(records.items.length, 1);
    assert.equal(records.items[0].status, 'published');
    logStep('verified record update and filtered list');

    const resource = await server.readResource(`pocketbase://collection/${testCollection}`);
    assert.match(resource.text, new RegExp(testCollection));
    logStep('validated collection resource read');

    await server.callTool('create_collection', {
      name: relationCollection,
      fields: [
        { name: 'message', type: 'text', required: true },
        { name: 'post', type: 'relation', collectionId: viewedCollection.id, maxSelect: 1, required: true },
      ],
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
    });

    const relationRecord = await server.callTool('create_record', {
      collection: relationCollection,
      data: {
        message: 'first comment',
        post: createdRecord.id,
      },
    });
    assert.equal(relationRecord.post, createdRecord.id);
    logStep(`created relation record ${relationRecord.id}`);

    const expandedRecord = await server.callTool('view_record', {
      collection: relationCollection,
      id: relationRecord.id,
      expand: 'post',
    });
    assert.equal(expandedRecord.post, createdRecord.id);
    assert.equal(expandedRecord.expand.post.id, createdRecord.id);

    const expandedList = await server.callTool('list_records', {
      collection: relationCollection,
      filter: `post = "${createdRecord.id}"`,
      expand: 'post',
    });
    assert.equal(expandedList.items.length, 1);
    assert.equal(expandedList.items[0].expand.post.id, createdRecord.id);
    logStep('verified relation expand on view and list');

    const deletedRelationRecord = await server.callTool('delete_record', {
      collection: relationCollection,
      id: relationRecord.id,
    });
    assert.equal(deletedRelationRecord.message, 'Record deleted successfully');
    logStep('deleted relation record');

    const deletedRecord = await server.callTool('delete_record', {
      collection: testCollection,
      id: createdRecord.id,
    });
    assert.equal(deletedRecord.message, 'Record deleted successfully');
    logStep('deleted base record');

    await server.callTool('create_collection', {
      name: authCollection,
      type: 'auth',
      fields: [{ name: 'nickname', type: 'text' }],
      listRule: null,
    });

    const authRecord = await server.callTool('create_record', {
      collection: authCollection,
      data: {
        email: `user_${Date.now().toString(36)}@example.com`,
        password: 'userpassword123',
        passwordConfirm: 'userpassword123',
        nickname: 'live-user',
      },
    });
    logStep(`created auth record ${authRecord.id}`);
    assert.equal(authRecord.email.includes('@example.com'), true);

    const userAuth = await server.callTool('auth_user', {
      collection: authCollection,
      identity: authRecord.email,
      password: 'userpassword123',
    });
    assert.equal(userAuth.authenticated, true);
    assert.equal(userAuth.collection, authCollection);
    logStep('authenticated as auth collection user');

    const authStatus = await server.callTool('get_auth_status', {});
    assert.equal(authStatus.authenticated, true);

    const logout = await server.callTool('logout', {});
    assert.equal(logout.authenticated, false);
    logStep('verified auth status and logout');

    const adminAuthAgain = await server.callTool('auth_admin', {
      identity: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    assert.equal(adminAuthAgain.authenticated, true);

    const deletedRelationCollection = await server.callTool('delete_collection', { collection: relationCollection });
    assert.equal(deletedRelationCollection.message, 'Collection deleted successfully');

    const deletedCollection = await server.callTool('delete_collection', { collection: testCollection });
    assert.equal(deletedCollection.message, 'Collection deleted successfully');

    const deletedAuthCollection = await server.callTool('delete_collection', { collection: authCollection });
    assert.equal(deletedAuthCollection.message, 'Collection deleted successfully');
    logStep('cleaned up all live collections');
  } finally {
    if (pocketbaseProcess.exitCode === null) {
      pocketbaseProcess.kill('SIGTERM');

      await Promise.race([
        once(pocketbaseProcess, 'exit'),
        new Promise((resolve) => setTimeout(resolve, 5000)).then(() => {
          if (pocketbaseProcess.exitCode === null) {
            pocketbaseProcess.kill('SIGKILL');
          }
        }),
      ]);

      if (pocketbaseProcess.exitCode === null) {
        await once(pocketbaseProcess, 'exit');
      }
    }

    rmSync(dataDir, { recursive: true, force: true });
  }
});
