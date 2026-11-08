import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error Standalone Node CLI is intentionally usable without tsx.
import { copyDatabase, verifyDatabase } from '../scripts/database.mjs';

test('online backup includes WAL records and restore preserves content while invalidating sessions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-backup-'));
  const source = join(dir, 'source.sqlite'),
    snapshot = join(dir, 'snapshot.sqlite'),
    restored = join(dir, 'restored.sqlite');
  const db = new DatabaseSync(source);
  try {
    db.exec(
      `PRAGMA journal_mode=WAL; CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id)); CREATE TABLE records(id TEXT PRIMARY KEY,body TEXT); CREATE TABLE invitations(id TEXT PRIMARY KEY); CREATE TABLE ai_usage(id TEXT PRIMARY KEY); INSERT INTO users VALUES('test-student'); INSERT INTO sessions VALUES('hashed-test-session','test-student'); INSERT INTO records VALUES('project','private-content'); INSERT INTO ai_usage VALUES('retained-daily-limit');`,
    );
    assert.equal((await copyDatabase(source, snapshot)).records, 1);
    await assert.rejects(copyDatabase(source, snapshot));
    db.exec(`INSERT INTO records VALUES('later-write','excluded-from-snapshot');`);
    assert.equal(verifyDatabase(snapshot).records, 1);
    const counts = await copyDatabase(snapshot, restored, { invalidateSessions: true });
    assert.equal(counts.records, 1);
    assert.equal(counts.users, 1);
    assert.equal(counts.sessions, 0);
    assert.equal(counts.ai_usage, 1);
    assert.equal(statSync(snapshot).mode & 0o777, 0o600);
    assert.equal(statSync(restored).mode & 0o777, 0o600);
  } finally {
    db.close();
    rmSync(dir, { force: true, recursive: true });
  }
});
test('backup and restore reject overwrite, same-path targets and invalid database schemas', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-backup-reject-'));
  const file = join(dir, 'invalid.sqlite');
  const db = new DatabaseSync(file);
  db.close();
  try {
    await assert.rejects(copyDatabase(file, file));
    await assert.rejects(copyDatabase(file, join(dir, 'new.sqlite')));
    assert.throws(() => verifyDatabase(file));
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test('v04 school-wide AI quota survives snapshot and session-invalidating restore', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-v04-quota-backup-'));
  const source = join(dir, 'school.sqlite'),
    destination = join(dir, 'restored.sqlite');
  const db = new DatabaseSync(source);
  try {
    db.exec(
      `CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE sessions(id TEXT PRIMARY KEY); CREATE TABLE records(id TEXT PRIMARY KEY); CREATE TABLE invitations(id TEXT PRIMARY KEY); CREATE TABLE ai_usage(id TEXT PRIMARY KEY); CREATE TABLE ai_school_usage(school_id TEXT,day TEXT,count INTEGER,PRIMARY KEY(school_id,day)); INSERT INTO ai_school_usage VALUES('school','2026-11-08',2);`,
    );
    const result = await copyDatabase(source, destination, { invalidateSessions: true });
    assert.equal(result.ai_school_usage, 1);
    const restored = new DatabaseSync(destination, { readOnly: true });
    try {
      assert.equal(restored.prepare('SELECT count FROM ai_school_usage').get()!.count, 2);
    } finally {
      restored.close();
    }
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
