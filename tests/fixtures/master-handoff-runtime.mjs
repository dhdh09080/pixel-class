// Only the QA harness mounts this into a new disposable Docker volume.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { scryptSync, createHash } from 'node:crypto';
assert.equal(existsSync('/app/data/school.sqlite'), false, 'fixture requires a fresh QA volume');
const gate = 'fixture-only-private-school-password-32';
const password = 'fixture-initial-owner-password';
const changedPassword = 'fixture-owner-changed-password';
const env = {
  ...process.env,
  NODE_ENV: 'production',
  DEMO_MODE: 'false',
  HOST: '0.0.0.0',
  PORT: '8080',
  PIXEL_RUNTIME: 'railway',
  RAILWAY_VOLUME_NAME: 'isolated-owner-qa',
  RAILWAY_VOLUME_MOUNT_PATH: '/app/data',
  DATABASE_PATH: '/app/data/school.sqlite',
  DATABASE_MODE: 'existing',
  PUBLIC_ORIGIN: 'https://owner-qa.example',
  COOKIE_SECURE: 'true',
  TRUST_PROXY_HOPS: '1',
  STAGING_ACCESS_KEY: gate,
  AI_ENABLED: 'false',
  AUTO_BACKUP: 'false',
};
Object.assign(process.env, env);
const { db, insertMember, put } = await import('/app/server/db.ts');
const { defaultAppearance } = await import('/app/shared/types.ts');
for (const [id, role] of [
  ['owner', 'MASTER'],
  ['student', 'STUDENT'],
])
  insertMember(
    {
      id,
      schoolId: 'qa',
      name: id,
      role,
      status: 'ACTIVE',
      appearance: defaultAppearance,
      deskId: null,
      help: false,
      workStatus: 'IDLE',
    },
    id + '@before.example',
    'fixture-old-password',
  );
put('qa-sentinel', { id: 'preserve-record', text: 'keep all existing school data' }, 'qa');
db.close();
const salt = 'a'.repeat(32);
const payload = Buffer.from(
  JSON.stringify({
    operationId: '11111111-2222-4333-8444-555555555555',
    email: 'owner@after.example',
    passwordHash: salt + ':' + scryptSync(password, salt, 64).toString('hex'),
    expectedAccessDigest: createHash('sha256').update(gate).digest('hex'),
  }),
).toString('base64url');
const headers = {
  Authorization: 'Basic ' + Buffer.from('pixel:' + gate).toString('base64'),
  Origin: env.PUBLIC_ORIGIN,
  'Content-Type': 'application/json',
  'X-Pixel-Class': '1',
};
async function run(replay) {
  const child = spawn(process.execPath, ['scripts/master-handoff.mjs', payload], {
    cwd: '/app',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => {
    output += d;
  });
  child.stderr.resume();
  try {
    let ready = false;
    for (let i = 0; i < 90; i++) {
      try {
        if ((await fetch('http://127.0.0.1:8080/api/health')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, 'handoff must return to the normal server');
    const line = output.split('\n').find((x) => x.startsWith('PIXEL_OWNER_HANDOFF '));
    const result = JSON.parse(line.slice('PIXEL_OWNER_HANDOFF '.length));
    assert.equal(result.ok, true);
    assert.equal(result.accessMatchesExpected, true);
    assert.equal(result.applied, !replay);
    assert.equal(result.alreadyApplied, replay);
    assert.ok(
      !output.includes(password) &&
        !output.includes(gate) &&
        !output.includes('owner@after.example'),
    );
    const status = readFileSync('/proc/' + child.pid + '/status', 'utf8');
    assert.match(status, /^Uid:\s+1000\s+1000\s+1000\s+1000$/m);
    assert.match(status, /^CapEff:\s+0+$/m);
    const login = (raw) =>
      fetch('http://127.0.0.1:8080/api/login', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: 'owner@after.example', password: raw }),
      });
    if (replay) assert.equal((await login(password)).status, 401);
    const signed = await login(replay ? changedPassword : password);
    assert.equal(signed.status, 200);
    const Cookie = signed.headers.get('set-cookie').split(';')[0];
    const state = await (
      await fetch('http://127.0.0.1:8080/api/state', { headers: { ...headers, Cookie } })
    ).json();
    assert.equal(state.me.id, 'owner');
    assert.equal(state.me.role, 'MASTER');
    assert.equal(state.members.length, 2);
    if (!replay) {
      const changed = await fetch('http://127.0.0.1:8080/api/account/password', {
        method: 'POST',
        headers: { ...headers, Cookie },
        body: JSON.stringify({ currentPassword: password, password: changedPassword }),
      });
      assert.equal(changed.status, 200);
    }
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
}
await run(false);
await run(true);
assert.equal(
  statSync('/app/data/backups/before-owner-11111111-2222-4333-8444-555555555555.sqlite').mode &
    0o777,
  0o600,
);
console.log(
  'Owner handoff runtime: backup, normal login, UID1000/capabilities, data preservation and safe replay passed.',
);
