import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaultAppearance, emptyProject } from '../shared/types.js';

test('v03 SQLite upgrade preserves sessions and private bytes while backfilling school usage exactly once', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-v03-upgrade-')),
    file = join(dir, 'school.sqlite');
  const token = randomBytes(32).toString('hex'),
    school = 'pixel-school',
    day = new Date().toISOString().slice(0, 10);
  const body = JSON.stringify({
    ...emptyProject(),
    id: 'legacy-project',
    schoolId: school,
    ownerId: 'legacy-student',
    title: '이전 버전의 비공개 프로젝트',
    tasks: [],
    updates: [],
    questions: [],
    feedback: [],
    aiMessages: [],
    approved: false,
    isPublic: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attachments: [
      {
        id: 'legacy-file',
        fileName: 'private.txt',
        mime: 'text/plain',
        size: 14,
        createdAt: new Date().toISOString(),
      },
    ],
  });
  let db = new DatabaseSync(file);
  db.exec(
    `PRAGMA journal_mode=WAL; CREATE TABLE users(id TEXT PRIMARY KEY,school_id TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,body TEXT NOT NULL); CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL); CREATE TABLE records(id TEXT PRIMARY KEY,school_id TEXT NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL); CREATE TABLE invitations(id TEXT PRIMARY KEY,school_id TEXT NOT NULL,key_hash TEXT UNIQUE NOT NULL,body TEXT NOT NULL); CREATE TABLE ai_usage(user_id TEXT NOT NULL,day TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(user_id,day));`,
  );
  const member = {
    id: 'legacy-student',
    schoolId: school,
    name: '이전 학생',
    role: 'STUDENT',
    status: 'ACTIVE',
    appearance: defaultAppearance,
    help: false,
    workStatus: 'IDLE',
    deskId: null,
  };
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
    member.id,
    school,
    'legacy@example.com',
    `test-salt:${scryptSync('test-password', 'test-salt', 64).toString('hex')}`,
    JSON.stringify(member),
  );
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(
    createHash('sha256').update(token).digest('hex'),
    member.id,
    Date.now() + 86400000,
  );
  db.prepare('INSERT INTO records VALUES(?,?,?,?)').run('legacy-project', school, 'project', body);
  const attachment = JSON.stringify({
    id: 'legacy-file',
    projectId: 'legacy-project',
    fileName: 'private.txt',
    mime: 'text/plain',
    content: Buffer.from('legacy-private').toString('base64'),
    encoded: true,
  });
  db.prepare('INSERT INTO records VALUES(?,?,?,?)').run(
    'legacy-file',
    school,
    'project-attachment',
    attachment,
  );
  db.prepare('INSERT INTO ai_usage VALUES(?,?,?)').run(member.id, day, 4);
  db.close();
  let child: ChildProcess;
  const base = 'http://127.0.0.1:3025';
  const stop = async () => {
    if (child?.exitCode === null) {
      const done = new Promise((r) => child.once('exit', r));
      child.kill();
      await done;
    }
  };
  try {
    for (let iteration = 0; iteration < 2; iteration++) {
      child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DEMO_MODE: 'false',
          HOST: '127.0.0.1',
          PORT: '3025',
          DATABASE_PATH: file,
          OPENAI_API_KEY: '',
          OPENAI_MODEL: '',
          MASTER_BOOTSTRAP_KEY: '',
        },
        stdio: 'pipe',
      });
      let ready = false;
      for (let i = 0; i < 80; i++) {
        try {
          if ((await fetch(base + '/api/health')).ok) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.ok(ready);
      const response = await fetch(base + '/api/state', {
        headers: { Cookie: `pixel_session=${token}` },
      });
      assert.equal(response.status, 200);
      const state = await response.json();
      assert.equal(state.me.id, member.id);
      assert.equal(state.projects[0].title, '이전 버전의 비공개 프로젝트');
      const fileResponse = await fetch(
        base + '/api/projects/legacy-project/attachments/legacy-file',
        { headers: { Cookie: `pixel_session=${token}` } },
      );
      assert.equal(fileResponse.status, 200);
      assert.equal(await fileResponse.text(), 'legacy-private');
      db = new DatabaseSync(file, { readOnly: true });
      try {
        assert.equal(
          db.prepare("SELECT body FROM records WHERE id='legacy-project'").get()!.body,
          body,
        );
        assert.equal(
          db.prepare("SELECT body FROM records WHERE id='legacy-file'").get()!.body,
          attachment,
        );
        assert.equal(db.prepare('SELECT count FROM ai_usage').get()!.count, 4 + iteration);
        assert.equal(db.prepare('SELECT count FROM ai_school_usage').get()!.count, 4 + iteration);
      } finally {
        db.close();
      }
      await stop();
      if (iteration === 0) {
        // Simulate a short rollback to v03, whose provider calls know only ai_usage.
        const oldWriter = new DatabaseSync(file);
        try {
          oldWriter.exec('UPDATE ai_usage SET count=5');
        } finally {
          oldWriter.close();
        }
      }
    }
  } finally {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
