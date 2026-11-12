import { backup, DatabaseSync } from 'node:sqlite';
import {
  mkdirSync,
  chmodSync,
  statSync,
  statfsSync,
  renameSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { db, get } from './db.js';
import {
  snapshotStatus,
  verifySnapshot,
  saveSnapshotProof,
  snapshotChecksum,
  verifyStoredSnapshot,
} from './backup-integrity.js';
import { aiLimits } from './ai-policy.js';
import { isRailway } from './railway-volume.mjs';
import type { OperationsStatus } from '../shared/operations.js';

export class CapacityError extends Error {}
const MiB = 1024 * 1024;
export const uploadBudget = 120 * MiB;
const source = () =>
  process.env.DATABASE_PATH ||
  (process.env.DEMO_MODE === 'false' || process.env.NODE_ENV === 'production'
    ? 'data/school.sqlite'
    : 'data/demo.sqlite');
export function storageStatus(school: string) {
  const row = db
    .prepare(
      "SELECT coalesce(sum(length(CAST(body AS BLOB))),0) AS bytes FROM records WHERE school_id=? AND kind IN ('project-attachment','material','material-version','competition-file')",
    )
    .get(school) as { bytes: number };
  const disk = statfsSync(dirname(source()));
  const file = join(dirname(source()), 'backups', 'latest.sqlite');
  return {
    usedBytes: row.bytes,
    limitBytes: uploadBudget,
    freeBytes: Number(disk.bavail) * Number(disk.bsize),
    backupAt: existsSync(file) ? statSync(file).mtime.toISOString() : null,
  };
}
export function assertUploadCapacity(school: string, encoded: string) {
  const status = storageStatus(school);
  if (status.usedBytes + Buffer.byteLength(encoded) + 2048 > status.limitBytes)
    throw new CapacityError(
      '학교 첨부파일 저장 한도에 도달했어요. 선생님에게 불필요한 자료 정리를 요청해 주세요.',
    );
  if (status.freeBytes < 64 * MiB + Buffer.byteLength(encoded) * 3)
    throw new CapacityError(
      '저장 공간을 보호하기 위해 업로드를 중단했어요. 선생님에게 알려 주세요. 기존 자료는 보존됩니다.',
    );
}
let pending: Promise<string> | undefined;
let lastAttemptAt: string | null = null;
let lastFailure: string | null = null;
const backupFile = () => join(dirname(source()), 'backups', 'latest.sqlite');
const bytes = (file: string) => {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
};
export function operationsStatus(school: string): OperationsStatus {
  const limits = aiLimits(process.env),
    memory = process.memoryUsage();
  const usage = db
    .prepare('SELECT count FROM ai_school_usage WHERE school_id=? AND day=?')
    .get(school, new Date().toISOString().slice(0, 10)) as { count: number } | undefined;
  const last = get<{ fileName: string; sha256: string; preparedAt: string }>(
    'backup-export',
    'last-export:' + school,
    school,
  );
  return {
    ...storageStatus(school),
    observedAt: new Date().toISOString(),
    lastExport: last
      ? { fileName: last.fileName, sha256: last.sha256, preparedAt: last.preparedAt }
      : null,
    backup: { ...snapshotStatus(backupFile()), lastAttemptAt, lastFailure },
    runtime: {
      uptimeSeconds: Math.floor(process.uptime()),
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      databaseBytes: bytes(source()),
      walBytes: bytes(source() + '-wal'),
      database: 'sqlite',
      instances: 1,
    },
    ai: {
      enabled: !isRailway(process.env) || process.env.AI_ENABLED === 'true',
      configured: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL),
      usedToday: usage?.count || 0,
      dailyLimit: limits.schoolDailyCalls,
      maxConcurrent: limits.concurrentCalls,
    },
  };
}
let verifying: Promise<void> | undefined;
export async function verifyLatestBackup() {
  if (pending) await pending;
  if (!verifying)
    verifying = (async () => {
      await verifyStoredSnapshot(backupFile());
    })().finally(() => {
      verifying = undefined;
    });
  await verifying;
}
function hasTable(database: DatabaseSync, table: string) {
  return !!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
}
/** Temporary judge grants are excluded; password verifiers remain for account restoration. */
function redactCompetitionCredentials(database: DatabaseSync) {
  for (const table of ['competition_judge_sessions', 'competition_judge_passes'])
    if (hasTable(database, table)) database.exec(`DELETE FROM ${table}`);
}
export function makeBackup(): Promise<string> {
  if (pending) return pending;
  lastAttemptAt = new Date().toISOString();
  pending = (async () => {
    if (verifying) await verifying;
    const directory = join(dirname(source()), 'backups');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const disk = statfsSync(directory);
    const size =
      Number((db.prepare('PRAGMA page_count').get() as { page_count: number }).page_count) *
      Number((db.prepare('PRAGMA page_size').get() as { page_size: number }).page_size);
    if (Number(disk.bavail) * Number(disk.bsize) < size * 2 + 64 * MiB)
      throw new CapacityError(
        '백업을 만들 여유 공간이 부족해요. 기존 데이터와 이전 백업은 보존했습니다.',
      );
    const temporary = join(directory, randomUUID() + '.sqlite');
    try {
      await backup(db, temporary);
      chmodSync(temporary, 0o600);
      const snapshot = new DatabaseSync(temporary);
      try {
        redactCompetitionCredentials(snapshot);
        snapshot.exec(
          "DELETE FROM sessions; DELETE FROM records WHERE kind='password-recovery'; PRAGMA wal_checkpoint(TRUNCATE); VACUUM;",
        );
        if (
          (snapshot.prepare('PRAGMA quick_check').get() as { quick_check: string }).quick_check !==
          'ok'
        )
          throw new Error('Backup verification failed');
      } finally {
        snapshot.close();
      }
      const proof = await verifySnapshot(temporary);
      const target = join(directory, 'latest.sqlite');
      renameSync(temporary, target);
      saveSnapshotProof(target, proof);
      lastFailure = null;
      return target;
    } finally {
      for (const suffix of ['', '-wal', '-shm']) rmSync(temporary + suffix, { force: true });
    }
  })()
    .catch((error) => {
      lastFailure =
        error instanceof CapacityError
          ? '저장 공간 부족으로 백업을 만들지 못했어요.'
          : '백업을 완료하지 못했어요. 기존 자료를 보존하고 운영 로그를 확인해 주세요.';
      throw error;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}
export function scheduleBackups() {
  if (process.env.NODE_ENV !== 'production' || process.env.AUTO_BACKUP === 'false') return;
  const run = () =>
    void makeBackup().catch(() =>
      console.error('Scheduled school backup failed; previous snapshot retained.'),
    );
  run();
  const timer = setInterval(run, 6 * 60 * 60 * 1000);
  timer.unref();
}

/** Export only the requesting school; VACUUM removes deleted schools from free pages. */
export async function exportSchoolDatabase(school: string) {
  const snapshot = await makeBackup();
  const file = join(dirname(snapshot), 'export-' + randomUUID() + '.sqlite');
  const read = new DatabaseSync(snapshot, { readOnly: true });
  try {
    await backup(read, file);
  } finally {
    read.close();
  }
  chmodSync(file, 0o600);
  const out = new DatabaseSync(file);
  try {
    out.exec('BEGIN IMMEDIATE; DELETE FROM sessions;');
    out
      .prepare('DELETE FROM ai_usage WHERE user_id IN (SELECT id FROM users WHERE school_id!=?)')
      .run(school);
    for (const table of ['records', 'invitations', 'ai_school_usage', 'users'])
      out.prepare(`DELETE FROM ${table} WHERE school_id!=?`).run(school);
    if (hasTable(out, 'competition_scores'))
      out.prepare('DELETE FROM competition_scores WHERE school_id!=?').run(school);
    redactCompetitionCredentials(out);
    out.exec(
      "DELETE FROM records WHERE kind='password-recovery'; COMMIT; PRAGMA wal_checkpoint(TRUNCATE); VACUUM;",
    );
  } catch (e) {
    out.close();
    rmSync(file, { force: true });
    throw e;
  }
  out.close();
  let proof;
  try {
    proof = await snapshotChecksum(file);
  } catch (error) {
    for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true });
    throw error;
  }
  return {
    file,
    sha256: proof.sha256,
    cleanup: () => {
      for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true });
    },
  };
}
