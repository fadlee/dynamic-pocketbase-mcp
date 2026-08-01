#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';

const env = {
  ...process.env,
  POCKETBASE_LIVE_TEST: '1',
};

const result = spawnSync(process.execPath, ['--test', 'test/live-pocketbase.test.mjs'], {
  stdio: 'inherit',
  env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
