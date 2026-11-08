import type { DatabaseSync } from 'node:sqlite';
import type { RecordRepository } from './contracts.js';
export class SqliteRecordRepository implements RecordRepository {
  readonly backend = 'sqlite' as const;
  constructor(private database: DatabaseSync) {}
  list<T>(kind: string, schoolId: string): T[] {
    return (
      this.database
        .prepare('SELECT body FROM records WHERE kind=? AND school_id=? ORDER BY rowid')
        .all(kind, schoolId) as { body: string }[]
    ).map((row) => JSON.parse(row.body));
  }
  get<T>(kind: string, id: string, schoolId: string): T | undefined {
    const row = this.database
      .prepare('SELECT body FROM records WHERE id=? AND kind=? AND school_id=?')
      .get(id, kind, schoolId) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  put<T extends { id: string }>(kind: string, record: T, schoolId: string) {
    if ('schoolId' in record && record.schoolId !== schoolId) throw Error('School scope mismatch');
    const result = this.database
      .prepare(
        'INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body WHERE records.school_id=excluded.school_id AND records.kind=excluded.kind',
      )
      .run(record.id, schoolId, kind, JSON.stringify(record));
    if (!result.changes) throw Error('Record identifier belongs to a different scope');
  }
  remove(kind: string, id: string, schoolId: string) {
    this.database
      .prepare('DELETE FROM records WHERE id=? AND kind=? AND school_id=?')
      .run(id, kind, schoolId);
  }
}
