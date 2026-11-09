import { isRailway, prepareVolumePermissions } from '../server/railway-volume.mjs';

// Railway mounts volumes as root. Grant only the data directory/files to the app,
// drop privileges, then replace PID 1 so SIGTERM reaches the existing drain handler.
if (isRailway(process.env)) {
  process.umask(0o077);
  prepareVolumePermissions(process.env);
  if (process.getuid() === 0) {
    process.setgroups([]);
    process.setgid(1000);
    process.setuid(1000);
  }
}
process.execve(
  process.execPath,
  [process.execPath, '--import', 'tsx', 'server/index.ts'],
  process.env,
);
