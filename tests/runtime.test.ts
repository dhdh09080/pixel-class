import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateRuntime, allowedOrigin, loadSecretFiles } from '../server/config.js';

const production = () => ({
  NODE_ENV: 'production',
  PUBLIC_ORIGIN: 'https://school.example.com',
  COOKIE_SECURE: 'true',
  DATABASE_PATH: '/app/data/school.sqlite',
  MASTER_BOOTSTRAP_KEY: 'test-only-key-with-at-least-32-characters',
  TRUST_PROXY_HOPS: '1',
});
test('production fails closed for missing origin, insecure cookies, weak bootstrap or missing storage', () => {
  validateRuntime(production());
  for (const values of [
    { PUBLIC_ORIGIN: '' },
    { COOKIE_SECURE: 'false' },
    { PUBLIC_ORIGIN: 'http://school.example.com' },
    { PUBLIC_ORIGIN: 'https://school.example.com/' },
    { MASTER_BOOTSTRAP_KEY: 'short' },
    { DATABASE_PATH: '' },
    { TRUST_PROXY_HOPS: 'true' },
  ]) {
    assert.throws(() => validateRuntime({ ...production(), ...values }));
  }
  assert.doesNotThrow(() => validateRuntime({ ...production(), MASTER_BOOTSTRAP_KEY: '' }));
});
test('insecure production exception is limited to explicit loopback-only tests', () => {
  const local = {
    ...production(),
    PUBLIC_ORIGIN: 'http://127.0.0.1:3013',
    COOKIE_SECURE: 'false',
    HOST: '127.0.0.1',
    ALLOW_INSECURE_LOCALHOST: 'true',
  };
  validateRuntime(local);
  assert.throws(() => validateRuntime({ ...local, HOST: '0.0.0.0' }));
  assert.throws(() => validateRuntime({ ...local, PUBLIC_ORIGIN: 'http://school.example.com' }));
});
test('canonical Origin rejects scheme changes, malformed origins and attacker ports for HTTP and WebSocket', () => {
  for (const origin of [
    'not-a-url',
    'null',
    'https://school.example.com.attacker.test',
    'http://school.example.com',
    'https://school.example.com:444',
    'https://school.example.com/path',
  ])
    assert.equal(allowedOrigin(origin, 'school.example.com', production().PUBLIC_ORIGIN), false);
  assert.equal(
    allowedOrigin(production().PUBLIC_ORIGIN, 'app:3001', production().PUBLIC_ORIGIN),
    true,
  );
  assert.equal(allowedOrigin('http://localhost:5173', 'localhost:5173'), true);
});
test('Docker secret files stay server-side and conflicting configurations are rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-secret-test-'));
  try {
    const file = join(dir, 'bootstrap');
    writeFileSync(file, 'test-only-bootstrap-value\n', { mode: 0o600 });
    const env: Record<string, string | undefined> = { MASTER_BOOTSTRAP_KEY_FILE: file };
    loadSecretFiles(env);
    assert.equal(env.MASTER_BOOTSTRAP_KEY, 'test-only-bootstrap-value');
    assert.throws(() => loadSecretFiles(env));
    writeFileSync(file, '');
    assert.throws(() => loadSecretFiles({ MASTER_BOOTSTRAP_KEY_FILE: file }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
