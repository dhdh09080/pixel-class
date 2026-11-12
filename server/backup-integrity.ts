import { constants, lstatSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { BackupInfo } from '../shared/operations.js';
import { assertStandaloneSnapshot } from '../shared/snapshot-files.mjs';

export type SnapshotProof = {
  sha256: string;
  sizeBytes: number;
  mtimeMs: number;
  verifiedAt: string;
  invalidatedAt?: string;
};
function storedProof(file: string): SnapshotProof {
  const meta = lstatSync(file + '.json');
  if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 4096)
    throw Error('Invalid snapshot proof');
  return JSON.parse(readFileSync(file + '.json', 'utf8')) as SnapshotProof;
}
const unchanged = (a: { size: number; mtimeMs: number; ino: number }, b: typeof a) =>
  a.size === b.size && a.mtimeMs === b.mtimeMs && a.ino === b.ino;

/** Stream instead of loading a school's complete database into process memory. */
export async function snapshotChecksum(file: string) {
  assertStandaloneSnapshot(file);
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw Error('Snapshot must be a regular file');
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    if (!unchanged(before, await handle.stat()) || !unchanged(before, lstatSync(file)))
      throw Error('Snapshot changed during verification');
    assertStandaloneSnapshot(file);
    return { sha256: hash.digest('hex'), sizeBytes: before.size, mtimeMs: before.mtimeMs };
  } finally {
    await handle.close();
  }
}
export async function verifySnapshot(file: string): Promise<SnapshotProof> {
  assertStandaloneSnapshot(file);
  const before = lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink()) throw Error('Snapshot must be a regular file');
  const database = new DatabaseSync(file, { readOnly: true });
  try {
    if (
      database
        .prepare('PRAGMA quick_check')
        .all()
        .some((r) => r.quick_check !== 'ok')
    )
      throw Error('Snapshot integrity check failed');
    if (database.prepare('PRAGMA foreign_key_check').all().length)
      throw Error('Snapshot foreign key check failed');
    for (const name of ['users', 'sessions', 'records', 'invitations', 'ai_usage'])
      if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
        throw Error('Snapshot schema is incomplete');
  } finally {
    database.close();
  }
  const proof = await snapshotChecksum(file);
  assertStandaloneSnapshot(file);
  if (!unchanged(before, lstatSync(file))) throw Error('Snapshot changed during verification');
  return { ...proof, verifiedAt: new Date().toISOString() };
}
export function saveSnapshotProof(file: string, proof: SnapshotProof) {
  const temporary = file + '.' + randomUUID() + '.json';
  try {
    writeFileSync(temporary, JSON.stringify(proof), { mode: 0o600, flag: 'wx' });
    renameSync(temporary, file + '.json');
  } finally {
    rmSync(temporary, { force: true });
  }
}
export async function verifyStoredSnapshot(file: string) {
  let previous: SnapshotProof | undefined;
  try {
    const value = storedProof(file);
    if (/^[a-f0-9]{64}$/.test(value.sha256)) previous = value;
  } catch {
    /* Legacy snapshots can be verified explicitly for the first time. */
  }
  try {
    const proof = await verifySnapshot(file);
    if (previous && previous.sha256 !== proof.sha256) throw Error('Snapshot checksum changed');
    saveSnapshotProof(file, proof);
    return proof;
  } catch (error) {
    if (previous) saveSnapshotProof(file, { ...previous, invalidatedAt: new Date().toISOString() });
    throw error;
  }
}
/** A status read never claims that a backup has been copied off this volume. */
export function snapshotStatus(file: string, now = Date.now()): BackupInfo {
  const base: BackupInfo = {
    state: 'missing',
    sizeBytes: 0,
    sha256: null,
    verifiedAt: null,
    lastAttemptAt: null,
    lastFailure: null,
    storageLocation: 'same-volume',
    externallyStored: false,
  };
  let stat;
  try {
    stat = lstatSync(file);
  } catch {
    return base;
  }
  base.state = 'unverified';
  try {
    assertStandaloneSnapshot(file);
  } catch {
    return base;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) return base;
  base.sizeBytes = stat.size;
  try {
    const proof = storedProof(file);
    const time = Date.parse(proof.verifiedAt);
    if (
      proof.invalidatedAt ||
      !/^[a-f0-9]{64}$/.test(proof.sha256) ||
      proof.sizeBytes !== stat.size ||
      proof.mtimeMs !== stat.mtimeMs ||
      !Number.isFinite(time) ||
      time > now + 60000
    )
      return base;
    return {
      ...base,
      state: now - Math.min(time, stat.mtimeMs) > 12 * 3600000 ? 'stale' : 'verified',
      sha256: proof.sha256,
      verifiedAt: proof.verifiedAt,
    };
  } catch {
    return base;
  }
}
