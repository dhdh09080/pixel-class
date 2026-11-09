import {
  readFileSync,
  lstatSync,
  readdirSync,
  chownSync,
  chmodSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export const isRailway = (env) => env.PIXEL_RUNTIME === 'railway' || !!env.RAILWAY_PROJECT_ID;
export function hasMount(info, target) {
  return info
    .split('\n')
    .some(
      (line) =>
        line
          .split(' ')[4]
          ?.replace(/\\([0-7]{3})/g, (_, n) => String.fromCharCode(parseInt(n, 8))) === target,
    );
}
function regular(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.nlink !== 1)
      throw Error('Railway storage must contain regular, unlinked files.');
    return stat;
  } catch (e) {
    if (e.code === 'ENOENT') return undefined;
    throw e;
  }
}
function paths(env) {
  const mount = '/app/data';
  if (
    !env.RAILWAY_VOLUME_NAME ||
    env.RAILWAY_VOLUME_MOUNT_PATH !== mount ||
    !hasMount(readFileSync('/proc/self/mountinfo', 'utf8'), mount)
  )
    throw Error('Railway requires a real persistent volume mounted at /app/data.');
  if (!lstatSync(mount).isDirectory() || lstatSync(mount).isSymbolicLink())
    throw Error('Invalid Railway volume directory.');
  const file = resolve(env.DATABASE_PATH || '');
  if (dirname(file) !== mount || !/^[a-zA-Z0-9_-]+\.sqlite$/.test(basename(file)))
    throw Error('Railway DATABASE_PATH must be a direct /app/data/*.sqlite file.');
  return { mount, file, marker: `${mount}/.pixel-class-volume.json` };
}
/** Only the launcher runs as root. No recursive ownership changes or database writes. */
export function prepareVolumePermissions(env) {
  const { mount, file, marker } = paths(env);
  if (process.getuid() !== 0) return;
  chownSync(mount, 1000, 1000);
  chmodSync(mount, 0o700);
  for (const path of [file, `${file}-wal`, `${file}-shm`, marker]) {
    if (regular(path)) {
      chownSync(path, 1000, 1000);
      chmodSync(path, 0o600);
    }
  }
}
/** Must run before db.ts can create/open SQLite. Missing data is never silently reset. */
export function admitRailwayDatabase(env) {
  const { mount, file, marker } = paths(env);
  regular(`${file}-wal`);
  regular(`${file}-shm`);
  if (process.getuid() !== 1000) throw Error('Railway application must run as UID 1000.');
  const mode = env.DATABASE_MODE || 'existing';
  if (!['create', 'existing'].includes(mode))
    throw Error('DATABASE_MODE must be create or existing.');
  const markerStat = regular(marker);
  if (markerStat && JSON.parse(readFileSync(marker, 'utf8')).format !== 'pixel-class-volume-v1')
    throw Error('Invalid volume marker.');
  const stat = regular(file);
  if (stat) {
    if (stat.size < 100)
      throw Error('Existing SQLite is empty or invalid; restore a verified backup.');
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      if (Object.values(db.prepare('PRAGMA quick_check').get())[0] !== 'ok')
        throw Error('SQLite integrity check failed.');
      for (const table of ['users', 'sessions', 'records', 'invitations'])
        if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
          throw Error('Not an existing Pixel Class database.');
    } finally {
      db.close();
    }
    if (!markerStat && mode !== 'existing')
      throw Error('Use DATABASE_MODE=existing to adopt a restored database.');
  } else if (
    mode !== 'create' ||
    markerStat ||
    readdirSync(mount).some((name) => name !== 'lost+found')
  ) {
    throw Error(
      'Database missing: refusing to initialize an existing volume. Restore the database or explicitly provision a fresh volume.',
    );
  } else if (!env.MASTER_BOOTSTRAP_KEY || env.MASTER_BOOTSTRAP_KEY.trim().length < 32) {
    throw Error('A fresh database requires a strong MASTER_BOOTSTRAP_KEY.');
  }
  const probe = `${mount}/.write-probe-${randomBytes(8).toString('hex')}`;
  writeFileSync(probe, '', { flag: 'wx', mode: 0o600 });
  unlinkSync(probe);
  if (!markerStat)
    writeFileSync(
      marker,
      JSON.stringify({ format: 'pixel-class-volume-v1', initializedAt: new Date().toISOString() }),
      { flag: 'wx', mode: 0o600 },
    );
}
