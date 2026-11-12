import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, statSync, symlinkSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import {
  verifySnapshot,
  verifyStoredSnapshot,
  saveSnapshotProof,
  snapshotStatus,
} from '../server/backup-integrity.js';
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-integrity-')),
    file = join(dir, 'snapshot.sqlite');
  const db = new DatabaseSync(file);
  db.exec(
    "CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE sessions(id TEXT); CREATE TABLE records(body TEXT); CREATE TABLE invitations(id TEXT); CREATE TABLE ai_usage(id TEXT); INSERT INTO records VALUES('original');",
  );
  db.close();
  return { dir, file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
test('snapshot proof records integrity, checksum, stale age and same-volume limits', async () => {
  const f = fixture();
  try {
    assert.equal(snapshotStatus(f.file).state, 'unverified');
    const proof = await verifySnapshot(f.file);
    saveSnapshotProof(f.file, proof);
    const status = snapshotStatus(f.file);
    assert.equal(status.state, 'verified');
    assert.match(status.sha256!, /^[a-f0-9]{64}$/);
    assert.equal(status.externallyStored, false);
    assert.equal(
      snapshotStatus(f.file, Date.parse(proof.verifiedAt) + 13 * 3600000).state,
      'stale',
    );
    assert.equal(statSync(f.file + '.json').mode & 0o777, 0o600);
  } finally {
    f.cleanup();
  }
});
test('valid SQLite changes cannot silently replace the previously verified checksum', async () => {
  const f = fixture();
  try {
    const proof = await verifySnapshot(f.file);
    saveSnapshotProof(f.file, proof);
    const old = statSync(f.file);
    const db = new DatabaseSync(f.file);
    db.exec("UPDATE records SET body='modified'");
    db.close();
    utimesSync(f.file, old.atime, old.mtime);
    await assert.rejects(verifyStoredSnapshot(f.file), /checksum changed/);
    assert.equal(snapshotStatus(f.file).state, 'unverified');
    await assert.rejects(verifyStoredSnapshot(f.file), /checksum changed/);
  } finally {
    f.cleanup();
  }
});
test('missing, malformed proof and corrupt snapshots never claim verified integrity', async () => {
  const f = fixture();
  try {
    assert.equal(snapshotStatus(join(f.dir, 'absent')).state, 'missing');
    writeFileSync(f.file + '.json', '{}');
    assert.equal(snapshotStatus(f.file).state, 'unverified');
    writeFileSync(f.file, 'not a SQLite database');
    await assert.rejects(verifySnapshot(f.file));
    assert.equal(snapshotStatus(f.file).state, 'unverified');
  } finally {
    f.cleanup();
  }
});
test('snapshot verification refuses symlinks and incomplete schemas', async () => {
  const f = fixture();
  try {
    const link = join(f.dir, 'link.sqlite');
    symlinkSync(f.file, link);
    await assert.rejects(verifySnapshot(link));
    assert.equal(snapshotStatus(link).state, 'unverified');
    const db = new DatabaseSync(f.file);
    db.exec('DROP TABLE sessions');
    db.close();
    await assert.rejects(verifySnapshot(f.file), /schema/);
  } finally {
    f.cleanup();
  }
});
test('rechecking an old backup does not reset the age of its contents', async () => {
  const f = fixture();
  try {
    const old = new Date(Date.now() - 13 * 3600000);
    utimesSync(f.file, old, old);
    const proof = await verifySnapshot(f.file);
    saveSnapshotProof(f.file, proof);
    assert.equal(snapshotStatus(f.file).state, 'stale');
    await verifyStoredSnapshot(f.file);
    assert.equal(snapshotStatus(f.file).state, 'stale');
  } finally {
    f.cleanup();
  }
});
test('committed WAL content cannot be verified against the unchanged main-file checksum', async () => {
  const f = fixture();
  let writer: DatabaseSync | undefined;
  try {
    const setup = new DatabaseSync(f.file);
    setup.exec('PRAGMA journal_mode=WAL; PRAGMA wal_checkpoint(TRUNCATE)');
    setup.close();
    const proof = await verifySnapshot(f.file);
    saveSnapshotProof(f.file, proof);
    writer = new DatabaseSync(f.file);
    writer.exec("UPDATE records SET body='changed-in-wal'");
    await assert.rejects(verifyStoredSnapshot(f.file));
    assert.equal(snapshotStatus(f.file).state, 'unverified');
    const result = spawnSync(
      process.execPath,
      ['scripts/database.mjs', 'verify', f.file, '--sha256', proof.sha256],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 1);
    assert.equal(writer.prepare('SELECT body FROM records').get()!.body, 'changed-in-wal');
  } finally {
    writer?.close();
    f.cleanup();
  }
});
test('a nonempty rollback journal prevents standalone snapshot verification', async () => {
  const f = fixture();
  try {
    const proof = await verifySnapshot(f.file);
    saveSnapshotProof(f.file, proof);
    writeFileSync(f.file + '-journal', 'pending rollback journal');
    assert.equal(snapshotStatus(f.file).state, 'unverified');
    await assert.rejects(verifySnapshot(f.file));
  } finally {
    f.cleanup();
  }
});
