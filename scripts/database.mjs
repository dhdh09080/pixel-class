import { DatabaseSync, backup } from 'node:sqlite';
import { closeSync, openSync, mkdirSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { assertStandaloneSnapshot } from '../shared/snapshot-files.mjs';

export async function databaseChecksum(path) {
  assertStandaloneSnapshot(resolve(path));
  const handle = await open(resolve(path), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new Error('Backup must be a regular file.');
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    const after = await handle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
      throw new Error('Backup changed while checking its checksum.');
    assertStandaloneSnapshot(resolve(path));
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}

function inspect(db) {
  const quick = db.prepare('PRAGMA quick_check').all();
  if (quick.some((row) => row.quick_check !== 'ok')) throw new Error('SQLite quick_check failed.');
  if (db.prepare('PRAGMA foreign_key_check').all().length)
    throw new Error('Foreign key check failed.');
  const counts = {};
  for (const table of ['users', 'sessions', 'records', 'invitations', 'ai_usage'])
    counts[table] = db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count;
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_school_usage'").get())
    counts.ai_school_usage = db
      .prepare('SELECT count(*) AS count FROM ai_school_usage')
      .get().count;
  return counts;
}

export function verifyDatabase(path) {
  const db = new DatabaseSync(resolve(path), { readOnly: true });
  try {
    return inspect(db);
  } finally {
    db.close();
  }
}

/** SQLite's online backup API includes committed WAL data in a consistent snapshot. */
export async function copyDatabase(source, destination, { invalidateSessions = false } = {}) {
  source = resolve(source);
  destination = resolve(destination);
  if (source === destination) throw new Error('Source and destination must differ.');
  if ([destination, `${destination}-wal`, `${destination}-shm`].some(existsSync))
    throw new Error(
      'Destination exists. Restore only to a new path while the application is stopped.',
    );
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(source, { readOnly: true });
  let reserved = false;
  try {
    inspect(db);
    closeSync(openSync(destination, 'wx', 0o600));
    reserved = true;
    await backup(db, destination);
    chmodSync(destination, 0o600);
    if (invalidateSessions) {
      const restored = new DatabaseSync(destination);
      try {
        if (
          restored
            .prepare(
              "SELECT 1 FROM sqlite_master WHERE type='table' AND name='competition_judge_sessions'",
            )
            .get()
        )
          restored.exec('DELETE FROM competition_judge_sessions;');
        if (
          restored
            .prepare(
              "SELECT 1 FROM sqlite_master WHERE type='table' AND name='competition_judge_passes'",
            )
            .get()
        )
          restored.exec('DELETE FROM competition_judge_passes;');
        if (
          restored
            .prepare('PRAGMA table_info(records)')
            .all()
            .some((column) => column.name === 'kind')
        )
          restored.exec("DELETE FROM records WHERE kind='password-recovery';");
        if (
          restored
            .prepare('PRAGMA table_info(invitations)')
            .all()
            .some((column) => column.name === 'body')
        )
          restored.exec("UPDATE invitations SET body=json_set(body,'$.revoked',json('true'));");
        restored.exec(
          'DELETE FROM sessions; PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);',
        );
      } finally {
        restored.close();
      }
    }
    return verifyDatabase(destination);
  } catch (error) {
    if (reserved)
      for (const file of [destination, `${destination}-wal`, `${destination}-shm`])
        rmSync(file, { force: true });
    throw error;
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, source, destination, expectedChecksum] = process.argv.slice(2);
  try {
    if (
      !source ||
      !['backup', 'restore', 'verify'].includes(command) ||
      (command !== 'verify' && (!destination || expectedChecksum !== undefined))
    )
      throw new Error(
        'Usage: node scripts/database.mjs backup|restore SOURCE NEW_DESTINATION, or verify DATABASE',
      );
    if (
      command === 'verify' &&
      destination !== undefined &&
      (destination !== '--sha256' || !/^[a-f0-9]{64}$/i.test(expectedChecksum || ''))
    )
      throw new Error('Usage: verify DATABASE [--sha256 EXPECTED_SHA256]');
    if (command === 'verify') assertStandaloneSnapshot(resolve(source));
    const counts =
      command === 'verify'
        ? verifyDatabase(source)
        : await copyDatabase(source, destination, { invalidateSessions: command === 'restore' });
    const sha256 = command === 'verify' ? await databaseChecksum(source) : undefined;
    if (expectedChecksum && sha256 !== expectedChecksum.toLowerCase())
      throw new Error('Backup SHA-256 does not match. Do not restore this file.');
    console.log(
      JSON.stringify({
        ok: true,
        command,
        counts,
        sha256,
        checksumMatched: expectedChecksum ? true : undefined,
        sessionsInvalidated: command === 'restore',
      }),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
