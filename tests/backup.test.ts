import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error Standalone Node CLI is intentionally usable without tsx.
import { copyDatabase, verifyDatabase, databaseChecksum } from '../scripts/database.mjs';
import { spawnSync } from 'node:child_process';

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
test('restore revokes historical admission KEYs without deleting their audit history or mutating the source', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-admission-restore-'));
  const source = join(dir, 'source.sqlite'),
    snapshot = join(dir, 'snapshot.sqlite'),
    restored = join(dir, 'restored.sqlite');
  const db = new DatabaseSync(source);
  try {
    db.exec(
      `CREATE TABLE users(id TEXT); CREATE TABLE sessions(id TEXT); CREATE TABLE records(id TEXT,kind TEXT,body TEXT); CREATE TABLE invitations(id TEXT,body TEXT); CREATE TABLE ai_usage(id TEXT);`,
    );
    const original = {
      id: 'invite-history',
      label: '입학 기록',
      revoked: false,
      usedAt: null,
      expiresAt: '2099-01-01T00:00:00Z',
    };
    db.prepare('INSERT INTO invitations VALUES(?,?)').run(original.id, JSON.stringify(original));
    await copyDatabase(source, snapshot);
    db.prepare('UPDATE invitations SET body=?').run(
      JSON.stringify({ ...original, usedAt: '2026-11-12T00:00:00Z' }),
    );
    await copyDatabase(snapshot, restored, { invalidateSessions: true });
    const read = new DatabaseSync(restored, { readOnly: true });
    try {
      const invitation = JSON.parse(
        String(read.prepare('SELECT body FROM invitations').get()!.body),
      );
      assert.equal(invitation.revoked, true);
      assert.equal(invitation.label, original.label);
      assert.equal(
        JSON.parse(String(db.prepare('SELECT body FROM invitations').get()!.body)).usedAt,
        '2026-11-12T00:00:00Z',
      );
      assert.equal(verifyDatabase(snapshot).invitations, 1);
    } finally {
      read.close();
    }
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
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
test('offline verification checks an expected SHA-256 without changing backup bytes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-checksum-cli-')),
    file = join(dir, 'backup.sqlite');
  const db = new DatabaseSync(file);
  db.exec(
    'CREATE TABLE users(id TEXT); CREATE TABLE sessions(id TEXT); CREATE TABLE records(id TEXT); CREATE TABLE invitations(id TEXT); CREATE TABLE ai_usage(id TEXT)',
  );
  db.close();
  try {
    const checksum = await databaseChecksum(file);
    const result = spawnSync(
      process.execPath,
      ['scripts/database.mjs', 'verify', file, '--sha256', checksum],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).checksumMatched, true);
    const mismatch = spawnSync(
      process.execPath,
      ['scripts/database.mjs', 'verify', file, '--sha256', '0'.repeat(64)],
      { encoding: 'utf8' },
    );
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /does not match/);
    assert.equal(await databaseChecksum(file), checksum);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('restoring an older CLI backup cannot resurrect a consumed password recovery grant', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-recovery-rollback-')),
    source = join(dir, 'source.sqlite'),
    snapshot = join(dir, 'old.sqlite'),
    restored = join(dir, 'restored.sqlite');
  const db = new DatabaseSync(source);
  try {
    db.exec(
      "CREATE TABLE users(id TEXT); CREATE TABLE sessions(id TEXT); CREATE TABLE records(id TEXT,kind TEXT,body TEXT); CREATE TABLE invitations(id TEXT); CREATE TABLE ai_usage(id TEXT); INSERT INTO users VALUES('preserved-user'); INSERT INTO records VALUES('project','project','preserved-content'); INSERT INTO records VALUES('old-grant','password-recovery','PRIVATE-RECOVERY-GRANT-CANARY');",
    );
    await copyDatabase(source, snapshot);
    db.exec("DELETE FROM records WHERE kind='password-recovery'");
    await copyDatabase(snapshot, restored, { invalidateSessions: true });
    const target = new DatabaseSync(restored, { readOnly: true }),
      old = new DatabaseSync(snapshot, { readOnly: true });
    try {
      assert.equal(
        target.prepare("SELECT count(*) n FROM records WHERE kind='password-recovery'").get()!.n,
        0,
      );
      assert.equal(
        old.prepare("SELECT count(*) n FROM records WHERE kind='password-recovery'").get()!.n,
        1,
      );
      assert.equal(
        target.prepare("SELECT body FROM records WHERE kind='project'").get()!.body,
        'preserved-content',
      );
    } finally {
      target.close();
      old.close();
    }
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
