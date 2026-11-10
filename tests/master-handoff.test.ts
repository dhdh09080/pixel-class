import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, createHash } from 'node:crypto';
import { mkdtempSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { handoffMaster } from '../scripts/master-handoff.mjs';
import { defaultAppearance, emptyProject } from '../shared/types.js';

const secret = 'private-gate-test-only-32-characters';
const password = 'new-owner-password-for-unit-tests';
const hash = (value: string) => {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(value, salt, 64).toString('hex');
};
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'pixel-handoff-'));
  const file = join(directory, 'school.sqlite');
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,school_id TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,body TEXT NOT NULL);
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires_at INTEGER);
    CREATE TABLE records(id TEXT PRIMARY KEY,school_id TEXT NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL);
    CREATE TABLE invitations(id TEXT PRIMARY KEY,school_id TEXT,key_hash TEXT,body TEXT);
    CREATE TABLE ai_usage(user_id TEXT,day TEXT,count INTEGER,PRIMARY KEY(user_id,day));`);
  for (const [id, role, email] of [
    ['owner', 'MASTER', 'old-owner@example.com'],
    ['student', 'STUDENT', 'student@example.com'],
  ]) {
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
      id,
      'school',
      email,
      hash('old-test-password'),
      JSON.stringify({
        id,
        schoolId: 'school',
        role,
        name: id,
        status: 'ACTIVE',
        appearance: defaultAppearance,
        deskId: null,
        help: false,
        workStatus: 'IDLE',
      }),
    );
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(
      createHash('sha256')
        .update(id + '-session')
        .digest('hex'),
      id,
      Date.now() + 100000,
    );
  }
  db.prepare('INSERT INTO records VALUES(?,?,?,?)').run(
    'project',
    'school',
    'project',
    JSON.stringify({
      ...emptyProject(),
      questions: [],
      tasks: [],
      updates: [],
      feedback: [],
      aiMessages: [],
      id: 'project',
      schoolId: 'school',
      ownerId: 'student',
      title: '기존 학생 프로젝트',
    }),
  );
  const originalOwner = db.prepare("SELECT * FROM users WHERE id='owner'").get()!;
  db.close();
  const input = {
    operationId: randomUUID(),
    email: 'new-owner@example.com',
    passwordHash: hash(password),
    expectedAccessDigest: createHash('sha256').update(secret).digest('hex'),
  };
  return {
    directory,
    file,
    input,
    originalOwner,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test('offline owner handoff preserves school data, verifies a backup and enables normal account login', async () => {
  const f = fixture();
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const result = await handoffMaster(f.file, f.input, secret);
    assert.deepEqual(result, {
      ok: true,
      applied: true,
      alreadyApplied: false,
      backupVerified: true,
      accessMatchesExpected: true,
    });
    assert.ok(!JSON.stringify(result).includes(f.input.email));
    assert.ok(!JSON.stringify(result).includes(secret));
    const db = new DatabaseSync(f.file);
    assert.equal(
      db.prepare("SELECT body FROM users WHERE id='owner'").get()!.body,
      f.originalOwner.body,
    );
    assert.equal(
      db.prepare("SELECT body FROM records WHERE id='project'").get()!.body,
      JSON.stringify({
        ...emptyProject(),
        questions: [],
        tasks: [],
        updates: [],
        feedback: [],
        aiMessages: [],
        id: 'project',
        schoolId: 'school',
        ownerId: 'student',
        title: '기존 학생 프로젝트',
      }),
    );
    assert.deepEqual(
      db
        .prepare('SELECT user_id FROM sessions')
        .all()
        .map((r) => r.user_id),
      ['student'],
    );
    db.close();
    const backup = new DatabaseSync(
      join(f.directory, 'backups', 'before-owner-' + f.input.operationId + '.sqlite'),
      { readOnly: true },
    );
    assert.equal(
      backup.prepare("SELECT email FROM users WHERE id='owner'").get()!.email,
      f.originalOwner.email,
    );
    assert.equal(backup.prepare('PRAGMA quick_check').get()!.quick_check, 'ok');
    backup.close();

    const base = 'http://127.0.0.1:3037';
    child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      env: {
        ...process.env,
        PORT: '3037',
        HOST: '127.0.0.1',
        NODE_ENV: 'test',
        DEMO_MODE: 'false',
        DATABASE_PATH: f.file,
        AUTO_BACKUP: 'false',
      },
      stdio: 'ignore',
    });
    let ready = false;
    for (let i = 0; i < 70; i++) {
      try {
        if ((await fetch(base + '/api/health')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, 'isolated owner-handoff regression server must become healthy');
    const login = (email: string, raw: string) =>
      fetch(base + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Pixel-Class': '1', Origin: base },
        body: JSON.stringify({ email, password: raw }),
      });
    assert.equal((await login('old-owner@example.com', 'old-test-password')).status, 401);
    assert.equal((await login(f.input.email, 'old-test-password')).status, 401);
    const signed = await login(f.input.email, password);
    assert.equal(signed.status, 200);
    const cookie = signed.headers.get('set-cookie')!.split(';')[0];
    const stateResponse = await fetch(base + '/api/state', { headers: { Cookie: cookie } });
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json();
    assert.equal(state.me.id, 'owner');
    assert.equal(state.me.role, 'MASTER');
    assert.equal(state.me.schoolId, 'school');
    assert.equal(
      (await fetch(base + '/api/state', { headers: { Cookie: 'pixel_session=student-session' } }))
        .status,
      200,
    );
    assert.equal(
      (await fetch(base + '/api/state', { headers: { Cookie: 'pixel_session=owner-session' } }))
        .status,
      401,
    );
  } finally {
    if (child && child.exitCode === null) {
      const stopped = once(child, 'exit');
      child.kill('SIGTERM');
      await stopped;
    }
    f.cleanup();
  }
});

test('handoff replay never resets a later password or repeats a backup and altered intent is refused', async () => {
  const f = fixture();
  try {
    await handoffMaster(f.file, f.input, secret);
    const db = new DatabaseSync(f.file);
    const changedPassword = hash('changed-by-owner-later');
    db.prepare("UPDATE users SET password=? WHERE id='owner'").run(changedPassword);
    db.close();
    assert.deepEqual(await handoffMaster(f.file, f.input, 'wrong-secret'), {
      ok: true,
      applied: false,
      alreadyApplied: true,
      accessMatchesExpected: false,
    });
    await assert.rejects(
      handoffMaster(f.file, { ...f.input, email: 'different@example.com' }, secret),
      /HANDOFF_OPERATION_REUSED/,
    );
    const check = new DatabaseSync(f.file);
    assert.equal(
      check.prepare("SELECT password FROM users WHERE id='owner'").get()!.password,
      changedPassword,
    );
    check.close();
  } finally {
    f.cleanup();
  }
});

test('handoff refuses student email collisions, ambiguous masters and inactive owners without changing data', async () => {
  const f = fixture();
  try {
    await assert.rejects(
      handoffMaster(f.file, { ...f.input, email: 'student@example.com' }, secret),
      /HANDOFF_EMAIL_ALREADY_USED/,
    );
    const db = new DatabaseSync(f.file);
    db.exec("UPDATE users SET body=json_set(body,'$.role','MASTER') WHERE id='student'");
    await assert.rejects(
      handoffMaster(f.file, f.input, secret),
      /HANDOFF_REQUIRES_EXACTLY_ONE_MASTER/,
    );
    db.exec(
      "UPDATE users SET body=json_set(body,'$.role','STUDENT') WHERE id='student'; UPDATE users SET body=json_set(body,'$.status','REVOKED') WHERE id='owner'",
    );
    await assert.rejects(handoffMaster(f.file, f.input, secret), /HANDOFF_MASTER_NOT_ACTIVE/);
    assert.equal(
      db.prepare("SELECT password FROM users WHERE id='owner'").get()!.password,
      f.originalOwner.password,
    );
    assert.equal(existsSync(join(f.directory, 'backups')), false);
    db.close();
  } finally {
    f.cleanup();
  }
});

test('handoff refuses missing databases, linked files, invalid verifiers and an existing backup destination', async () => {
  const f = fixture();
  try {
    const missing = join(f.directory, 'missing.sqlite');
    await assert.rejects(handoffMaster(missing, f.input, secret));
    assert.equal(existsSync(missing), false);
    const link = join(f.directory, 'linked.sqlite');
    symlinkSync(f.file, link);
    await assert.rejects(handoffMaster(link, f.input, secret), /UNSAFE_DATABASE_FILE/);
    await assert.rejects(
      handoffMaster(f.file, { ...f.input, passwordHash: password }, secret),
      /INVALID_HANDOFF_INPUT/,
    );
    await assert.rejects(
      handoffMaster(f.file, { ...f.input, operationId: '../unsafe' }, secret),
      /INVALID_HANDOFF_INPUT/,
    );
    const result = await handoffMaster(f.file, f.input, secret);
    assert.equal(result.backupVerified, true);
    const db = new DatabaseSync(f.file);
    db.prepare("DELETE FROM records WHERE kind='owner-handoff'").run();
    db.close();
    await assert.rejects(handoffMaster(f.file, f.input, secret), /Destination exists/);
  } finally {
    f.cleanup();
  }
});
