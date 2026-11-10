import { DatabaseSync } from 'node:sqlite';
import { createHash, timingSafeEqual } from 'node:crypto';
import { lstatSync, realpathSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { copyDatabase, verifyDatabase } from './database.mjs';
import {
  isRailway,
  prepareVolumePermissions,
  admitRailwayDatabase,
} from '../server/railway-volume.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
function existingDatabase(file) {
  const path = resolve(file);
  if (realpathSync(dirname(path)) !== dirname(path)) throw Error('UNSAFE_DATABASE_PATH');
  for (const suffix of ['', '-wal', '-shm']) {
    if (suffix && !existsSync(path + suffix)) continue;
    const stat = lstatSync(path + suffix);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
      throw Error('UNSAFE_DATABASE_FILE');
  }
  verifyDatabase(path);
  return path;
}
function validate(input) {
  if (
    !input ||
    typeof input.operationId !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.operationId) ||
    typeof input.email !== 'string' ||
    input.email !== input.email.trim().toLowerCase() ||
    input.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
    !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(input.passwordHash || '') ||
    !/^[a-f0-9]{64}$/.test(input.expectedAccessDigest || '')
  )
    throw Error('INVALID_HANDOFF_INPUT');
}

/** Offline, platform-admin-only recovery. Never registered as an HTTP route. */
export async function handoffMaster(database, input, accessSecret) {
  validate(input);
  const file = existingDatabase(database);
  const db = new DatabaseSync(file);
  const recordId = 'owner-handoff-' + input.operationId;
  const intent = digest(input.email + '\n' + input.passwordHash);
  const accessMatchesExpected =
    typeof accessSecret === 'string' &&
    timingSafeEqual(Buffer.from(digest(accessSecret)), Buffer.from(input.expectedAccessDigest));
  try {
    const done = db
      .prepare("SELECT body FROM records WHERE id=? AND kind='owner-handoff'")
      .get(recordId);
    if (done) {
      if (JSON.parse(done.body).intent !== intent) throw Error('HANDOFF_OPERATION_REUSED');
      return { ok: true, applied: false, alreadyApplied: true, accessMatchesExpected };
    }
    const masters = db
      .prepare(
        "SELECT id,school_id,email,password,body FROM users WHERE json_extract(body,'$.role')='MASTER'",
      )
      .all();
    if (masters.length !== 1) throw Error('HANDOFF_REQUIRES_EXACTLY_ONE_MASTER');
    const owner = masters[0];
    const member = JSON.parse(owner.body);
    if (member.id !== owner.id || member.schoolId !== owner.school_id || member.status !== 'ACTIVE')
      throw Error('HANDOFF_MASTER_NOT_ACTIVE');
    const occupied = db
      .prepare('SELECT id FROM users WHERE lower(email)=? AND id<>?')
      .get(input.email, owner.id);
    if (occupied) throw Error('HANDOFF_EMAIL_ALREADY_USED');
    const backupDirectory = join(dirname(file), 'backups');
    if (
      existsSync(backupDirectory) &&
      (!lstatSync(backupDirectory).isDirectory() || lstatSync(backupDirectory).isSymbolicLink())
    )
      throw Error('UNSAFE_BACKUP_DIRECTORY');
    const backupFile = join(backupDirectory, 'before-owner-' + input.operationId + '.sqlite');
    // A verified online snapshot is required before touching the existing owner.
    await copyDatabase(file, backupFile);
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = db.prepare('SELECT email,password,body FROM users WHERE id=?').get(owner.id);
      if (
        !current ||
        current.email !== owner.email ||
        current.password !== owner.password ||
        current.body !== owner.body
      )
        throw Error('HANDOFF_OWNER_CHANGED');
      const changed = db
        .prepare('UPDATE users SET email=?,password=? WHERE id=? AND school_id=?')
        .run(input.email, input.passwordHash, owner.id, owner.school_id);
      if (changed.changes !== 1) throw Error('HANDOFF_UPDATE_FAILED');
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(owner.id);
      db.prepare(
        "DELETE FROM records WHERE school_id=? AND kind='password-recovery' AND json_extract(body,'$.userId')=?",
      ).run(owner.school_id, owner.id);
      db.prepare('INSERT INTO records(id,school_id,kind,body) VALUES(?,?,?,?)').run(
        recordId,
        owner.school_id,
        'owner-handoff',
        JSON.stringify({
          id: recordId,
          intent,
          userId: owner.id,
          completedAt: new Date().toISOString(),
        }),
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return {
      ok: true,
      applied: true,
      alreadyApplied: false,
      backupVerified: true,
      accessMatchesExpected,
    };
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // Arguments contain only a salted verifier, email and operation id, never a password.
  // Replaying a successful operation does not reset a password the owner later changes.
  let result;
  try {
    if (!isRailway(process.env)) throw Error('HANDOFF_REQUIRES_RAILWAY_ADMIN_RUNTIME');
    process.umask(0o077);
    prepareVolumePermissions(process.env);
    if (process.getuid() === 0) {
      process.setgroups([]);
      process.setgid(1000);
      process.setuid(1000);
    }
    admitRailwayDatabase({ ...process.env, DATABASE_MODE: 'existing' });
    const input = JSON.parse(Buffer.from(process.argv[2] || '', 'base64url').toString('utf8'));
    result = await handoffMaster(process.env.DATABASE_PATH, input, process.env.STAGING_ACCESS_KEY);
  } catch (error) {
    // Never log inputs, credential verifiers, email addresses, or exception text.
    const safeCodes = new Set([
      'HANDOFF_REQUIRES_EXACTLY_ONE_MASTER',
      'HANDOFF_MASTER_NOT_ACTIVE',
      'HANDOFF_EMAIL_ALREADY_USED',
      'HANDOFF_OWNER_CHANGED',
      'HANDOFF_OPERATION_REUSED',
    ]);
    result = {
      ok: false,
      applied: false,
      code: safeCodes.has(error.message) ? error.message : 'OWNER_HANDOFF_NOT_APPLIED',
    };
  }
  console.log('PIXEL_OWNER_HANDOFF ' + JSON.stringify(result));
  // Keep the original school online even when recovery is refused; never initialize it.
  process.execve(process.execPath, [process.execPath, 'scripts/start.mjs'], process.env);
}
