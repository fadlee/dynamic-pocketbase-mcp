#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';

const env = {
  ...process.env,
  POCKETBASE_LIVE_TEST: '1',
  POCKETBASE_LIVE_VERBOSE: process.env.POCKETBASE_LIVE_VERBOSE || '1',
};

const baseUrl = process.env.POCKETBASE_LIVE_URL || 'dynamic free port';
const adminEmail = process.env.POCKETBASE_LIVE_ADMIN_EMAIL || 'admin@example.com';

console.log('PocketBase live integration test');
console.log(`- server: ${baseUrl}`);
console.log(`- admin: ${adminEmail}`);
console.log('- coverage: health, admin auth, collection CRUD, record CRUD, relation expand, auth_user');
console.log('');

const result = spawnSync(process.execPath, ['--test', 'test/live-pocketbase.test.mjs'], {
  stdio: 'inherit',
  env,
});

if (result.error) {
  throw result.error;
}

console.log('');
console.log(result.status === 0 ? 'Live integration test passed.' : 'Live integration test failed.');
process.exit(result.status ?? 1);
