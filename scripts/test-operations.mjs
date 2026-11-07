import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, createHash, X509Certificate } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import https from 'node:https';

const dir = mkdtempSync(join(tmpdir(), 'pixel-operations-'));
const project = `pixelops-${randomBytes(5).toString('hex')}`;
const origin = `https://localhost:${process.env.OPS_HTTPS_PORT || '8443'}`;
const password = randomBytes(24).toString('hex'),
  bootstrap = randomBytes(32).toString('hex');
const dockerEnv = { ...process.env };
for (const key of [
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_TLS',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
])
  delete dockerEnv[key];
const env = {
  ...dockerEnv,
  PIXEL_DOMAIN: 'localhost',
  PIXEL_HTTPS_PORT: new URL(origin).port,
  PIXEL_IMAGE: process.env.PIXEL_IMAGE || 'pixel-class:ops-test',
  MASTER_BOOTSTRAP_FILE: join(dir, 'bootstrap'),
  STAGING_ACCESS_FILE: join(dir, 'access'),
};
const dockerPrefix = ['--host=unix:///var/run/docker.sock'];
function docker(args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync('docker', [...dockerPrefix, ...args], {
    env,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.status !== 0 && !allowFailure)
    throw new Error(`Docker operation failed (${args[0]}). ${capture ? result.stderr : ''}`);
  return result.stdout?.trim() || '';
}
const composeArgs = [
  'compose',
  '--project-name',
  project,
  '-f',
  'compose.yaml',
  '-f',
  'deploy/compose.test.yaml',
];
const compose = (args, options) => docker([...composeArgs, ...args], options);
function probe(ca, authorization) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      origin + '/api/health',
      { ca, headers: authorization ? { Authorization: authorization } : {} },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.setTimeout(5000, () => req.destroy(Error('HTTPS probe timeout')));
    req.on('error', reject);
  });
}
try {
  writeFileSync(env.MASTER_BOOTSTRAP_FILE, bootstrap, { mode: 0o400 });
  writeFileSync(join(dir, 'empty-access'), '', { mode: 0o400 });
  const emptySecretCheck = spawnSync(
    'docker',
    [
      ...dockerPrefix,
      'run',
      '--rm',
      '--network',
      'none',
      '--entrypoint',
      '/bin/sh',
      '--mount',
      `type=bind,src=${join(process.cwd(), 'deploy/start-caddy.sh')},dst=/etc/caddy/start.sh,readonly`,
      '--mount',
      `type=bind,src=${join(dir, 'empty-access')},dst=/run/secrets/staging_access,readonly`,
      'caddy:2.11.3@sha256:ec18ee54aab3315c22e25f3b2babda73ff8007d39b13b3bd1bfffa2f0444c7d9',
      '/etc/caddy/start.sh',
    ],
    { env, encoding: 'utf8' },
  );
  if (
    emptySecretCheck.status !== 1 ||
    !emptySecretCheck.stderr.includes('non-empty staging access')
  )
    throw new Error('Empty staging secret guard did not reject startup.');
  // Generated, throwaway test credentials. They are never printed or committed.
  const hash = docker(
    [
      'run',
      '--rm',
      '--network',
      'none',
      '--entrypoint',
      'caddy',
      'caddy:2.11.3@sha256:ec18ee54aab3315c22e25f3b2babda73ff8007d39b13b3bd1bfffa2f0444c7d9',
      'hash-password',
      '--plaintext',
      password,
    ],
    { capture: true },
  );
  writeFileSync(env.STAGING_ACCESS_FILE, `basic_auth {\n  tester ${hash}\n}\n`, { mode: 0o400 });
  compose(['config', '--quiet']);
  compose(['up', '--detach', '--no-build', '--wait', '--wait-timeout', '90']);
  let certificateReady = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      compose(
        [
          'exec',
          '-T',
          'https',
          'test',
          '-s',
          '/data/caddy/certificates/local/localhost/localhost.crt',
        ],
        { capture: true },
      );
      certificateReady = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  if (!certificateReady) throw new Error('Local TLS certificate was not provisioned.');
  compose(['cp', 'https:/data/caddy/pki/authorities/local/root.crt', join(dir, 'root.crt')], {
    capture: true,
  });
  compose(
    ['cp', 'https:/data/caddy/certificates/local/localhost/localhost.crt', join(dir, 'leaf.crt')],
    { capture: true },
  );
  const ca = readFileSync(join(dir, 'root.crt'));
  if ((await probe(ca)) !== 401) throw new Error('Unauthenticated staging access was not denied.');
  const authorization = 'Basic ' + Buffer.from(`tester:${password}`).toString('base64');
  const status = await probe(ca, authorization);
  if (status !== 200) throw new Error(`Authenticated TLS/health check failed: HTTP ${status}.`);
  console.log('Local CA verified (hostname + chain); staging gate rejects anonymous HTTPS.');
  const certificate = new X509Certificate(readFileSync(join(dir, 'leaf.crt')));
  const spki = createHash('sha256')
    .update(certificate.publicKey.export({ type: 'spki', format: 'der' }))
    .digest('base64');
  const config = { project, composeArgs, dir };
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config), { mode: 0o600 });
  const childEnv = {
    ...env,
    NODE_EXTRA_CA_CERTS: join(dir, 'root.crt'),
    OPS_BASE_URL: origin,
    OPS_ACCESS_USER: 'tester',
    OPS_ACCESS_PASSWORD: password,
    OPS_BOOTSTRAP_KEY: bootstrap,
    OPS_CONFIG_FILE: join(dir, 'config.json'),
    OPS_TLS_SPKI: spki,
  };
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config',
        'playwright.operations.config.ts',
      ],
      { env: childEnv, stdio: 'inherit' },
    );
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  if (code !== 0) throw new Error('Container browser verification failed.');
  console.log(
    'Container HTTPS, real accounts, persistence and backup/restore verification passed. No external deployment was created.',
  );
} catch (error) {
  console.error(error.message);
  try {
    console.error(
      compose(['logs', '--no-color', '--tail', '45', 'app', 'https'], { capture: true })
        .replaceAll(password, '[REDACTED]')
        .replaceAll(bootstrap, '[REDACTED]'),
    );
  } catch {}
  process.exitCode = 1;
} finally {
  compose(['down', '--volumes', '--remove-orphans'], { allowFailure: true });
  rmSync(dir, { force: true, recursive: true });
}
