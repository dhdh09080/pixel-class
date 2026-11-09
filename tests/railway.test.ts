import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privateAccess } from '../server/private-access.js';
import { hasMount, isRailway } from '../server/railway-volume.mjs';
import { validateRuntime } from '../server/config.js';
import railway from '../.railway/railway.js';
import { createRailwayContext } from 'railway/iac';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const secret = 'unit-test-only-access-key-32-characters';
const basic = (s: string) => `Basic ${Buffer.from(s).toString('base64')}`;
test('Railway private gate rejects missing, malformed, wrong-user and wrong-password credentials', () => {
  assert.equal(privateAccess(basic(`pixel:${secret}`), secret), true);
  for (const value of [
    undefined,
    '',
    'Bearer token',
    basic(`student:${secret}`),
    basic('pixel:wrong'),
    basic(`pixel:${secret}`) + '=',
    'Basic !!!!',
    'Basic ' + 'a'.repeat(513),
  ])
    assert.equal(privateAccess(value, secret), false);
  assert.equal(privateAccess(basic(`pixel:${secret}`), undefined), false);
});
test('Railway requires a real exact volume mount, not a similarly named path or environment alone', () => {
  const mount = '28 1 0:32 / /app/data rw - ext4 /dev/test rw\n';
  assert.equal(hasMount(mount, '/app/data'), true);
  for (const info of [
    '',
    mount.replace('/app/data ', '/app/data-other '),
    mount.replace('/app/data ', '/app '),
  ])
    assert.equal(hasMount(info, '/app/data'), false);
  assert.equal(hasMount(mount.replace('/app/data', '/app/my\\040data'), '/app/my data'), true);
  assert.equal(isRailway({ RAILWAY_PROJECT_ID: 'test' }), true);
  assert.equal(isRailway({}), false);
});
const production = () => ({
  PIXEL_RUNTIME: 'railway',
  NODE_ENV: 'production',
  DEMO_MODE: 'false',
  HOST: '0.0.0.0',
  PORT: '8080',
  PUBLIC_ORIGIN: 'https://school.example.com',
  COOKIE_SECURE: 'true',
  TRUST_PROXY_HOPS: '1',
  DATABASE_PATH: '/app/data/school.sqlite',
  STAGING_ACCESS_KEY: secret,
});
test('Railway rejects unsafe runtime and accidental AI enabling; 3 calls per school is the trial ceiling', () => {
  validateRuntime(production());
  for (const values of [
    { NODE_ENV: 'development' },
    { DEMO_MODE: 'true' },
    { HOST: '127.0.0.1' },
    { PORT: '0' },
    { PORT: '65536' },
    { TRUST_PROXY_HOPS: '0' },
    { COOKIE_SECURE: 'false' },
    { ALLOW_INSECURE_LOCALHOST: 'true' },
    { STAGING_ACCESS_KEY: '' },
    { STAGING_ACCESS_KEY: 'too-short' },
    { MASTER_BOOTSTRAP_KEY: secret },
    { AI_ENABLED: 'yes' },
    { AI_ENABLED: 'true' },
    { AI_ENABLED: 'true', AI_SCHOOL_DAILY_CALLS: '4', AI_MAX_CONCURRENT: '1' },
    { AI_ENABLED: 'true', AI_SCHOOL_DAILY_CALLS: '3', AI_MAX_CONCURRENT: '2' },
  ])
    assert.throws(() => validateRuntime({ ...production(), ...values }));
  validateRuntime({
    ...production(),
    AI_ENABLED: 'true',
    AI_SCHOOL_DAILY_CALLS: '3',
    AI_MAX_CONCURRENT: '1',
  });
});
test('Railway IaC defines an offline graph with one service, one volume and preserved sealed secrets', async () => {
  const definition = await railway(createRailwayContext(), (_name, _definition) => {
    throw Error('Unexpected callback');
  });
  const serialized = JSON.stringify(definition);
  assert.ok(serialized.includes('DOCKERFILE'));
  assert.ok(serialized.includes('/app/data'));
  assert.ok(serialized.includes('"type":"preserve"'));
  assert.ok(!serialized.includes(secret));
  assert.equal(definition.resources?.length, 2);
  assert.ok(serialized.includes('"isSealed":true'));
  const app = definition.resources?.flat().find((resource) => resource.type === 'service');
  assert.equal(app?.deploy?.numReplicas, 1);
  assert.deepEqual(app?.cdn, { enabled: false });
  assert.equal(app?.deploy?.healthcheckPath, '/api/health');
  assert.equal(app?.deploy?.requiredMountPath, '/app/data');
  assert.equal(app?.deploy?.overlapSeconds, 0);
  assert.deepEqual(app?.variables?.AI_ENABLED, { type: 'literal', value: 'false' });
  assert.deepEqual(app?.variables?.AI_SCHOOL_DAILY_CALLS, { type: 'literal', value: '3' });
  assert.deepEqual(app?.variables?.MASTER_BOOTSTRAP_KEY, {
    type: 'raw',
    value: { preserveExisting: true, isSealed: true },
  });
});

test('Railway secret generation refuses repository paths and overwrites, writes 0600 without stdout secrets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-railway-secret-test-'));
  const run = (path: string) =>
    spawnSync(process.execPath, ['scripts/railway-secrets.mjs', path], { encoding: 'utf8' });
  try {
    assert.notEqual(run(join(process.cwd(), '.env.railway-test')).status, 0);
    const file = join(dir, 'secrets');
    const result = run(file);
    assert.equal(result.status, 0);
    const values = readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => line.split('=')[1]);
    assert.equal(values.length, 2);
    assert.notEqual(values[0], values[1]);
    for (const value of values) {
      assert.match(value, /^[0-9a-f]{64}$/);
      assert.ok(!result.stdout.includes(value));
    }
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.notEqual(run(file).status, 0);
    assert.equal(readFileSync(file, 'utf8').trim().split('\n')[0].split('=')[1], values[0]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
