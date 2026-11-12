import { lstatSync } from 'node:fs';

/** A main-file digest cannot represent committed WAL or pending rollback data. */
export function assertStandaloneSnapshot(file) {
  for (const suffix of ['-wal', '-journal']) {
    let stat;
    try {
      stat = lstatSync(file + suffix);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 0)
      throw new Error(
        'Snapshot has pending WAL or rollback data. Create a new consistent backup before verification.',
      );
  }
}
