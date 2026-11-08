import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentIssues, type DeploymentConfig } from '../shared/deployment.js';
const configuration = (): DeploymentConfig => ({
  services: {
    app: {
      image: 'pixel-class@sha256:' + 'a'.repeat(64),
      read_only: true,
      cap_drop: ['ALL'],
      security_opt: ['no-new-privileges:true'],
      volumes: [{ type: 'volume', source: 'school-data', target: '/app/data' }],
      environment: {
        NODE_ENV: 'production',
        DEMO_MODE: 'false',
        DATABASE_PATH: '/app/data/school.sqlite',
        COOKIE_SECURE: 'true',
        TRUST_PROXY_HOPS: '1',
        PUBLIC_ORIGIN: 'https://class.example.com',
      },
    },
    https: { ports: [{ target: 443, host_ip: '192.0.2.5' }], secrets: ['staging_access'] },
  },
});
test('external deployment needs an immutable image, persistent SQLite and reachable HTTPS', () => {
  assert.deepEqual(deploymentIssues(configuration()), []);
  const local = configuration();
  local.services.app.image = 'pixel-class:local';
  local.services.app.environment!.PUBLIC_ORIGIN = 'https://localhost:8443';
  local.services.https.ports![0].host_ip = '127.0.0.1';
  assert.deepEqual(deploymentIssues(local, true), []);
  assert.equal(deploymentIssues(local).length, 3);
});
test('deployment inspection rejects published app ports, replicas and ephemeral storage', () => {
  const c = configuration();
  c.services.app.ports = [{ target: 3001 }];
  c.services.app.deploy = { replicas: 2 };
  c.services.app.volumes = [];
  assert.deepEqual(
    deploymentIssues(c).map((x) => x.split(':')[0]),
    ['APP_PORT', 'REPLICAS', 'STORAGE'],
  );
  c.services.app.ports = [];
  c.services.app.network_mode = 'host';
  assert.ok(deploymentIssues(c).some((x) => x.startsWith('APP_PORT')));
});
test('deployment inspection fails closed for demo, unsafe cookies, wrong origin and plaintext secrets', () => {
  const c = configuration();
  Object.assign(c.services.app.environment!, {
    DEMO_MODE: 'true',
    COOKIE_SECURE: 'false',
    PUBLIC_ORIGIN: 'http://class.example.com',
    OPENAI_API_KEY: 'test-placeholder',
  });
  assert.deepEqual(
    deploymentIssues(c).map((x) => x.split(':')[0]),
    ['RUNTIME', 'ORIGIN', 'SECRETS'],
  );
});
test('AI release pair and container isolation are required without exposing any key value', () => {
  const c = configuration();
  c.services.app.read_only = false;
  c.services.app.environment!.OPENAI_MODEL = 'project-model';
  assert.deepEqual(
    deploymentIssues(c).map((x) => x.split(':')[0]),
    ['SANDBOX', 'AI_PAIR'],
  );
  c.services.app.environment!.OPENAI_API_KEY_FILE = '/run/secrets/openai_api_key';
  c.services.app.secrets = ['openai_api_key'];
  assert.equal(deploymentIssues(c).length, 1);
});

test('preflight rejects zero replicas, alternate loopback bindings and mounts shadowing the database', () => {
  const c = configuration();
  c.services.app.scale = 0;
  c.services.app.volumes!.push({
    type: 'bind',
    source: '/tmp/unsafe-file',
    target: '/app/data/school.sqlite',
  });
  c.services.https.ports![0].host_ip = '127.0.0.2';
  c.services.app.environment!.PUBLIC_ORIGIN = 'https://127.0.0.2';
  assert.deepEqual(
    deploymentIssues(c).map((x) => x.split(':')[0]),
    ['REPLICAS', 'STORAGE', 'ORIGIN', 'INGRESS'],
  );
});

test('active secret mounts must match their configured paths; existing schools can remove bootstrap', () => {
  const c = configuration();
  c.services.https.secrets = [];
  assert.ok(deploymentIssues(c).some((x) => x.startsWith('GATE_MOUNT')));
  c.services.https.secrets = ['staging_access'];
  c.services.app.environment!.MASTER_BOOTSTRAP_KEY_FILE = '/run/secrets/master_bootstrap';
  assert.ok(deploymentIssues(c).some((x) => x.startsWith('SECRET_MOUNT')));
  c.services.app.secrets = ['master_bootstrap'];
  assert.deepEqual(deploymentIssues(c), []);
  c.services.app.secrets = [
    { source: 'master_bootstrap', target: '/run/secrets/master_bootstrap' },
  ];
  c.services.https.secrets = [{ source: 'staging_access', target: '/run/secrets/staging_access' }];
  assert.deepEqual(deploymentIssues(c), []);
  c.services.app.secrets = [{ source: 'master_bootstrap', target: '/tmp/wrong' }];
  assert.ok(deploymentIssues(c).some((x) => x.startsWith('SECRET_MOUNT')));
  delete c.services.app.environment!.MASTER_BOOTSTRAP_KEY_FILE;
  c.services.app.secrets = [];
  assert.deepEqual(deploymentIssues(c), []); // Database bootstrap readiness remains a separate acceptance check.
});
