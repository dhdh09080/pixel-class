// Runs only in a disposable Docker volume created by the QA harness.
import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  symlinkSync,
  statSync,
  accessSync,
  constants,
} from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { prepareVolumePermissions, admitRailwayDatabase } from '/app/server/railway-volume.mjs';
const env = {
  RAILWAY_VOLUME_NAME: 'isolated-qa',
  RAILWAY_VOLUME_MOUNT_PATH: '/app/data',
  DATABASE_PATH: '/app/data/school.sqlite',
};
if (process.argv.includes('--no-volume')) {
  assert.throws(() => prepareVolumePermissions(env), /real persistent volume/);
  console.log('Railway guard: missing kernel volume rejected.');
} else {
  assert.throws(() => admitRailwayDatabase(env), /UID 1000/);
  prepareVolumePermissions(env);
  process.setgroups([]);
  process.setgid(1000);
  process.setuid(1000);
  process.umask(0o077);
  // Writable root filesystem, like Railway: the app must not replace code
  // that a future root launcher will import on process restart.
  for (const path of [
    '/app',
    '/app/scripts',
    '/app/server',
    '/app/shared',
    '/app/dist',
    '/app/scripts/start.mjs',
    '/app/server/railway-volume.mjs',
    '/app/package.json',
  ]) {
    assert.equal(statSync(path).uid, 0, 'Application code must remain root-owned.');
    accessSync(path, constants.R_OK);
    if (statSync(path).isDirectory()) accessSync(path, constants.X_OK);
    assert.throws(
      () => accessSync(path, constants.W_OK),
      /EACCES/,
      'Application code must not be writable by UID1000.',
    );
  }
  assert.equal(statSync('/app/data').uid, 1000);
  assert.equal(statSync('/app/data').mode & 0o777, 0o700);
  assert.throws(() => admitRailwayDatabase(env), /Database missing/);
  assert.equal(existsSync(env.DATABASE_PATH), false);
  env.DATABASE_MODE = 'create';
  assert.throws(() => admitRailwayDatabase(env), /strong MASTER_BOOTSTRAP_KEY/);
  env.MASTER_BOOTSTRAP_KEY = 'qa-only-placeholder-bootstrap-32-characters';
  admitRailwayDatabase(env);
  assert.equal(statSync('/app/data/.pixel-class-volume.json').mode & 0o777, 0o600);
  assert.throws(() => admitRailwayDatabase(env), /Database missing/);
  const db = new DatabaseSync(env.DATABASE_PATH);
  for (const table of ['users', 'sessions', 'records', 'invitations'])
    db.exec(`CREATE TABLE ${table}(id TEXT)`);
  db.exec("INSERT INTO users VALUES ('preserve-this-qa-row')");
  db.close();
  const before = readFileSync(env.DATABASE_PATH);
  admitRailwayDatabase(env);
  assert.deepEqual(readFileSync(env.DATABASE_PATH), before);
  writeFileSync('/app/data/corrupt.sqlite', 'not a database, never overwrite'.repeat(5));
  const corrupt = readFileSync('/app/data/corrupt.sqlite');
  assert.throws(() =>
    admitRailwayDatabase({
      ...env,
      DATABASE_PATH: '/app/data/corrupt.sqlite',
      DATABASE_MODE: 'existing',
    }),
  );
  assert.deepEqual(readFileSync('/app/data/corrupt.sqlite'), corrupt);
  symlinkSync('/tmp/qa-victim', '/app/data/link.sqlite');
  assert.throws(
    () => admitRailwayDatabase({ ...env, DATABASE_PATH: '/app/data/link.sqlite' }),
    /regular/,
  );
  writeFileSync('/tmp/qa-victim', 'unchanged');
  symlinkSync('/tmp/qa-victim', `${env.DATABASE_PATH}-wal`);
  assert.throws(() => admitRailwayDatabase(env), /regular/);
  assert.equal(readFileSync('/tmp/qa-victim', 'utf8'), 'unchanged');
  unlinkSync(`${env.DATABASE_PATH}-wal`);
  console.log(
    'Railway guards: root refusal, ownership, existing DB, bootstrap, interrupted initialization, retained bytes, corruption and symlink protection passed.',
  );
}
